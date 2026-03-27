import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.DIAGNOSTICS_PORT || 4174);
const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));
const ARTIFACTS_DIR = path.join(ROOT_DIR, "artifacts");
const PRIVILEGED_GROUPS = new Set(["sudo", "wheel", "admin"]);

const COMMANDS = {
  osRelease: "cat /etc/os-release",
  kernel: "uname -srmo",
  network: "ip -brief address",
  memory: "free -h",
  storage: "df -h /",
  cupsActive: "systemctl is-active cups",
  cupsEnabled: "systemctl is-enabled cups",
  failedUnits: "systemctl --failed --no-legend --plain",
  lpstat: "lpstat -t",
  lpinfo: "lpinfo -v",
  lsusb: "lsusb",
  cupLogs: "journalctl -u cups --since '15 min ago' --no-pager -n 80"
};

const ACTIONS = {
  "collect-support-bundle": {
    id: "collect-support-bundle",
    title: "收集支持包",
    description: "打包系统快照、打印链路和关键日志，便于排障和导出。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      COMMANDS.osRelease,
      COMMANDS.network,
      COMMANDS.memory,
      COMMANDS.storage,
      COMMANDS.lpstat,
      COMMANDS.lpinfo,
      COMMANDS.lsusb,
      COMMANDS.cupLogs
    ]
  },
  "export-workorder": {
    id: "export-workorder",
    title: "导出诊断工单",
    description: "根据当前诊断结果生成 Markdown 工单，方便提交和协作。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      COMMANDS.osRelease,
      COMMANDS.failedUnits,
      COMMANDS.lpstat,
      COMMANDS.cupLogs
    ]
  },
  "clear-print-jobs": {
    id: "clear-print-jobs",
    title: "清空打印队列",
    description: "尝试取消当前用户可见的打印作业，缓解队列堆积。",
    module: "printer",
    risk: "moderate",
    requiresRoot: false,
    previewCommands: [
      "lpstat -t",
      "cancel -a"
    ]
  },
  "restart-cups-service": {
    id: "restart-cups-service",
    title: "重启 CUPS 服务",
    description: "尝试重启系统打印服务。通常需要管理员权限。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "systemctl is-active cups",
      "systemctl restart cups",
      "systemctl is-active cups"
    ]
  }
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function text(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

async function runShell(command, timeout = 7000) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], {
      timeout,
      maxBuffer: 1024 * 1024
    });

    return {
      ok: true,
      command,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      command,
      code: error.code ?? null,
      stdout: String(error.stdout || "").trim(),
      stderr: [String(error.stderr || "").trim(), error.message]
        .filter(Boolean)
        .join("\n")
        .trim()
    };
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function detectPrivilegeContext() {
  const currentUser = os.userInfo().username;
  const isRoot =
    typeof process.getuid === "function" ? process.getuid() === 0 : false;
  const [pkexecResult, sudoResult, sudoReadyResult, groupsResult] =
    await Promise.all([
      runShell("command -v pkexec"),
      runShell("command -v sudo"),
      runShell("sudo -n true"),
      runShell("id -nG")
    ]);

  const groups = (groupsResult.stdout || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hasPkexec = pkexecResult.ok && Boolean((pkexecResult.stdout || "").trim());
  const hasSudo = sudoResult.ok && Boolean((sudoResult.stdout || "").trim());
  const sudoNonInteractive = sudoReadyResult.ok;
  const likelySudoUser = groups.some((group) => PRIVILEGED_GROUPS.has(group));
  const hasGraphicalSession = Boolean(
    process.env.WAYLAND_DISPLAY || process.env.DISPLAY
  );
  const sessionType = process.env.WAYLAND_DISPLAY
    ? "wayland"
    : process.env.DISPLAY
      ? "x11"
      : "terminal";
  const availableMethods = [];

  if (isRoot) {
    availableMethods.push("direct");
  }

  if (hasPkexec) {
    availableMethods.push("pkexec");
  }

  if (hasSudo) {
    availableMethods.push(
      sudoNonInteractive
        ? "sudo-nopasswd"
        : likelySudoUser
          ? "sudo-password"
          : "sudo-unknown"
    );
  }

  let summary =
    "当前会话没有可直接复用的管理员执行链，系统级动作将退回到脚本导出。";
  let detail =
    "请在具备管理员权限的终端或桌面认证代理环境中执行待处理脚本。";

  if (isRoot) {
    summary = "当前 API 进程已经拥有 root 权限，可以直接执行系统级动作。";
    detail = `当前用户 ${currentUser} 以 root 身份运行，无需额外交互授权。`;
  } else if (sudoNonInteractive) {
    summary = "检测到 sudo 免密能力，API 可以直接下发系统级动作。";
    detail = "执行链路会使用 `sudo -n`，不会在运行中阻塞等待密码输入。";
  } else if (hasPkexec && hasGraphicalSession && hasSudo && likelySudoUser) {
    summary = "当前会话可通过 pkexec 或 sudo 密码完成授权。";
    detail = "优先推荐 pkexec 图形授权；如果桌面认证代理不可用，可以改走 sudo 终端授权。";
  } else if (hasPkexec && hasGraphicalSession) {
    summary = "当前会话可通过 pkexec 图形授权继续执行系统级动作。";
    detail = "执行时会生成待处理脚本，并附带可直接复制的 pkexec 启动命令。";
  } else if (hasSudo && likelySudoUser) {
    summary = "当前会话可以通过 sudo 密码授权继续执行系统级动作。";
    detail = "执行时会生成待处理脚本，并附带 sudo 启动命令。";
  }

  return {
    user: currentUser,
    groups,
    isRoot,
    hasPkexec,
    hasSudo,
    sudoNonInteractive,
    likelySudoUser,
    hasGraphicalSession,
    sessionType,
    availableMethods,
    summary,
    detail
  };
}

function summarizeAuthorization(action, privilegeContext) {
  if (!action.requiresRoot) {
    return {
      required: false,
      status: "not-required",
      canRunFromApi: true,
      preferredMethod: "direct",
      methods: ["direct"],
      summary: "当前动作不需要管理员权限，API 可以直接执行。",
      detail: "这类动作只读或仅影响当前用户可访问的打印队列。"
    };
  }

  if (privilegeContext.isRoot) {
    return {
      required: true,
      status: "granted",
      canRunFromApi: true,
      preferredMethod: "direct",
      methods: ["direct"],
      summary: "当前 API 进程已经拥有管理员权限，可以直接执行。",
      detail: "系统级动作会立即修改服务状态，请先确认影响范围。"
    };
  }

  if (privilegeContext.sudoNonInteractive) {
    return {
      required: true,
      status: "granted",
      canRunFromApi: true,
      preferredMethod: "sudo-nopasswd",
      methods: ["sudo-nopasswd"],
      summary: "检测到 sudo 免密能力，API 可以直接执行系统级动作。",
      detail: "执行链路会使用 `sudo -n`，不会弹出密码交互。"
    };
  }

  const methods = [];

  if (privilegeContext.hasPkexec) {
    methods.push("pkexec");
  }

  if (privilegeContext.hasSudo && privilegeContext.likelySudoUser) {
    methods.push("sudo-password");
  }

  if (methods.length > 0) {
    const preferredMethod =
      privilegeContext.hasPkexec && privilegeContext.hasGraphicalSession
        ? "pkexec"
        : methods[0];

    return {
      required: true,
      status: "interactive",
      canRunFromApi: false,
      preferredMethod,
      methods,
      summary:
        preferredMethod === "pkexec"
          ? "该动作需要人工授权。当前环境适合先走 pkexec 图形授权。"
          : "该动作需要人工授权。当前环境适合走 sudo 终端授权。",
      detail:
        methods.includes("pkexec") && methods.includes("sudo-password")
          ? "如果 pkexec 没有拉起认证代理，可以改用 sudo 密码方案。"
          : methods.includes("pkexec")
            ? "点击执行后会生成待处理脚本和可复制的 pkexec 启动命令。"
            : "点击执行后会生成待处理脚本和可复制的 sudo 启动命令。"
    };
  }

  return {
    required: true,
    status: "unavailable",
    canRunFromApi: false,
    preferredMethod: null,
    methods: [],
    summary: "当前 API 会话没有可直接使用的提权链路，只能导出待执行脚本。",
    detail: "请在管理员终端或具备 polkit 认证代理的桌面会话中运行脚本。"
  };
}

function buildPrivilegeContextView(privilegeContext) {
  return {
    user: privilegeContext.user,
    sessionType: privilegeContext.sessionType,
    hasGraphicalSession: privilegeContext.hasGraphicalSession,
    availableMethods: privilegeContext.availableMethods,
    summary: privilegeContext.summary,
    detail: privilegeContext.detail
  };
}

function parseEnvFile(raw) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((accumulator, line) => {
      const separator = line.indexOf("=");

      if (separator === -1) {
        return accumulator;
      }

      const key = line.slice(0, separator);
      const value = line
        .slice(separator + 1)
        .replace(/^"/, "")
        .replace(/"$/, "");

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function normalizeDistro(prettyName) {
  const label = prettyName.toLowerCase();

  if (label.includes("deepin 25")) {
    return "deepin 25";
  }

  if (label.includes("deepin 23.1")) {
    return "deepin 23.1";
  }

  if (label.includes("uos")) {
    return "UOS 1070";
  }

  return prettyName;
}

function parseOsRelease(raw, kernelRaw) {
  const parsed = parseEnvFile(raw);
  const prettyName = parsed.PRETTY_NAME || parsed.NAME || "Unknown Linux";

  return {
    prettyName,
    distro: normalizeDistro(prettyName),
    id: parsed.ID || "linux",
    version: parsed.VERSION_ID || parsed.VERSION || "unknown",
    kernel: kernelRaw.trim(),
    architecture: os.arch(),
    commandFamily: "apt + systemd + CUPS",
    raw: raw.trim()
  };
}

function parseLpinfo(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const uriLines = lines.map((line) => {
    const separator = line.indexOf(" ");
    return separator === -1 ? line : line.slice(separator + 1);
  });
  const deviceUris = uriLines.filter(
    (line) =>
      line.includes("://") ||
      line.startsWith("file:/") ||
      line.startsWith("cups-brf:/")
  );

  const hasUsb = deviceUris.some((line) => line.includes("usb://"));
  const hasNetwork = deviceUris.some(
    (line) =>
      line.startsWith("socket://") ||
      line.startsWith("ipp://") ||
      line.startsWith("ipps://") ||
      line.startsWith("lpd://") ||
      line.startsWith("dnssd://")
  );
  const hasVirtual = deviceUris.some(
    (line) =>
      line.includes("localhost") ||
      line.startsWith("file:/") ||
      line.startsWith("ipp://localhost") ||
      line.startsWith("cups-brf:/")
  );

  return {
    lines,
    uriLines,
    deviceUris,
    connectionGuess: hasUsb
      ? "USB"
      : hasNetwork
        ? "Network"
        : hasVirtual
          ? "Virtual Queue"
          : "",
    raw: raw.trim()
  };
}

function parseLpstat(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const defaultMatch = raw.match(/system default destination:\s*(.+)/i);
  const printerNames = Array.from(
    raw.matchAll(/^printer\s+([^\s]+)\s+/gim),
    (match) => match[1]
  );
  const queueBlocked =
    /(paused|stopped|not accepting|offline|unable|held|filter failed)/i.test(raw);
  const filterFailed = /filter failed/i.test(raw);

  return {
    lines,
    printers: printerNames,
    defaultPrinter: defaultMatch?.[1]?.trim() || "",
    queueBlocked,
    filterFailed,
    raw: raw.trim()
  };
}

function parseUsb(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const brotherDevices = lines.filter((line) => /brother/i.test(line));

  return {
    lines,
    deviceCount: lines.length,
    brotherDevices,
    raw: raw.trim()
  };
}

function parseLogs(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    lines,
    recent: lines.slice(-12),
    filterFailed: /filter failed/i.test(raw),
    permissionDenied: /permission denied/i.test(raw),
    raw: raw.trim()
  };
}

function parseNetwork(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const liveLines = lines.filter(
    (line) => !line.startsWith("lo") && /\bUP\b/.test(line)
  );

  return {
    lines,
    liveLines,
    online: liveLines.length > 0,
    summary:
      liveLines.length > 0
        ? liveLines.slice(0, 2).join(" | ")
        : "No active non-loopback interface"
  };
}

function parseMemory(raw) {
  const lines = raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const line =
    lines.find((item) => item.startsWith("Mem:")) ||
    lines.find((item) => item.startsWith("内存")) ||
    lines[1] ||
    lines[0] ||
    "";
  const columns = line.split(/\s+/);

  return {
    total: columns[1] || "unknown",
    used: columns[2] || "unknown",
    free: columns[3] || "unknown",
    summary: line || raw.trim()
  };
}

function parseStorage(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLine = lines[1] || "";
  const columns = dataLine.split(/\s+/);

  return {
    filesystem: columns[0] || "unknown",
    size: columns[1] || "unknown",
    used: columns[2] || "unknown",
    available: columns[3] || "unknown",
    usePercent: columns[4] || "unknown",
    mountpoint: columns[5] || "/",
    summary: dataLine || raw.trim()
  };
}

function parseFailedUnits(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    lines,
    count: lines.filter((line) => !line.startsWith("0 loaded units listed")).length,
    summary:
      lines.length === 0 || lines[0].startsWith("0 loaded units listed")
        ? "No failed units"
        : `${lines.length} failed units`
  };
}

function detectDevice(usb, lpinfo, lpstat) {
  if (usb.brotherDevices.length > 0 || /brother|label/i.test(lpinfo.raw)) {
    return "标签打印机";
  }

  if (lpinfo.connectionGuess === "Network") {
    return "网络打印机";
  }

  if (lpstat.printers.length > 0) {
    return "激光打印机";
  }

  return "";
}

function detectSymptom(lpstat, logs, printerDetected) {
  if (logs.filterFailed || lpstat.filterFailed) {
    return "驱动 / 过滤链异常";
  }

  if (lpstat.queueBlocked) {
    return "打印队列卡住";
  }

  if (!printerDetected && lpstat.printers.length === 0) {
    return "无法识别设备";
  }

  if (/media|label|paper|pagesize/i.test(`${logs.raw}\n${lpstat.raw}`)) {
    return "纸宽或输出异常";
  }

  return "打印队列卡住";
}

function buildRecommendations(symptom) {
  const base = {
    无法识别设备: [
      "lsusb",
      "dmesg | tail -n 40",
      "lpinfo -v"
    ],
    打印队列卡住: [
      "lpstat -t",
      "cancel -a",
      "sudo systemctl restart cups"
    ],
    "驱动 / 过滤链异常": [
      "lpstat -p -d",
      "journalctl -u cups --since '30 min ago'",
      "sudo apt reinstall cups printer-driver-all"
    ],
    "纸宽或输出异常": [
      "lpoptions -p printer_name -l",
      "lpstat -t",
      "journalctl -u cups --since '15 min ago'"
    ]
  };

  return base[symptom] || base["打印队列卡住"];
}

function commandPreview(name, result) {
  const lines = (result.stdout || result.stderr || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    name,
    ok: result.ok,
    command: result.command,
    preview: lines,
    stderr: result.ok ? "" : result.stderr
  };
}

function buildActionList(privilegeContext) {
  return Object.values(ACTIONS).map((action) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    module: action.module,
    risk: action.risk,
    requiresRoot: action.requiresRoot,
    previewCommands: action.previewCommands,
    authorization: summarizeAuthorization(action, privilegeContext)
  }));
}

function actionWarnings(action, authorization) {
  const warnings = [];

  if (authorization.required) {
    warnings.push("该动作通常需要管理员权限，普通用户执行可能失败。");
  }

  if (action.risk === "moderate") {
    warnings.push("该动作会改变当前打印队列状态，执行前请确认没有正在进行的重要作业。");
  }

  if (action.risk === "privileged") {
    warnings.push("该动作会修改系统服务状态，建议先做支持包或工单导出。");
  }

  if (authorization.status === "interactive") {
    warnings.push("当前 API 不会代填管理员密码；执行时会返回授权命令或待处理脚本。");
  }

  if (authorization.status === "unavailable") {
    warnings.push("当前会话缺少直接提权链路，执行时只会生成脚本，不会立即修改系统。");
  }

  return warnings;
}

function timelineEvent(status, title, detail) {
  return {
    at: new Date().toISOString(),
    status,
    title,
    detail
  };
}

function rollbackSuggestions(actionId) {
  const suggestions = {
    "collect-support-bundle": [
      "支持包是只读导出，不需要回滚。",
      "如果内容过期，重新采集一份新的支持包即可。"
    ],
    "export-workorder": [
      "工单导出是只读动作，不需要回滚。",
      "如果环境已经变化，重新导出一份新的工单覆盖旧结论。"
    ],
    "clear-print-jobs": [
      "如果误清了作业，需要让业务侧重新提交打印任务。",
      "如果清空后队列仍异常，建议立即重新采集诊断并检查 CUPS 日志。"
    ],
    "restart-cups-service": [
      "如果重启后服务未恢复，先查看 `systemctl status cups` 和 `journalctl -u cups`。",
      "如果确认是权限问题，改用具备管理员权限的环境重试，而不是反复触发重启。"
    ]
  };

  return suggestions[actionId] || [
    "如果动作执行后结果不符合预期，先重新采集诊断再决定下一步。"
  ];
}

function artifactTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeArtifact(subdir, filename, contents) {
  const directory = path.join(ARTIFACTS_DIR, subdir);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, contents, "utf8");
  return filePath;
}

async function writeExecutableArtifact(subdir, filename, contents) {
  const filePath = await writeArtifact(subdir, filename, contents);
  await chmod(filePath, 0o755);
  return filePath;
}

function manualExecutionPaths(id) {
  return {
    scriptPath: path.join(ARTIFACTS_DIR, "pending-actions", `${id}.sh`),
    receiptPath: path.join(ARTIFACTS_DIR, "manual-runs", `${id}.json`),
    logPath: path.join(ARTIFACTS_DIR, "manual-runs", `${id}.log`)
  };
}

async function writeActionLog(result) {
  const filename = `action-${result.action.id}-${artifactTimestamp()}.json`;
  return writeArtifact("action-runs", filename, JSON.stringify(result, null, 2));
}

function buildWorkorderMarkdown(diagnostics) {
  const printerSection =
    diagnostics.printers.queues.length > 0
      ? diagnostics.printers.queues.join(", ")
      : "No configured queue";

  return [
    "# Orbit Deepin Assistant Diagnostic Workorder",
    "",
    `- Generated: ${diagnostics.timestamp}`,
    `- Host: ${diagnostics.host.hostname}`,
    `- User: ${diagnostics.host.user}`,
    `- Distro: ${diagnostics.system.prettyName}`,
    `- Kernel: ${diagnostics.system.kernel}`,
    `- Network: ${diagnostics.network.summary}`,
    `- Memory: ${diagnostics.resources.memory.used} / ${diagnostics.resources.memory.total}`,
    `- Storage: ${diagnostics.resources.storage.summary}`,
    `- Failed Units: ${diagnostics.services.failedUnits.count}`,
    `- CUPS Active: ${diagnostics.services.cupsActive}`,
    `- CUPS Enabled: ${diagnostics.services.cupsEnabled}`,
    `- Printer Queues: ${printerSection}`,
    `- Connection Guess: ${diagnostics.inference.connection || "unknown"}`,
    `- Device Guess: ${diagnostics.inference.device || "unknown"}`,
    `- Symptom Guess: ${diagnostics.inference.symptom}`,
    "",
    "## Inference Note",
    "",
    diagnostics.inference.note,
    "",
    "## Recommended Commands",
    "",
    ...diagnostics.recommendations.map((item) => `- \`${item}\``),
    "",
    "## Recent Command Preview",
    "",
    ...diagnostics.commands.map((item) => {
      const preview = item.preview.join("\n") || item.stderr || "No output";
      return [`### ${item.name}`, "", "```text", preview, "```", ""].join("\n");
    })
  ].join("\n");
}

function buildPendingActionScript(action, diagnostics, manualExecution) {
  if (action.id === "restart-cups-service") {
    return [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      "",
      "# Generated by Orbit Deepin Assistant",
      `# Action: ${action.id}`,
      `# GeneratedAt: ${new Date().toISOString()}`,
      `# Host: ${diagnostics.host.hostname}`,
      `# Distro: ${diagnostics.system.prettyName}`,
      "",
      `HANDOFF_ID=${shellQuote(manualExecution.id)}`,
      `RECEIPT_PATH=${shellQuote(manualExecution.receiptArtifact.path)}`,
      `LOG_PATH=${shellQuote(manualExecution.runtimeLog.path)}`,
      "",
      "json_escape() {",
      "  printf '%s' \"$1\" | sed ':a;N;$!ba;s/\\\\/\\\\\\\\/g;s/\"/\\\\\"/g;s/\\n/\\\\n/g'",
      "}",
      "",
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      "PRECHECK=\"$(systemctl is-active cups 2>&1 || true)\"",
      "echo \"[Orbit] Pre-check: $PRECHECK\"",
      "RESTART_OK=true",
      "echo \"[Orbit] Restarting CUPS service\"",
      "if ! systemctl restart cups; then",
      "  RESTART_OK=false",
      "fi",
      "POSTCHECK=\"$(systemctl is-active cups 2>&1 || true)\"",
      "echo \"[Orbit] Post-check: $POSTCHECK\"",
      "echo \"[Orbit] Recent CUPS logs\"",
      "journalctl -u cups --since '5 min ago' --no-pager -n 40 || true",
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "STATUS=failed",
      "if [ \"$RESTART_OK\" = \"true\" ] && [ \"$POSTCHECK\" = \"active\" ]; then",
      "  STATUS=completed",
      "fi",
      "cat > \"$RECEIPT_PATH\" <<EOF",
      "{",
      "  \"id\": \"$HANDOFF_ID\",",
      `  "actionId": "${action.id}",`,
      "  \"status\": \"$STATUS\",",
      "  \"startedAt\": \"$STARTED_AT\",",
      "  \"finishedAt\": \"$FINISHED_AT\",",
      "  \"executedBy\": \"$(json_escape \"$EXECUTED_BY\")\",",
      "  \"preCheck\": \"$(json_escape \"$PRECHECK\")\",",
      "  \"postCheck\": \"$(json_escape \"$POSTCHECK\")\",",
      "  \"logPath\": \"$(json_escape \"$LOG_PATH\")\"",
      "}",
      "EOF",
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Generated by Orbit Deepin Assistant",
    `# Action: ${action.id}`,
    `# GeneratedAt: ${new Date().toISOString()}`
  ].join("\n");
}

async function createManualExecutionPlan(action, authorization, diagnostics) {
  const id = `manual-${action.id}-${artifactTimestamp()}`;
  const paths = manualExecutionPaths(id);
  await mkdir(path.dirname(paths.receiptPath), { recursive: true });
  const filename = `${id}.sh`;
  const manualExecution = {
    id,
    status: "pending",
    pollPath: `/api/manual-actions/${encodeURIComponent(id)}`,
    receiptArtifact: {
      path: paths.receiptPath,
      type: "application/json"
    },
    runtimeLog: {
      path: paths.logPath,
      type: "text/plain"
    }
  };
  const scriptPath = await writeExecutableArtifact(
    "pending-actions",
    filename,
    buildPendingActionScript(action, diagnostics, manualExecution)
  );
  const launchers = [];

  if (authorization.methods.includes("pkexec")) {
    launchers.push({
      id: "pkexec",
      label: "pkexec 授权",
      command: `pkexec ${shellQuote(scriptPath)}`,
      description: "通过图形授权运行待处理脚本。"
    });
  }

  if (
    authorization.methods.includes("sudo-password") ||
    authorization.methods.includes("sudo-nopasswd")
  ) {
    launchers.push({
      id: "sudo",
      label: "sudo 终端",
      command: `sudo ${shellQuote(scriptPath)}`,
      description: "在终端输入管理员密码后执行脚本。"
    });
  }

  if (launchers.length === 0) {
    launchers.push({
      id: "root-shell",
      label: "root shell",
      command: `bash ${shellQuote(scriptPath)}`,
      description: "在 root 终端或其他管理员环境中执行该脚本。"
    });
  }

  return {
    ...manualExecution,
    summary: "本次没有直接修改系统，已生成待授权执行脚本。",
    detail: authorization.detail,
    artifact: {
      path: scriptPath,
      type: "application/x-sh"
    },
    launchers,
    steps: [
      "任选一条启动命令在本机终端执行。",
      "授权完成后，脚本会自动做预检、重启 CUPS 并输出 post-check 状态。",
      "脚本执行结束后，回到助手界面重新采集一次真实快照。"
    ]
  };
}

async function readManualExecutionState(id) {
  const paths = manualExecutionPaths(id);

  try {
    const raw = await readFile(paths.receiptPath, "utf8");
    const receipt = JSON.parse(raw);

    return {
      id,
      status: receipt.status || "completed",
      checkedAt: new Date().toISOString(),
      receipt,
      receiptArtifact: {
        path: paths.receiptPath,
        type: "application/json"
      },
      runtimeLog: {
        path: paths.logPath,
        type: "text/plain"
      }
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        id,
        status: "pending",
        checkedAt: new Date().toISOString(),
        receipt: null,
        receiptArtifact: {
          path: paths.receiptPath,
          type: "application/json"
        },
        runtimeLog: {
          path: paths.logPath,
          type: "text/plain"
        }
      };
    }

    throw error;
  }
}

async function executeAction(actionId, mode = "preview") {
  const action = ACTIONS[actionId];

  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }

  const timeline = [
    timelineEvent("queued", "Action received", `${action.title} 已进入处理队列。`)
  ];
  const [diagnostics, privilegeContext] = await Promise.all([
    collectDiagnostics(),
    detectPrivilegeContext()
  ]);
  const authorization = summarizeAuthorization(action, privilegeContext);
  timeline.push(
    timelineEvent(
      "ok",
      "Diagnostics captured",
      "已获取系统、网络、资源、打印链路和日志快照。"
    )
  );
  const base = {
    action: {
      id: action.id,
      title: action.title,
      description: action.description,
      module: action.module,
      risk: action.risk,
      requiresRoot: action.requiresRoot
    },
    mode,
    state: mode === "run" ? "completed" : "preview",
    executedAt: new Date().toISOString(),
    warnings: actionWarnings(action, authorization),
    rollbackSuggestions: rollbackSuggestions(action.id),
    previewCommands: action.previewCommands,
    authorization,
    diagnostics,
    timeline
  };

  if (mode !== "run") {
    if (authorization.status === "interactive") {
      timeline.push(
        timelineEvent(
          "warning",
          "Authorization required",
          "预览完成。真正执行时会先返回授权命令和待处理脚本。"
        )
      );
    }

    if (authorization.status === "unavailable") {
      timeline.push(
        timelineEvent(
          "warning",
          "Manual execution only",
          "预览完成。当前会话没有提权链路，真正执行时只会导出脚本。"
        )
      );
    }

    timeline.push(
      timelineEvent(
        "preview",
        "Preview generated",
        "动作尚未执行，当前仅返回影响范围、建议和命令预览。"
      )
    );
    return {
      ...base,
      ok: true,
      summary: "Preview ready",
      followUp: [
        "先确认动作影响范围和权限要求。",
        authorization.required && !authorization.canRunFromApi
          ? "如果继续执行，系统会先给出授权命令或导出待处理脚本。"
          : "如果动作会修改系统状态，建议先收集支持包。"
      ]
    };
  }

  if (actionId === "collect-support-bundle") {
    const filename = `support-bundle-${artifactTimestamp()}.json`;
    const filePath = await writeArtifact(
      "support-bundles",
      filename,
      JSON.stringify(diagnostics, null, 2)
    );
    timeline.push(
      timelineEvent(
        "ok",
        "Support bundle exported",
        `支持包已写入 ${filePath}`
      )
    );

    const result = {
      ...base,
      ok: true,
      state: "completed",
      summary: "Support bundle exported",
      artifact: {
        path: filePath,
        type: "application/json"
      },
      followUp: [
        "可以把这个 JSON 作为排障附件使用。",
        "如果还要给他人查看，建议再导出 Markdown 工单。"
      ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "export-workorder") {
    const filename = `diagnostic-workorder-${artifactTimestamp()}.md`;
    const markdown = buildWorkorderMarkdown(diagnostics);
    const filePath = await writeArtifact("workorders", filename, markdown);
    timeline.push(
      timelineEvent(
        "ok",
        "Workorder exported",
        `诊断工单已写入 ${filePath}`
      )
    );

    const result = {
      ...base,
      ok: true,
      state: "completed",
      summary: "Diagnostic workorder exported",
      artifact: {
        path: filePath,
        type: "text/markdown"
      },
      followUp: [
        "这份工单适合直接发给协作者或贴到 issue。",
        "如果后续执行修复动作，建议重新导出一份工单做前后对比。"
      ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "clear-print-jobs") {
    if (diagnostics.printers.queues.length === 0) {
      timeline.push(
        timelineEvent(
          "skip",
          "No print queue detected",
          "当前没有检测到打印队列，因此跳过清空动作。"
        )
      );
      const result = {
        ...base,
        ok: true,
        state: "skipped",
        summary: "No print queues found, nothing to clear",
        commandResult: {
          command: "cancel -a",
          ok: true,
          stdout: "",
          stderr: "No configured queues"
        },
        followUp: [
          "当前没有检测到打印队列。",
          "如果设备仍不可用，先回到链路诊断。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const commandResult = await runShell("cancel -a");
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Queue clear attempted",
        commandResult.ok
          ? "已尝试取消当前打印作业。"
          : "清空打印队列失败。"
      )
    );

    const result = {
      ...base,
      ok: commandResult.ok,
      state: commandResult.ok ? "completed" : "failed",
      summary: commandResult.ok
        ? "Print jobs cleared"
        : "Failed to clear print jobs",
      commandResult,
      followUp: commandResult.ok
        ? [
            "建议立即重新采集一次诊断，确认队列状态是否恢复。",
            "如果仍然 blocked，再考虑重启 CUPS。"
          ]
        : [
            "如果错误是权限或目标不存在，先确认当前队列是否真实存在。",
            "必要时改走工单导出或支持包收集。"
          ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "restart-cups-service") {
    if (!authorization.canRunFromApi) {
      const manualExecution = await createManualExecutionPlan(
        action,
        authorization,
        diagnostics
      );
      timeline.push(
        timelineEvent(
          "blocked",
          "Authorization handoff generated",
          "当前 API 进程没有直接执行权限，已生成待处理脚本和授权命令。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: "Authorization required before restarting CUPS",
        artifact: manualExecution.artifact,
        manualExecution,
        followUp: [
          "复制下方任一授权命令，在本机终端完成一次人工授权。",
          "脚本执行完成后，重新采集诊断，确认 CUPS 状态和队列状态。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const restartCommand =
      authorization.preferredMethod === "sudo-nopasswd"
        ? "sudo -n systemctl restart cups"
        : "systemctl restart cups";
    const postCheckCommand =
      authorization.preferredMethod === "sudo-nopasswd"
        ? "sudo -n systemctl is-active cups"
        : "systemctl is-active cups";
    const commandResult = await runShell(restartCommand);
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Restart attempted",
        commandResult.ok
          ? "已发起 CUPS 服务重启。"
          : "CUPS 服务重启命令执行失败。"
      )
    );
    const postCheck = await runShell(postCheckCommand);
    timeline.push(
      timelineEvent(
        (postCheck.stdout || "").trim() === "active" ? "ok" : "warning",
        "Post-check completed",
        `重启后服务状态为 ${(postCheck.stdout || "").trim() || "unknown"}。`
      )
    );

    const result = {
      ...base,
      ok: commandResult.ok && (postCheck.stdout || "").trim() === "active",
      state:
        commandResult.ok && (postCheck.stdout || "").trim() === "active"
          ? "completed"
          : "failed",
      summary:
        commandResult.ok && (postCheck.stdout || "").trim() === "active"
          ? "CUPS restarted successfully"
          : "Failed to restart CUPS",
      commandResult,
      postCheck,
      followUp:
        commandResult.ok && (postCheck.stdout || "").trim() === "active"
        ? [
            "建议重新采集一次诊断，确认队列和服务状态已经刷新。",
            "如果问题仍在，再进一步处理驱动或过滤链。"
          ]
        : [
            "如果返回权限错误，说明当前用户不能直接重启系统服务。",
            "先导出工单，再在具备管理员权限的环境执行该动作。"
          ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  throw new Error(`Action handler missing: ${actionId}`);
}

async function collectDiagnostics() {
  const [
    osReleaseResult,
    kernelResult,
    networkResult,
    memoryResult,
    storageResult,
    cupsActiveResult,
    cupsEnabledResult,
    failedUnitsResult,
    lpstatResult,
    lpinfoResult,
    lsusbResult,
    cupLogsResult
  ] = await Promise.all([
    runShell(COMMANDS.osRelease),
    runShell(COMMANDS.kernel),
    runShell(COMMANDS.network),
    runShell(COMMANDS.memory),
    runShell(COMMANDS.storage),
    runShell(COMMANDS.cupsActive),
    runShell(COMMANDS.cupsEnabled),
    runShell(COMMANDS.failedUnits),
    runShell(COMMANDS.lpstat),
    runShell(COMMANDS.lpinfo),
    runShell(COMMANDS.lsusb),
    runShell(COMMANDS.cupLogs, 9000)
  ]);

  const system = parseOsRelease(osReleaseResult.stdout, kernelResult.stdout);
  const lpinfo = parseLpinfo(lpinfoResult.stdout);
  const lpstat = parseLpstat(lpstatResult.stdout);
  const usb = parseUsb(lsusbResult.stdout);
  const logs = parseLogs(cupLogsResult.stdout || cupLogsResult.stderr);
  const network = parseNetwork(networkResult.stdout);
  const memory = parseMemory(memoryResult.stdout);
  const storage = parseStorage(storageResult.stdout);
  const failedUnits = parseFailedUnits(failedUnitsResult.stdout || failedUnitsResult.stderr);
  const device = detectDevice(usb, lpinfo, lpstat);
  const connection = lpinfo.connectionGuess;
  const printerDetected = Boolean(device) || lpstat.printers.length > 0;
  const symptom = detectSymptom(lpstat, logs, printerDetected);

  return {
    timestamp: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      user: os.userInfo().username
    },
    system,
    network,
    resources: {
      memory,
      storage
    },
    services: {
      cupsActive: cupsActiveResult.stdout || "unknown",
      cupsEnabled: cupsEnabledResult.stdout || "unknown",
      failedUnits,
      summary:
        (cupsActiveResult.stdout || "").trim() === "active"
          ? "CUPS is active"
          : "CUPS is not active"
    },
    printers: {
      defaultPrinter: lpstat.defaultPrinter,
      queues: lpstat.printers,
      queueBlocked: lpstat.queueBlocked,
      filterFailed: lpstat.filterFailed,
      connection,
      uriCount: lpinfo.deviceUris.length,
      uriSample: lpinfo.deviceUris.slice(0, 4),
      summary:
        lpstat.printers.length > 0
          ? `${lpstat.printers.length} queue(s) detected`
          : "No configured print queue found"
    },
    usb: {
      deviceCount: usb.deviceCount,
      brotherDevices: usb.brotherDevices.slice(0, 4),
      sample: usb.lines.slice(0, 6)
    },
    logs: {
      recent: logs.recent,
      filterFailed: logs.filterFailed,
      permissionDenied: logs.permissionDenied
    },
    inference: {
      distro: system.distro,
      device,
      connection,
      symptom,
      note:
        symptom === "驱动 / 过滤链异常"
          ? "日志里已经出现过滤链风险，建议直接进入驱动与过滤链修复。"
        : symptom === "打印队列卡住"
            ? "当前更像队列或旧作业阻塞，不要一开始就重装驱动。"
            : symptom === "无法识别设备"
              ? "系统侧尚未稳定识别设备，优先收敛链路和枚举。"
              : "优先检查纸宽、页面大小和标签模板参数。"
    },
    recommendations: buildRecommendations(symptom),
    commands: [
      commandPreview("osRelease", osReleaseResult),
      commandPreview("network", networkResult),
      commandPreview("memory", memoryResult),
      commandPreview("storage", storageResult),
      commandPreview("cupsActive", cupsActiveResult),
      commandPreview("failedUnits", failedUnitsResult),
      commandPreview("lpstat", lpstatResult),
      commandPreview("lpinfo", lpinfoResult),
      commandPreview("lsusb", lsusbResult),
      commandPreview("cupLogs", cupLogsResult)
    ]
  };
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    text(res, 404, "Missing URL");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      service: "orbit-deepin-assistant-api",
      port: PORT
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/diagnostics/summary") {
    try {
      const diagnostics = await collectDiagnostics();
      json(res, 200, { ok: true, diagnostics });
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/actions") {
    const privilegeContext = await detectPrivilegeContext();
    json(res, 200, {
      ok: true,
      actions: buildActionList(privilegeContext),
      privilegeContext: buildPrivilegeContextView(privilegeContext)
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/manual-actions/")) {
    try {
      const id = decodeURIComponent(
        url.pathname.replace("/api/manual-actions/", "")
      );
      const manualExecution = await readManualExecutionState(id);
      json(res, 200, {
        ok: true,
        manualExecution
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/actions/")) {
    try {
      const actionId = decodeURIComponent(url.pathname.replace("/api/actions/", ""));
      const body = await readJsonBody(req);
      const mode = body.mode === "run" ? "run" : "preview";
      const result = await executeAction(actionId, mode);
      json(res, 200, {
        ok: true,
        result
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  text(res, 404, "Orbit Deepin Assistant API");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Orbit diagnostics API listening on http://127.0.0.1:${PORT}`);
});
