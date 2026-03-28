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
const CORE_PRINT_PACKAGES = [
  "cups",
  "cups-client",
  "cups-filters",
  "printer-driver-all"
];
const PPD_PATCH_INPUT_SCHEMA = [
  {
    id: "queueName",
    label: "Queue Name",
    placeholder: "printer_name",
    defaultValue: "printer_name",
    required: true
  },
  {
    id: "ppdPath",
    label: "PPD Path",
    placeholder: "/etc/cups/ppd/<queue-name>.ppd",
    defaultValue: "/etc/cups/ppd/<queue-name>.ppd",
    required: true
  },
  {
    id: "pageSizeKey",
    label: "PageSize Key",
    placeholder: "62mm"
  },
  {
    id: "paperDimension",
    label: "PaperDimension",
    placeholder: "176 425"
  },
  {
    id: "imageableArea",
    label: "ImageableArea",
    placeholder: "0 0 176 425"
  },
  {
    id: "resolution",
    label: "Resolution",
    placeholder: "300dpi"
  },
  {
    id: "mediaType",
    label: "MediaType",
    placeholder: "Label"
  }
];
const PPD_BIND_INPUT_SCHEMA = [
  {
    id: "queueName",
    label: "Queue Name",
    placeholder: "printer_name",
    defaultValue: "printer_name",
    required: true
  },
  {
    id: "patchedPpdPath",
    label: "Patched PPD Path",
    placeholder: "/path/to/patched-copy.ppd",
    defaultValue: "",
    required: true
  }
];
const QUEUE_BLUEPRINT_INPUT_SCHEMA = [
  {
    id: "queueName",
    label: "Queue Name",
    placeholder: "label-printer",
    defaultValue: "label-printer",
    required: true
  },
  {
    id: "deviceUri",
    label: "Device URI",
    placeholder: "usb://Vendor/Model?serial=<serial>",
    defaultValue: "",
    required: true
  },
  {
    id: "driverModel",
    label: "Driver Model",
    placeholder: "everywhere",
    defaultValue: "everywhere",
    required: true
  },
  {
    id: "setDefault",
    label: "Set Default",
    placeholder: "yes / no",
    defaultValue: "yes"
  }
];
const QUEUE_ONLY_INPUT_SCHEMA = [
  {
    id: "queueName",
    label: "Queue Name",
    placeholder: "printer_name",
    defaultValue: "printer_name",
    required: true
  }
];
const PPD_ROLLBACK_INPUT_SCHEMA = [
  {
    id: "queueName",
    label: "Queue Name",
    placeholder: "printer_name",
    defaultValue: "printer_name",
    required: true
  },
  {
    id: "backupPpdPath",
    label: "Backup PPD Path",
    placeholder: "/path/to/backup.ppd",
    defaultValue: "",
    required: true
  }
];

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
  "export-queue-blueprint": {
    id: "export-queue-blueprint",
    title: "导出打印队列蓝图",
    description: "生成可编辑的队列重建蓝图、URI 模板和 lpadmin 命令模板。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      COMMANDS.lpinfo,
      COMMANDS.lpstat,
      COMMANDS.osRelease
    ]
  },
  "apply-queue-blueprint": {
    id: "apply-queue-blueprint",
    title: "按蓝图创建打印队列",
    description: "使用设备 URI、队列名和驱动模型创建真实打印队列，并可选设为默认打印机。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "lpadmin -p <queue> -E -v <device-uri> -m <driver-model>",
      "lpoptions -d <queue>",
      "lpstat -p <queue> -l"
    ],
    inputSchema: QUEUE_BLUEPRINT_INPUT_SCHEMA
  },
  "export-ppd-tuning-plan": {
    id: "export-ppd-tuning-plan",
    title: "导出 PPD 微调方案",
    description: "生成 PPD 备份、验证、参数微调和回滚建议模板。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      COMMANDS.lpstat,
      COMMANDS.lpinfo,
      COMMANDS.cupLogs
    ]
  },
  "generate-ppd-patch-blueprint": {
    id: "generate-ppd-patch-blueprint",
    title: "生成 PPD 补丁蓝图",
    description: "根据输入参数生成具体的 PPD 修改项、验证命令和应用脚本模板。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      "cupstestppd -W translations /tmp/<queue>.ppd",
      "lpadmin -p <queue> -P /tmp/<queue>.ppd",
      "rg -n '^\\*DefaultPageSize|^\\*PaperDimension|^\\*ImageableArea|^\\*DefaultResolution'"
    ],
    inputSchema: PPD_PATCH_INPUT_SCHEMA
  },
  "validate-ppd-patch-copy": {
    id: "validate-ppd-patch-copy",
    title: "验证 PPD 补丁副本",
    description: "在 artifacts 中创建 PPD 临时副本，套用补丁并返回差异预览与校验结果。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      "read source PPD",
      "apply patch on artifact copy",
      "rg -n '^\\*DefaultPageSize|^\\*PaperDimension|^\\*ImageableArea|^\\*DefaultResolution' <patched-copy>",
      "cupstestppd -W translations <patched-copy>"
    ],
    inputSchema: PPD_PATCH_INPUT_SCHEMA
  },
  "apply-validated-ppd-copy": {
    id: "apply-validated-ppd-copy",
    title: "回绑补丁 PPD 到队列",
    description: "对已验证的 PPD 副本做最终复核，并通过 lpadmin -P 重新绑定到目标队列。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "cupstestppd -W translations <patched-copy>",
      "lpadmin -p <queue> -P <patched-copy>",
      "lpstat -p <queue> -l"
    ],
    inputSchema: PPD_BIND_INPUT_SCHEMA
  },
  "run-queue-smoke-test": {
    id: "run-queue-smoke-test",
    title: "发送测试打印",
    description: "生成一页简短测试内容并提交到目标打印队列，用于确认建队列或回绑后的基本可用性。",
    module: "printer",
    risk: "moderate",
    requiresRoot: false,
    previewCommands: [
      "lp -d <queue> <generated-test-page>",
      "lpstat -W not-completed -o <queue>"
    ],
    inputSchema: QUEUE_ONLY_INPUT_SCHEMA
  },
  "run-queue-regression-check": {
    id: "run-queue-regression-check",
    title: "执行回归检查",
    description: "检查队列状态、当前 PPD、可用选项和近期 CUPS 日志，确认修复后系统是否稳定。",
    module: "support",
    risk: "safe",
    requiresRoot: false,
    previewCommands: [
      "lpstat -p <queue> -l",
      "lpoptions -p <queue> -l",
      "cupstestppd -W translations /etc/cups/ppd/<queue>.ppd",
      "journalctl -u cups --since '10 min ago' --no-pager -n 60"
    ],
    inputSchema: QUEUE_ONLY_INPUT_SCHEMA
  },
  "rollback-ppd-backup": {
    id: "rollback-ppd-backup",
    title: "回滚旧 PPD",
    description: "使用已备份的旧 PPD 恢复目标队列，适合在补丁回绑后快速回退。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "cupstestppd -W translations <backup-ppd>",
      "lpadmin -p <queue> -P <backup-ppd>",
      "lpstat -p <queue> -l"
    ],
    inputSchema: PPD_ROLLBACK_INPUT_SCHEMA
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
  "reset-print-queues": {
    id: "reset-print-queues",
    title: "重置打印队列",
    description: "删除当前检测到的打印队列定义，并清理队列中的旧作业。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "lpstat -t",
      "cancel -a <queue>",
      "lpadmin -x <queue>",
      "lpstat -t"
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
  },
  "repair-print-stack": {
    id: "repair-print-stack",
    title: "重装核心打印栈",
    description: "重装 CUPS 与通用打印驱动包，并在完成后重启打印服务。",
    module: "repair",
    risk: "privileged",
    requiresRoot: true,
    previewCommands: [
      "dpkg -l | grep -Ei 'cups|printer-driver|ghostscript'",
      `apt-get install --reinstall -y ${CORE_PRINT_PACKAGES.join(" ")}`,
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

async function runPrivilegedShell(command, authorization, timeout = 7000) {
  const wrappedCommand =
    authorization.preferredMethod === "sudo-nopasswd"
      ? `sudo -n bash -lc ${shellQuote(command)}`
      : command;

  return runShell(wrappedCommand, timeout);
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
  const backendHints = lines
    .map((line) => line.split(/\s+/).slice(1).join(" ").trim())
    .filter(Boolean);

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
    backendHints,
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

const PPD_TUNING_SCAN_PATTERN =
  "^\\*OpenUI|^\\*DefaultPageSize|^\\*PageSize|^\\*PaperDimension|^\\*ImageableArea|^\\*cupsFilter|^\\*DefaultPageRegion|^\\*DefaultResolution|^\\*DefaultMediaType";
const PPD_PATCH_SCAN_PATTERN =
  "^\\*DefaultPageSize|^\\*DefaultPageRegion|^\\*PaperDimension|^\\*ImageableArea|^\\*DefaultResolution|^\\*DefaultMediaType";

function buildPatternScanCommand(pattern, filePath) {
  return `if command -v rg >/dev/null 2>&1; then rg -n ${shellQuote(
    pattern
  )} ${shellQuote(filePath)}; else grep -nE ${shellQuote(pattern)} ${shellQuote(
    filePath
  )}; fi`;
}

function buildPatternScanTemplate(pattern, fileExpr) {
  return `if command -v rg >/dev/null 2>&1; then rg -n ${shellQuote(
    pattern
  )} ${fileExpr}; else grep -nE ${shellQuote(pattern)} ${fileExpr}; fi`;
}

function sanitizeQueueName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "orbit-printer";
}

function pickConcreteUriCandidates(uriSample = []) {
  return uriSample.filter(
    (item) =>
      item &&
      !item.startsWith("cups-brf:/") &&
      !item.startsWith("file:/") &&
      !item.includes("localhost")
  );
}

function uniqueQueueName(baseName, existingQueues = []) {
  const used = new Set(existingQueues);

  if (!used.has(baseName)) {
    return baseName;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName}-${index}`;

    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${Date.now()}`;
}

function buildQueueBlueprint(diagnostics) {
  const existingQueues = diagnostics.printers.queues;
  const deviceLabel = diagnostics.inference.device || "printer";
  const connection = diagnostics.inference.connection || "Unknown";
  const baseName =
    deviceLabel === "标签打印机"
      ? "label-printer"
      : deviceLabel === "网络打印机"
        ? "network-printer"
        : deviceLabel === "激光打印机"
          ? "laser-printer"
          : "orbit-printer";
  const queueName = uniqueQueueName(sanitizeQueueName(baseName), existingQueues);
  const concreteUris = pickConcreteUriCandidates(diagnostics.printers.uriSample || []);
  const protocolTemplates =
    connection === "Network"
      ? [
          "ipp://printer.local/ipp/print",
          "ipps://printer.local/ipp/print",
          "socket://192.168.1.100"
        ]
      : connection === "USB"
        ? [
            "usb://Vendor/Model?serial=<serial>",
            "usb://Vendor/LabelPrinter"
          ]
        : [
            "ipp://printer.local/ipp/print",
            "socket://192.168.1.100",
            "usb://Vendor/Model?serial=<serial>"
          ];
  const candidateUris =
    concreteUris.length > 0 ? concreteUris : protocolTemplates;
  const driverModel =
    connection === "Network" || concreteUris.some((item) => item.startsWith("ipp"))
      ? "everywhere"
      : "everywhere";
  const notes = [];

  if (concreteUris.length === 0) {
    notes.push("当前环境没有检测到可直接复用的真实设备 URI，需要人工替换蓝图中的 URI 模板。");
  }

  if (existingQueues.length > 0) {
    notes.push(`当前系统仍存在旧队列：${existingQueues.join(", ")}。创建新队列前建议先评估是否需要重置旧配置。`);
  }

  if (diagnostics.printers.backendHints?.length) {
    notes.push(`当前系统可见的后端类型：${diagnostics.printers.backendHints.join(", ")}。`);
  }

  const commands = candidateUris.map(
    (uri) => `sudo lpadmin -p ${queueName} -E -v ${uri} -m ${driverModel}`
  );

  return {
    generatedAt: new Date().toISOString(),
    queueName,
    connection,
    deviceLabel,
    driverModel,
    candidateUris,
    concreteUriDetected: concreteUris.length > 0,
    existingQueues,
    backendHints: diagnostics.printers.backendHints || [],
    notes,
    commands: [
      ...commands,
      `sudo lpoptions -d ${queueName}`,
      "lpstat -t"
    ]
  };
}

function buildQueueBlueprintScript(blueprint) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Fill DEVICE_URI with one of the candidate URIs below before executing.",
    `QUEUE_NAME=${shellQuote(blueprint.queueName)}`,
    `DRIVER_MODEL=${shellQuote(blueprint.driverModel)}`,
    "DEVICE_URI=${DEVICE_URI:-}",
    "",
    "# Candidate URIs:",
    ...blueprint.candidateUris.map((item) => `#   ${item}`),
    "",
    "if [ -z \"$DEVICE_URI\" ]; then",
    "  echo 'Set DEVICE_URI before running this script.' >&2",
    "  exit 1",
    "fi",
    "",
    "sudo lpadmin -p \"$QUEUE_NAME\" -E -v \"$DEVICE_URI\" -m \"$DRIVER_MODEL\"",
    "sudo lpoptions -d \"$QUEUE_NAME\"",
    "lpstat -t"
  ].join("\n");
}

function uriLooksTemplated(deviceUri) {
  return (
    !deviceUri ||
    /<[^>]+>/.test(deviceUri) ||
    deviceUri.includes("Vendor/Model") ||
    deviceUri.includes("Vendor/LabelPrinter") ||
    deviceUri.includes("printer.local") ||
    deviceUri.includes("192.168.1.100")
  );
}

function parseYesNoFlag(value, fallback = true) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["yes", "y", "true", "1", "default", "on"].includes(normalized)) {
    return true;
  }

  if (["no", "n", "false", "0", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function buildQueueApplyParams(params = {}) {
  const queueName = (params.queueName || "label-printer").trim() || "label-printer";
  const deviceUri = (params.deviceUri || "").trim();
  const driverModel = (params.driverModel || "everywhere").trim() || "everywhere";
  const setDefault = parseYesNoFlag(params.setDefault, true);

  return {
    queueName,
    deviceUri,
    driverModel,
    setDefault,
    uriTemplated: uriLooksTemplated(deviceUri)
  };
}

function buildQueueOnlyParams(params = {}) {
  return {
    queueName: (params.queueName || "printer_name").trim() || "printer_name"
  };
}

function buildPpdRollbackParams(params = {}) {
  return {
    queueName: (params.queueName || "printer_name").trim() || "printer_name",
    backupPpdPath: (params.backupPpdPath || "").trim()
  };
}

function buildPpdTuningPlan(diagnostics) {
  const existingQueues = diagnostics.printers.queues;
  const queueName =
    diagnostics.printers.defaultPrinter ||
    existingQueues[0] ||
    "printer_name";
  const ppdPath = existingQueues.length
    ? `/etc/cups/ppd/${queueName}.ppd`
    : "/etc/cups/ppd/<queue-name>.ppd";
  const symptom = diagnostics.inference.symptom;
  const deviceLabel = diagnostics.inference.device || "通用打印机";
  const labelMode = deviceLabel === "标签打印机";
  const tuningItems = [];
  const notes = [
    "默认优先用队列参数和 URI 纠正问题，PPD 微调只处理输出参数、介质边界和厂商选项。",
    "不要直接在唯一生产 PPD 上试错，先备份并在临时副本上校验。"
  ];

  if (symptom === "纸宽或输出异常" || labelMode) {
    tuningItems.push(
      {
        key: "*DefaultPageSize / *PageSize",
        reason: "用于对齐介质宽度、标签尺寸和默认页面模板。",
        examples: ["12mm", "62mm", "Custom.62x100mm"]
      },
      {
        key: "*PaperDimension",
        reason: "修正驱动内部的页面尺寸，避免实际介质和页面宽度不一致。",
        examples: ["340 850", "176 425"]
      },
      {
        key: "*ImageableArea",
        reason: "修正可打印区域和边距，解决内容偏移或被裁切的问题。",
        examples: ["0 0 340 850", "6 0 334 850"]
      }
    );
  }

  if (labelMode) {
    tuningItems.push(
      {
        key: "*MediaType / *PageRegion",
        reason: "标签机经常需要同时校正介质类型和页面区域。",
        examples: ["Label", "Continuous", "DieCut"]
      },
      {
        key: "*BrAutoCut / *CutMedia / *FeedDirection",
        reason: "处理切纸、走纸方向和末端留白等厂商扩展选项。",
        examples: ["True", "False", "Forward"]
      }
    );
    notes.push("标签机优先检查介质宽度和走纸方向，再动厂商扩展项。");
  }

  if (symptom === "驱动 / 过滤链异常") {
    tuningItems.push(
      {
        key: "*cupsFilter / *cupsFilter2",
        reason: "确认过滤链声明是否完整，避免 queue 存在但 CUPS 无法走到正确 filter。",
        examples: ["application/vnd.cups-raster 0 rastertofoo"]
      },
      {
        key: "*NickName / *ModelName",
        reason: "确认当前队列是否真的绑定到了预期驱动，而不是相邻型号。",
        examples: ["Vendor Model", "Vendor Label Printer"]
      }
    );
    notes.push("如果问题已经是 filter failed，先重装打印栈，再评估是否需要改 PPD。");
  }

  if (tuningItems.length === 0) {
    tuningItems.push(
      {
        key: "*OpenUI / *Default*",
        reason: "先梳理 PPD 的可调项和默认值，再决定是否需要进一步微调。",
        examples: ["*OpenUI *PageSize", "*DefaultResolution: 300dpi"]
      }
    );
  }

  const commands = [
    `cp ${ppdPath} ~/ppd-backups/${queueName}-$(date +%Y%m%d-%H%M%S).ppd`,
    buildPatternScanCommand(PPD_TUNING_SCAN_PATTERN, ppdPath),
    `cp ${ppdPath} /tmp/${queueName}.ppd`,
    `cupstestppd -W translations /tmp/${queueName}.ppd`,
    `sudo lpadmin -p ${queueName} -P /tmp/${queueName}.ppd`,
    "lpstat -t"
  ];

  return {
    generatedAt: new Date().toISOString(),
    queueName,
    ppdPath,
    symptom,
    deviceLabel,
    tuningItems,
    commands,
    notes,
    useQueueOptionsFirst:
      symptom !== "纸宽或输出异常" && !labelMode
  };
}

function buildPpdTuningScript(plan) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# PPD tuning template generated by Orbit Deepin Assistant",
    `QUEUE_NAME=${shellQuote(plan.queueName)}`,
    `PPD_PATH=${shellQuote(plan.ppdPath)}`,
    'TMP_PPD="/tmp/${QUEUE_NAME}.ppd"',
    'BACKUP_DIR=${BACKUP_DIR:-"$HOME/ppd-backups"}',
    "mkdir -p \"$BACKUP_DIR\"",
    "cp \"$PPD_PATH\" \"$BACKUP_DIR/${QUEUE_NAME}-$(date +%Y%m%d-%H%M%S).ppd\"",
    "cp \"$PPD_PATH\" \"$TMP_PPD\"",
    "",
    "# Inspect key sections before editing",
    `${buildPatternScanTemplate(PPD_TUNING_SCAN_PATTERN, '"$TMP_PPD"')} || true`,
    "",
    "# Edit /tmp/${QUEUE_NAME}.ppd with your preferred editor, then validate",
    "cupstestppd -W translations \"$TMP_PPD\"",
    "sudo lpadmin -p \"$QUEUE_NAME\" -P \"$TMP_PPD\"",
    "lpstat -t"
  ].join("\n");
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPpdPatchBlueprint(params = {}) {
  const queueName = (params.queueName || "printer_name").trim() || "printer_name";
  const ppdPath =
    (params.ppdPath || `/etc/cups/ppd/${queueName}.ppd`).trim() ||
    `/etc/cups/ppd/${queueName}.ppd`;
  const pageSizeKey = (params.pageSizeKey || "").trim();
  const paperDimension = (params.paperDimension || "").trim();
  const imageableArea = (params.imageableArea || "").trim();
  const resolution = (params.resolution || "").trim();
  const mediaType = (params.mediaType || "").trim();
  const tmpPath = `/tmp/${queueName}.ppd`;
  const edits = [];

  if (pageSizeKey) {
    edits.push({
      key: "*DefaultPageSize",
      target: "default",
      value: pageSizeKey,
      pattern: "^\\*DefaultPageSize: .*$",
      replacement: `*DefaultPageSize: ${pageSizeKey}`,
      expression: `s/^\\*DefaultPageSize: .*$/*DefaultPageSize: ${pageSizeKey}/m`
    });
    edits.push({
      key: "*DefaultPageRegion",
      target: "default",
      value: pageSizeKey,
      pattern: "^\\*DefaultPageRegion: .*$",
      replacement: `*DefaultPageRegion: ${pageSizeKey}`,
      expression: `s/^\\*DefaultPageRegion: .*$/*DefaultPageRegion: ${pageSizeKey}/m`
    });
  }

  if (pageSizeKey && paperDimension) {
    edits.push({
      key: "*PaperDimension",
      target: pageSizeKey,
      value: paperDimension,
      pattern: `^\\*PaperDimension ${escapeRegexLiteral(pageSizeKey)}\\/.*$`,
      replacement: `*PaperDimension ${pageSizeKey}: "${paperDimension}"`,
      expression: `s/^\\*PaperDimension ${escapeRegexLiteral(
        pageSizeKey
      )}\\/.*$/*PaperDimension ${pageSizeKey}: "${paperDimension}"/m`
    });
  }

  if (pageSizeKey && imageableArea) {
    edits.push({
      key: "*ImageableArea",
      target: pageSizeKey,
      value: imageableArea,
      pattern: `^\\*ImageableArea ${escapeRegexLiteral(pageSizeKey)}\\/.*$`,
      replacement: `*ImageableArea ${pageSizeKey}: "${imageableArea}"`,
      expression: `s/^\\*ImageableArea ${escapeRegexLiteral(
        pageSizeKey
      )}\\/.*$/*ImageableArea ${pageSizeKey}: "${imageableArea}"/m`
    });
  }

  if (resolution) {
    edits.push({
      key: "*DefaultResolution",
      target: "default",
      value: resolution,
      pattern: "^\\*DefaultResolution: .*$",
      replacement: `*DefaultResolution: ${resolution}`,
      expression: `s/^\\*DefaultResolution: .*$/*DefaultResolution: ${resolution}/m`
    });
  }

  if (mediaType) {
    edits.push({
      key: "*DefaultMediaType",
      target: "default",
      value: mediaType,
      pattern: "^\\*DefaultMediaType: .*$",
      replacement: `*DefaultMediaType: ${mediaType}`,
      expression: `s/^\\*DefaultMediaType: .*$/*DefaultMediaType: ${mediaType}/m`
    });
  }

  const applyCommands = edits.map(
    (item) =>
      `perl -0pi -e ${shellQuote(item.expression)} ${shellQuote(tmpPath)}`
  );

  return {
    generatedAt: new Date().toISOString(),
    queueName,
    ppdPath,
    tmpPath,
    pageSizeKey,
    paperDimension,
    imageableArea,
    resolution,
    mediaType,
    edits,
    validationCommands: [
      buildPatternScanCommand(PPD_PATCH_SCAN_PATTERN, tmpPath),
      `cupstestppd -W translations ${tmpPath}`
    ],
    applyCommands,
    commitCommand: `sudo lpadmin -p ${queueName} -P ${tmpPath}`,
    notes: [
      "先在 /tmp 副本上应用补丁，再通过 cupstestppd 校验。",
      "如果某条替换没有命中，说明对应键在该 PPD 中不存在，需要人工补全或换成现有键名。",
      "只有在验证通过后，才建议用 lpadmin -P 重新绑定队列。"
    ]
  };
}

function buildPpdPatchScript(blueprint) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# PPD patch blueprint generated by Orbit Deepin Assistant",
    `QUEUE_NAME=${shellQuote(blueprint.queueName)}`,
    `SOURCE_PPD=${shellQuote(blueprint.ppdPath)}`,
    `TMP_PPD=${shellQuote(blueprint.tmpPath)}`,
    "cp \"$SOURCE_PPD\" \"$TMP_PPD\"",
    ...blueprint.applyCommands,
    "",
    "# Validate patched copy",
    ...blueprint.validationCommands,
    "",
    "# Apply to queue only after validation succeeds",
    'if [ "${APPLY_TO_QUEUE:-0}" = "1" ]; then',
    `  ${blueprint.commitCommand}`,
    "  lpstat -t",
    "else",
    '  echo "Set APPLY_TO_QUEUE=1 to bind the patched PPD to the queue."',
    "fi"
  ].join("\n");
}

function buildPpdPatchValidationCommands(filePath) {
  return [
    buildPatternScanCommand(PPD_PATCH_SCAN_PATTERN, filePath),
    `cupstestppd -W translations ${shellQuote(filePath)}`
  ];
}

function applyPpdPatchBlueprintToRaw(raw, blueprint) {
  let nextRaw = raw;
  const changes = blueprint.edits.map((item) => {
    const regex = new RegExp(item.pattern, "m");
    const beforeMatch = nextRaw.match(regex);
    const matched = Boolean(beforeMatch);

    if (matched) {
      nextRaw = nextRaw.replace(regex, item.replacement);
    }

    return {
      key: item.key,
      target: item.target,
      value: item.value,
      matched,
      beforeLine: beforeMatch?.[0] || "",
      afterLine: matched ? item.replacement : ""
    };
  });

  return {
    patchedRaw: nextRaw,
    changes,
    matchedEdits: changes.filter((item) => item.matched),
    unmatchedEdits: changes.filter((item) => !item.matched)
  };
}

async function buildPpdPatchValidationReport(blueprint) {
  const sourceRaw = await readFile(blueprint.ppdPath, "utf8");
  const stamp = artifactTimestamp();
  const sourceCopyPath = await writeArtifact(
    "ppd-patches",
    `ppd-source-copy-${stamp}.ppd`,
    sourceRaw
  );
  const patchResult = applyPpdPatchBlueprintToRaw(sourceRaw, blueprint);
  const patchedCopyPath = await writeArtifact(
    "ppd-patches",
    `ppd-patched-copy-${stamp}.ppd`,
    patchResult.patchedRaw
  );
  const validationCommands = buildPpdPatchValidationCommands(patchedCopyPath);
  const [inspectResult, cupstestResult] = await Promise.all([
    runShell(validationCommands[0]),
    runShell(validationCommands[1])
  ]);
  const readyToApply =
    blueprint.edits.length > 0 &&
    patchResult.unmatchedEdits.length === 0 &&
    cupstestResult.ok;
  const notes = [
    "所有变更都只应用在 artifacts 目录下的副本，不会直接写回系统 PPD。"
  ];

  if (patchResult.unmatchedEdits.length > 0) {
    notes.push("有部分键未命中，说明原始 PPD 中的键名或页面别名与预期不一致。");
  }

  if (!cupstestResult.ok) {
    notes.push("cupstestppd 校验没有通过，当前补丁副本还不能直接绑定到打印队列。");
  }

  if (readyToApply) {
    notes.push("当前副本已经通过结构校验，可以在人工复核后用 lpadmin -P 绑定到目标队列。");
  }

  return {
    generatedAt: new Date().toISOString(),
    queueName: blueprint.queueName,
    sourcePath: blueprint.ppdPath,
    sourceCopyPath,
    patchedCopyPath,
    requestedEdits: blueprint.edits.length,
    matchedEditCount: patchResult.matchedEdits.length,
    unmatchedEditCount: patchResult.unmatchedEdits.length,
    readyToApply,
    changes: patchResult.changes,
    unmatchedEdits: patchResult.unmatchedEdits.map((item) => ({
      key: item.key,
      target: item.target,
      value: item.value
    })),
    validationResults: [
      commandPreview("patchedSections", inspectResult),
      commandPreview("cupstestppd", cupstestResult)
    ],
    validatedCommitCommand: `sudo lpadmin -p ${blueprint.queueName} -P ${patchedCopyPath}`,
    notes
  };
}

function buildPpdBindParams(params = {}) {
  return {
    queueName: (params.queueName || "printer_name").trim() || "printer_name",
    patchedPpdPath: (params.patchedPpdPath || "").trim()
  };
}

function buildIntelligentPlan(diagnostics) {
  const symptom = diagnostics.inference.symptom;
  const deviceLabel = diagnostics.inference.device || "通用打印机";
  const connection = diagnostics.inference.connection || "Unknown";
  const queueCount = diagnostics.printers.queues.length;
  const ppdRelevant =
    symptom === "纸宽或输出异常" ||
    deviceLabel === "标签打印机" ||
    symptom === "驱动 / 过滤链异常";
  const route =
    symptom === "无法识别设备"
      ? "discover"
      : symptom === "打印队列卡住"
        ? "queue-recovery"
        : symptom === "驱动 / 过滤链异常"
          ? "stack-repair"
          : "ppd-tuning";
  const confidence =
    symptom === "无法识别设备"
      ? 68
      : symptom === "打印队列卡住"
        ? 82
        : symptom === "驱动 / 过滤链异常"
          ? 74
          : 79;
  const actions =
    route === "discover"
      ? [
          "export-queue-blueprint",
          "apply-queue-blueprint",
          "run-queue-smoke-test",
          "repair-print-stack"
        ]
      : route === "queue-recovery"
        ? [
            "clear-print-jobs",
            "restart-cups-service",
            "run-queue-regression-check",
            "run-queue-smoke-test",
            "reset-print-queues"
          ]
        : route === "stack-repair"
          ? [
              "repair-print-stack",
              "export-ppd-tuning-plan",
              "generate-ppd-patch-blueprint",
              "validate-ppd-patch-copy",
              "apply-validated-ppd-copy",
              "run-queue-regression-check",
              "rollback-ppd-backup",
              "reset-print-queues"
            ]
          : [
              "export-ppd-tuning-plan",
              "generate-ppd-patch-blueprint",
              "validate-ppd-patch-copy",
              "apply-validated-ppd-copy",
              "run-queue-regression-check",
              "run-queue-smoke-test",
              "rollback-ppd-backup",
              "export-queue-blueprint"
            ];

  const stages =
    route === "discover"
      ? [
          {
            title: "发现设备",
            summary: "先确认系统是否有真实设备 URI 或 USB 枚举，再决定是否创建新队列。",
            commands: ["lsusb", "lpinfo -v"]
          },
          {
            title: "生成蓝图",
            summary: "用蓝图动作先固定队列名、URI 模板和驱动策略，再进入真实建队列。",
            commands: [
              "export-queue-blueprint",
              "apply-queue-blueprint",
              "run-queue-smoke-test"
            ]
          }
        ]
      : route === "queue-recovery"
        ? [
            {
              title: "清理旧作业",
              summary: "先移除阻塞作业，避免重启服务后坏任务继续堵塞。",
              commands: ["clear-print-jobs", "lpstat -t"]
            },
            {
              title: "刷新服务",
              summary: "如果队列仍然 blocked，再刷新 CUPS 服务并看 post-check。",
              commands: [
                "restart-cups-service",
                "run-queue-regression-check"
              ]
            }
          ]
        : route === "stack-repair"
          ? [
              {
                title: "恢复基础打印栈",
                summary: "优先修复 cups / filters / driver 包，再决定是否要触碰 PPD。",
                commands: ["repair-print-stack"]
              },
              {
                title: "微调驱动配置",
                summary: "仅在过滤链稳定后，再检查 PPD 和厂商扩展项。",
                commands: [
                  "export-ppd-tuning-plan",
                  "generate-ppd-patch-blueprint",
                  "validate-ppd-patch-copy",
                  "apply-validated-ppd-copy",
                  "rollback-ppd-backup"
                ]
              }
            ]
          : [
              {
                title: "校正页面参数",
                summary: "聚焦 PageSize、PaperDimension、ImageableArea 等最终输出参数。",
                commands: [
                  "export-ppd-tuning-plan",
                  "generate-ppd-patch-blueprint",
                  "validate-ppd-patch-copy",
                  "apply-validated-ppd-copy",
                  "run-queue-smoke-test",
                  "rollback-ppd-backup"
                ]
              },
              {
                title: "准备回滚点",
                summary: "所有 PPD 调整都应该先备份、校验，再重新绑定到队列。",
                commands: ["cupstestppd", "lpadmin -P"]
              }
            ];

  const notes = [];

  if (queueCount === 0) {
    notes.push("当前系统没有现成打印队列，任何 PPD 调整都应该建立在新队列蓝图之上。");
  }

  if (ppdRelevant) {
    notes.push("当前症状与 PPD 或输出参数相关，但默认仍应优先确保打印栈和队列稳定。");
  } else {
    notes.push("当前症状更像链路或队列问题，不建议一开始就直接改 PPD。");
  }

  if (!diagnostics.printers.uriSample?.length) {
    notes.push("当前没有真实设备 URI，可先导出蓝图，再补充网络地址或设备连接信息。");
  }

  return {
    route,
    confidence,
    headline:
      route === "ppd-tuning"
        ? "适合进入 PPD 微调和输出参数校正"
        : route === "stack-repair"
          ? "优先修复打印栈，再考虑 PPD 细调"
          : route === "queue-recovery"
            ? "优先做队列恢复和服务刷新"
            : "优先恢复设备发现和队列蓝图",
    ppdRelevant,
    recommendedActionIds: actions,
    stages,
    notes
  };
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
    inputSchema: action.inputSchema || [],
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

  if (action.id === "reset-print-queues") {
    warnings.push("该动作会删除现有打印队列定义，后续需要重新发现或重建打印机。");
  }

  if (action.id === "repair-print-stack") {
    warnings.push("该动作会调用软件包重装流程，执行时间可能较长，并依赖本机包缓存或软件源。");
  }

  if (action.id === "apply-queue-blueprint") {
    warnings.push("该动作会在系统中创建真实打印队列，执行前请确认设备 URI 和驱动模型是正确的。");
  }

  if (action.id === "generate-ppd-patch-blueprint") {
    warnings.push("该动作只生成补丁蓝图和脚本模板，不会直接修改系统中的真实 PPD 文件。");
  }

  if (action.id === "validate-ppd-patch-copy") {
    warnings.push("该动作只会在 artifacts 目录下创建补丁副本和验证报告，不会直接写回系统队列。");
  }

  if (action.id === "apply-validated-ppd-copy") {
    warnings.push("该动作会重新绑定现有打印队列的 PPD，执行前建议确认副本已经通过结构校验并保留当前配置备份。");
  }

  if (action.id === "run-queue-smoke-test") {
    warnings.push("该动作会向真实设备发送一页测试打印内容，适合在确认设备就绪后执行。");
  }

  if (action.id === "rollback-ppd-backup") {
    warnings.push("该动作会用旧 PPD 覆盖当前队列配置，执行前请确认备份文件和目标队列对应正确。");
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
    "export-queue-blueprint": [
      "蓝图导出是只读动作，不需要回滚。",
      "如果设备信息变化，重新导出一份新的蓝图即可。"
    ],
    "apply-queue-blueprint": [
      "如果新建队列不符合预期，可执行 `lpadmin -x <queue>` 删除该队列。",
      "如果创建后默认打印机被切换错了，重新执行 `lpoptions -d <target-queue>` 修正默认队列。"
    ],
    "export-ppd-tuning-plan": [
      "PPD 微调方案导出是只读动作，不会直接改动队列或驱动。",
      "如果设备型号或输出症状变化，重新导出一份新的调优方案即可。"
    ],
    "generate-ppd-patch-blueprint": [
      "PPD 补丁蓝图导出是只读动作，不会直接改动系统中的真实 PPD。",
      "如果你更换了队列名、PPD 路径或页面参数，重新生成一份新的补丁蓝图即可。"
    ],
    "validate-ppd-patch-copy": [
      "副本验证只会生成 artifacts 中的临时文件，不需要回滚系统队列。",
      "如果验证结果不理想，调整参数后重新生成并验证下一份副本即可。"
    ],
    "apply-validated-ppd-copy": [
      "如果回绑后的输出不符合预期，优先用执行前自动备份的 PPD 或原始 PPD 重新执行 `lpadmin -P`。",
      "回绑完成后如果队列状态异常，先查看 `lpstat -p <queue> -l`、`journalctl -u cups` 和动作日志。"
    ],
    "run-queue-smoke-test": [
      "如果测试页打印错误或浪费介质，优先暂停进一步打印并查看队列状态。",
      "如果测试打印后出现异常输出，立即执行回归检查并视情况回滚旧 PPD。"
    ],
    "run-queue-regression-check": [
      "回归检查是只读动作，不需要回滚。",
      "如果检查结果过时，重新运行一次即可获取新的状态。"
    ],
    "rollback-ppd-backup": [
      "如果回滚后仍不符合预期，优先检查备份文件是否真的来自该队列对应的旧版本。",
      "回滚完成后建议立刻执行回归检查和一次测试打印，确认系统恢复情况。"
    ],
    "clear-print-jobs": [
      "如果误清了作业，需要让业务侧重新提交打印任务。",
      "如果清空后队列仍异常，建议立即重新采集诊断并检查 CUPS 日志。"
    ],
    "reset-print-queues": [
      "如果误删了正在使用的打印队列，需要重新发现设备并重新创建打印机。",
      "如果删除后系统仍残留旧队列，优先查看 `lpstat -t` 和动作日志。"
    ],
    "restart-cups-service": [
      "如果重启后服务未恢复，先查看 `systemctl status cups` 和 `journalctl -u cups`。",
      "如果确认是权限问题，改用具备管理员权限的环境重试，而不是反复触发重启。"
    ],
    "repair-print-stack": [
      "如果重装后问题仍在，先检查软件源、包依赖和 `journalctl -u cups`。",
      "如果只是厂商驱动损坏，不要反复全量重装，改为重建队列或补装专用驱动。"
    ]
  };

  return suggestions[actionId] || [
    "如果动作执行后结果不符合预期，先重新采集诊断再决定下一步。"
  ];
}

function artifactTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function joinDisplayList(items) {
  return items.length > 0 ? items.join(", ") : "none";
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

async function preparePpdBindArtifacts(queueName) {
  const directory = path.join(ARTIFACTS_DIR, "ppd-applies");
  await mkdir(directory, { recursive: true });
  return {
    backupPath: path.join(
      directory,
      `ppd-backup-${sanitizeQueueName(queueName)}-${artifactTimestamp()}.ppd`
    )
  };
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
    `- Backend Hints: ${(diagnostics.printers.backendHints || []).join(", ") || "none"}`,
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

function buildReceiptWriterLines(actionId, detailVars = []) {
  return [
    "node <<'NODE'",
    "const fs = require('node:fs');",
    "const details = [];",
    ...detailVars.map(
      (item) => `if (process.env.${item}) details.push(process.env.${item});`
    ),
    "const payload = {",
    "  id: process.env.HANDOFF_ID,",
    `  actionId: ${JSON.stringify(actionId)},`,
    "  status: process.env.STATUS || 'completed',",
    "  startedAt: process.env.STARTED_AT,",
    "  finishedAt: process.env.FINISHED_AT,",
    "  executedBy: process.env.EXECUTED_BY,",
    "  logPath: process.env.LOG_PATH,",
    "  summary: process.env.SUMMARY || '',",
    "  details",
    "};",
    "fs.writeFileSync(process.env.RECEIPT_PATH, JSON.stringify(payload, null, 2));",
    "NODE"
  ];
}

function queueResetScriptLines(queueNames) {
  const beforeQueues = joinDisplayList(queueNames);

  return [
    `BEFORE_QUEUES=${shellQuote(beforeQueues)}`,
    `QUEUES=(${queueNames.map((item) => shellQuote(item)).join(" ")})`,
    "REMOVE_OK=true",
    'for queue in "${QUEUES[@]}"; do',
    '  echo "[Orbit] Clearing queue $queue"',
    '  cancel -a "$queue" || true',
    '  if ! lpadmin -x "$queue"; then',
    "    REMOVE_OK=false",
    "  fi",
    "done",
    'AFTER_QUEUES="$(lpstat -p 2>&1 | awk \'/^printer /{print $2}\' | xargs || true)"',
    'if [ -z "$AFTER_QUEUES" ]; then AFTER_QUEUES="none"; fi',
    'DETAIL_ONE="before queues: $BEFORE_QUEUES"',
    'DETAIL_TWO="after queues: $AFTER_QUEUES"',
    'SUMMARY="Removed queue definitions"',
    'STATUS=completed',
    'if [ "$REMOVE_OK" != "true" ]; then STATUS=failed; fi',
    'for queue in "${QUEUES[@]}"; do',
    '  case " $AFTER_QUEUES " in',
    '    *" $queue "*) STATUS=failed ;;',
    "  esac",
    "done"
  ];
}

function repairPrintStackScriptLines() {
  const packages = CORE_PRINT_PACKAGES.join(" ");

  return [
    `PACKAGES=${shellQuote(packages)}`,
    'DETAIL_ONE="packages: $PACKAGES"',
    'echo "[Orbit] Reinstalling print stack: $PACKAGES"',
    "INSTALL_OK=true",
    "export DEBIAN_FRONTEND=noninteractive",
    `if ! apt-get install --reinstall -y ${packages}; then`,
    "  INSTALL_OK=false",
    "fi",
    'echo "[Orbit] Restarting CUPS after package repair"',
    "RESTART_OK=true",
    "if ! systemctl restart cups; then",
    "  RESTART_OK=false",
    "fi",
    'POSTCHECK="$(systemctl is-active cups 2>&1 || true)"',
    'DETAIL_TWO="post-check: $POSTCHECK"',
    'SUMMARY="Core print stack reinstall attempted"',
    'STATUS=completed',
    'if [ "$INSTALL_OK" != "true" ] || [ "$RESTART_OK" != "true" ] || [ "$POSTCHECK" != "active" ]; then STATUS=failed; fi'
  ];
}

function queueCreateScriptLines(queueProvisioning) {
  return [
    `QUEUE_NAME=${shellQuote(queueProvisioning.queueName)}`,
    `DEVICE_URI=${shellQuote(queueProvisioning.deviceUri)}`,
    `DRIVER_MODEL=${shellQuote(queueProvisioning.driverModel)}`,
    `SET_DEFAULT=${queueProvisioning.setDefault ? shellQuote("yes") : shellQuote("no")}`,
    'DETAIL_ONE="queue: $QUEUE_NAME"',
    'DETAIL_TWO="uri: $DEVICE_URI"',
    'echo "[Orbit] Creating queue $QUEUE_NAME -> $DEVICE_URI"',
    "CREATE_OK=true",
    'if ! lpadmin -p "$QUEUE_NAME" -E -v "$DEVICE_URI" -m "$DRIVER_MODEL"; then',
    "  CREATE_OK=false",
    "fi",
    'if [ "$CREATE_OK" = "true" ] && [ "$SET_DEFAULT" = "yes" ]; then',
    '  lpoptions -d "$QUEUE_NAME" || true',
    "fi",
    'POSTCHECK="$(lpstat -p "$QUEUE_NAME" -l 2>&1 || true)"',
    'DETAIL_THREE="post-check: $POSTCHECK"',
    'SUMMARY="Queue creation attempted"',
    'STATUS=completed',
    'if [ "$CREATE_OK" != "true" ]; then STATUS=failed; fi'
  ];
}

function rollbackPpdScriptLines(queueName, backupPpdPath, backupPath) {
  return [
    `QUEUE_NAME=${shellQuote(queueName)}`,
    `BACKUP_PPD=${shellQuote(backupPpdPath)}`,
    `ROLLBACK_SNAPSHOT=${shellQuote(backupPath)}`,
    'DETAIL_ONE="queue: $QUEUE_NAME"',
    'DETAIL_TWO="rollback source: $BACKUP_PPD"',
    'echo "[Orbit] Validating rollback source: $BACKUP_PPD"',
    "ROLLBACK_OK=true",
    'if ! cupstestppd -W translations "$BACKUP_PPD"; then',
    "  ROLLBACK_OK=false",
    "fi",
    'if [ "$ROLLBACK_OK" = "true" ]; then',
    '  mkdir -p "$(dirname "$ROLLBACK_SNAPSHOT")"',
    '  if [ -f "/etc/cups/ppd/${QUEUE_NAME}.ppd" ]; then',
    '    cp "/etc/cups/ppd/${QUEUE_NAME}.ppd" "$ROLLBACK_SNAPSHOT" || true',
    "  fi",
    '  if ! lpadmin -p "$QUEUE_NAME" -P "$BACKUP_PPD"; then',
    "    ROLLBACK_OK=false",
    "  fi",
    "fi",
    'POSTCHECK="$(lpstat -p "$QUEUE_NAME" -l 2>&1 || true)"',
    'DETAIL_THREE="post-check: $POSTCHECK"',
    'SUMMARY="PPD rollback attempted"',
    'STATUS=completed',
    'if [ "$ROLLBACK_OK" != "true" ]; then STATUS=failed; fi'
  ];
}

function bindPatchedPpdScriptLines(queueName, patchedPpdPath, backupPath) {
  return [
    `QUEUE_NAME=${shellQuote(queueName)}`,
    `PATCHED_PPD=${shellQuote(patchedPpdPath)}`,
    `BACKUP_PATH=${shellQuote(backupPath)}`,
    'DETAIL_ONE="queue: $QUEUE_NAME"',
    'DETAIL_TWO="patched: $PATCHED_PPD"',
    'echo "[Orbit] Validating patched PPD: $PATCHED_PPD"',
    "BIND_OK=true",
    'if ! cupstestppd -W translations "$PATCHED_PPD"; then',
    "  BIND_OK=false",
    "fi",
    'if [ "$BIND_OK" = "true" ]; then',
    '  mkdir -p "$(dirname "$BACKUP_PATH")"',
    '  if [ -f "/etc/cups/ppd/${QUEUE_NAME}.ppd" ]; then',
    '    cp "/etc/cups/ppd/${QUEUE_NAME}.ppd" "$BACKUP_PATH" || true',
    "  fi",
    '  if ! lpadmin -p "$QUEUE_NAME" -P "$PATCHED_PPD"; then',
    "    BIND_OK=false",
    "  fi",
    "fi",
    'POSTCHECK="$(lpstat -p "$QUEUE_NAME" -l 2>&1 || true)"',
    'DETAIL_THREE="post-check: $POSTCHECK"',
    'SUMMARY="Patched PPD bind attempted"',
    'STATUS=completed',
    'if [ "$BIND_OK" != "true" ]; then STATUS=failed; fi'
  ];
}

function buildPendingActionScript(action, diagnostics, manualExecution, params = {}) {
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
      'SUMMARY="CUPS restart attempted"',
      'DETAIL_ONE="pre-check: $PRECHECK"',
      'DETAIL_TWO="post-check: $POSTCHECK"',
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO"]),
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  if (action.id === "reset-print-queues") {
    const queueNames = diagnostics.printers.queues;

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
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      ...queueResetScriptLines(queueNames),
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO"]),
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  if (action.id === "repair-print-stack") {
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
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      ...repairPrintStackScriptLines(),
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO"]),
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  if (action.id === "apply-queue-blueprint") {
    const queueProvisioning = params;

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
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      ...queueCreateScriptLines(queueProvisioning),
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO", "DETAIL_THREE"]),
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  if (action.id === "apply-validated-ppd-copy") {
    const { queueName, patchedPpdPath, backupPath } = params;

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
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      ...bindPatchedPpdScriptLines(queueName, patchedPpdPath, backupPath),
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO", "DETAIL_THREE"]),
      "echo \"[Orbit] Receipt written to $RECEIPT_PATH\"",
      "echo \"[Orbit] Status: $STATUS\"",
      "if [ \"$STATUS\" = \"completed\" ]; then",
      "  exit 0",
      "fi",
      "exit 1"
    ].join("\n");
  }

  if (action.id === "rollback-ppd-backup") {
    const { queueName, backupPpdPath, backupPath } = params;

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
      "mkdir -p \"$(dirname \"$RECEIPT_PATH\")\"",
      "mkdir -p \"$(dirname \"$LOG_PATH\")\"",
      ": > \"$LOG_PATH\"",
      "exec > >(tee -a \"$LOG_PATH\") 2>&1",
      "STARTED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      "EXECUTED_BY=\"$(id -un 2>/dev/null || printf '%s' root)\"",
      ...rollbackPpdScriptLines(queueName, backupPpdPath, backupPath),
      "FINISHED_AT=\"$(date --iso-8601=seconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')\"",
      ...buildReceiptWriterLines(action.id, ["DETAIL_ONE", "DETAIL_TWO", "DETAIL_THREE"]),
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

async function createManualExecutionPlan(
  action,
  authorization,
  diagnostics,
  params = {}
) {
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
    buildPendingActionScript(action, diagnostics, manualExecution, params)
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
    summary:
      action.id === "reset-print-queues"
        ? "本次没有直接删除队列，已生成待授权的队列重置脚本。"
        : action.id === "repair-print-stack"
          ? "本次没有直接重装打印栈，已生成待授权的修复脚本。"
          : action.id === "apply-queue-blueprint"
            ? "本次没有直接创建打印队列，已生成待授权的建队列脚本。"
          : action.id === "apply-validated-ppd-copy"
            ? "本次没有直接回绑打印队列，已生成待授权的 PPD 回绑脚本。"
            : action.id === "rollback-ppd-backup"
              ? "本次没有直接回滚队列 PPD，已生成待授权的回滚脚本。"
          : "本次没有直接修改系统，已生成待授权执行脚本。",
    detail: authorization.detail,
    artifact: {
      path: scriptPath,
      type: "application/x-sh"
    },
    launchers,
    steps: [
      "任选一条启动命令在本机终端执行。",
      action.id === "reset-print-queues"
        ? "授权完成后，脚本会清理旧作业并删除当前检测到的打印队列。"
        : action.id === "repair-print-stack"
          ? "授权完成后，脚本会重装核心打印包并重启 CUPS。"
          : action.id === "apply-queue-blueprint"
            ? "授权完成后，脚本会创建真实打印队列，并根据参数决定是否设为默认打印机。"
          : action.id === "apply-validated-ppd-copy"
            ? "授权完成后，脚本会再次校验补丁副本，并用 lpadmin -P 回绑目标队列。"
            : action.id === "rollback-ppd-backup"
              ? "授权完成后，脚本会校验旧 PPD 备份，并用 lpadmin -P 恢复目标队列。"
          : "授权完成后，脚本会自动做预检、重启 CUPS 并输出 post-check 状态。",
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

async function executeAction(actionId, mode = "preview", params = {}) {
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

  if (actionId === "export-queue-blueprint") {
    const queueBlueprint = buildQueueBlueprint(diagnostics);
    const stamp = artifactTimestamp();
    const jsonPath = await writeArtifact(
      "queue-blueprints",
      `queue-blueprint-${stamp}.json`,
      JSON.stringify(queueBlueprint, null, 2)
    );
    const scriptPath = await writeArtifact(
      "queue-blueprints",
      `queue-blueprint-${stamp}.sh`,
      buildQueueBlueprintScript(queueBlueprint)
    );
    timeline.push(
      timelineEvent(
        "ok",
        "Queue blueprint exported",
        `已导出队列蓝图 ${jsonPath}`
      )
    );

    const result = {
      ...base,
      ok: true,
      state: "completed",
      summary: "Queue blueprint exported",
      artifact: {
        path: jsonPath,
        type: "application/json"
      },
      attachments: [
        {
          label: "脚本模板",
          path: scriptPath,
          type: "text/x-shellscript"
        }
      ],
      queueBlueprint,
      followUp: [
        "先确认候选 URI 和队列名，再决定是否进入高权限创建流程。",
        "如果当前环境还没有真实设备 URI，先接上打印机或补充网络地址。"
      ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "apply-queue-blueprint") {
    const queueProvisioning = buildQueueApplyParams(params);

    if (!queueProvisioning.deviceUri) {
      timeline.push(
        timelineEvent(
          "warning",
          "Missing device URI",
          "当前没有提供真实设备 URI，无法进入建队列。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Device URI is required",
        queueProvisioning,
        followUp: [
          "先从队列蓝图中选择一个真实 URI，或手动填写当前设备的 URI。",
          "如果仍只有模板 URI，先继续做设备发现或网络地址确认。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    if (queueProvisioning.uriTemplated) {
      timeline.push(
        timelineEvent(
          "warning",
          "Template URI detected",
          "当前 URI 仍然像模板值，还不适合直接创建真实队列。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Replace template URI before creating queue",
        queueProvisioning,
        followUp: [
          "把模板 URI 替换成真实 USB / IPP / socket 设备地址。",
          "确认 URI 后再执行建队列动作，避免创建不可用队列。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    if (diagnostics.printers.queues.includes(queueProvisioning.queueName)) {
      timeline.push(
        timelineEvent(
          "warning",
          "Queue already exists",
          `当前系统已经存在名为 ${queueProvisioning.queueName} 的打印队列。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Queue already exists",
        queueProvisioning,
        followUp: [
          "请更换新的队列名，或先重置旧队列后再创建。",
          "如果只是要修复当前队列，优先走 PPD 回绑或打印栈修复。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    if (!authorization.canRunFromApi) {
      const manualExecution = await createManualExecutionPlan(
        action,
        authorization,
        diagnostics,
        queueProvisioning
      );
      timeline.push(
        timelineEvent(
          "blocked",
          "Authorization handoff generated",
          "当前 API 进程没有直接执行权限，已生成待授权的建队列脚本。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: "Authorization required before creating queue",
        artifact: manualExecution.artifact,
        manualExecution,
        queueProvisioning,
        followUp: [
          "先在本机终端完成一次人工授权，再回来查看回执状态。",
          "建队列完成后，建议立刻重新采集诊断，并视情况进入 PPD 微调。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const commandResult = await runPrivilegedShell(
      [
        "set -uo pipefail",
        `QUEUE_NAME=${shellQuote(queueProvisioning.queueName)}`,
        `DEVICE_URI=${shellQuote(queueProvisioning.deviceUri)}`,
        `DRIVER_MODEL=${shellQuote(queueProvisioning.driverModel)}`,
        `SET_DEFAULT=${queueProvisioning.setDefault ? shellQuote("yes") : shellQuote("no")}`,
        'lpadmin -p "$QUEUE_NAME" -E -v "$DEVICE_URI" -m "$DRIVER_MODEL"',
        'if [ "$SET_DEFAULT" = "yes" ]; then lpoptions -d "$QUEUE_NAME"; fi'
      ].join("\n"),
      authorization,
      30000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Queue creation attempted",
        commandResult.ok
          ? `已尝试创建 ${queueProvisioning.queueName} 打印队列。`
          : "打印队列创建执行失败。"
      )
    );
    const postCheck = await runShell(
      `lpstat -p ${shellQuote(queueProvisioning.queueName)} -l`,
      15000
    );
    timeline.push(
      timelineEvent(
        postCheck.ok ? "ok" : "warning",
        "Post-check completed",
        postCheck.ok
          ? `已查询 ${queueProvisioning.queueName} 的当前队列详情。`
          : `未能确认 ${queueProvisioning.queueName} 是否创建成功。`
      )
    );

    const result = {
      ...base,
      ok: commandResult.ok && postCheck.ok,
      state: commandResult.ok && postCheck.ok ? "completed" : "failed",
      summary:
        commandResult.ok && postCheck.ok
          ? "Queue created from blueprint"
          : "Failed to create queue from blueprint",
      commandResult,
      postCheck,
      queueProvisioning,
      followUp:
        commandResult.ok && postCheck.ok
          ? [
              "队列已经创建完成，下一步建议先做测试打印或重新采集实时诊断。",
              "如果这是标签机或输出异常场景，可以继续进入 PPD 微调与副本验证。"
            ]
          : [
              "先检查命令结果里的 URI、驱动模型和权限信息。",
              "如果设备是标签机，再确认 URI、驱动和纸型策略是否对应。"
            ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "export-ppd-tuning-plan") {
    const ppdTuningPlan = buildPpdTuningPlan(diagnostics);
    const stamp = artifactTimestamp();
    const jsonPath = await writeArtifact(
      "ppd-tuning",
      `ppd-tuning-plan-${stamp}.json`,
      JSON.stringify(ppdTuningPlan, null, 2)
    );
    const scriptPath = await writeArtifact(
      "ppd-tuning",
      `ppd-tuning-plan-${stamp}.sh`,
      buildPpdTuningScript(ppdTuningPlan)
    );
    timeline.push(
      timelineEvent(
        "ok",
        "PPD tuning plan exported",
        `已导出 PPD 微调方案 ${jsonPath}`
      )
    );

    const result = {
      ...base,
      ok: true,
      state: "completed",
      summary: "PPD tuning plan exported",
      artifact: {
        path: jsonPath,
        type: "application/json"
      },
      attachments: [
        {
          label: "PPD 调优脚本模板",
          path: scriptPath,
          type: "text/x-shellscript"
        }
      ],
      ppdTuningPlan,
      followUp: [
        "先备份目标队列对应的 PPD，再在临时副本上试调参数。",
        "PPD 通过 `cupstestppd` 校验后，再决定是否重新绑定到打印队列。"
      ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "generate-ppd-patch-blueprint") {
    const ppdPatchBlueprint = buildPpdPatchBlueprint(params);
    const stamp = artifactTimestamp();
    const jsonPath = await writeArtifact(
      "ppd-patches",
      `ppd-patch-blueprint-${stamp}.json`,
      JSON.stringify(ppdPatchBlueprint, null, 2)
    );
    const scriptPath = await writeExecutableArtifact(
      "ppd-patches",
      `ppd-patch-blueprint-${stamp}.sh`,
      buildPpdPatchScript(ppdPatchBlueprint)
    );
    timeline.push(
      timelineEvent(
        "ok",
        "PPD patch blueprint exported",
        `已导出 PPD 补丁蓝图 ${jsonPath}`
      )
    );

    const result = {
      ...base,
      ok: true,
      state: "completed",
      summary:
        ppdPatchBlueprint.edits.length > 0
          ? "PPD patch blueprint exported"
          : "PPD validation blueprint exported",
      artifact: {
        path: jsonPath,
        type: "application/json"
      },
      attachments: [
        {
          label: "PPD 补丁脚本模板",
          path: scriptPath,
          type: "text/x-shellscript"
        }
      ],
      ppdPatchBlueprint,
      followUp:
        ppdPatchBlueprint.edits.length > 0
          ? [
              "先在 /tmp 副本上应用补丁，再跑 `cupstestppd` 做结构校验。",
              "校验通过后，再决定是否用 `lpadmin -P` 把补丁版 PPD 绑定回队列。"
            ]
          : [
              "当前没有形成具体补丁项，建议补充 PageSize、Resolution 或 MediaType 参数后重新生成。",
              "如果只想确认 PPD 结构，可以先用导出的模板做备份和校验。"
            ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "validate-ppd-patch-copy") {
    const ppdPatchBlueprint = buildPpdPatchBlueprint(params);
    let ppdPatchValidation;

    try {
      ppdPatchValidation = await buildPpdPatchValidationReport(ppdPatchBlueprint);
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) {
        throw error;
      }

      ppdPatchValidation = {
        generatedAt: new Date().toISOString(),
        queueName: ppdPatchBlueprint.queueName,
        sourcePath: ppdPatchBlueprint.ppdPath,
        sourceCopyPath: "",
        patchedCopyPath: "",
        requestedEdits: ppdPatchBlueprint.edits.length,
        matchedEditCount: 0,
        unmatchedEditCount: ppdPatchBlueprint.edits.length,
        readyToApply: false,
        changes: ppdPatchBlueprint.edits.map((item) => ({
          key: item.key,
          target: item.target,
          value: item.value,
          matched: false,
          beforeLine: "",
          afterLine: ""
        })),
        unmatchedEdits: ppdPatchBlueprint.edits.map((item) => ({
          key: item.key,
          target: item.target,
          value: item.value
        })),
        validationResults: [],
        validatedCommitCommand: "",
        notes: [
          "没有找到可读取的源 PPD 文件，因此本次无法生成真实补丁副本。",
          "请把 PPD Path 改成当前机器上真实存在的文件路径，再重新验证。"
        ]
      };
    }

    const stamp = artifactTimestamp();
    const reportPath = await writeArtifact(
      "ppd-patches",
      `ppd-patch-validation-${stamp}.json`,
      JSON.stringify(ppdPatchValidation, null, 2)
    );
    timeline.push(
      timelineEvent(
        ppdPatchValidation.readyToApply ? "ok" : "warning",
        "PPD patch copy validated",
        ppdPatchValidation.sourceCopyPath
          ? `已生成 PPD 补丁副本与校验报告 ${reportPath}`
          : `未找到可读源 PPD，已写入验证报告 ${reportPath}`
      )
    );

    const result = {
      ...base,
      ok: ppdPatchValidation.readyToApply,
      state: ppdPatchValidation.sourceCopyPath ? "completed" : "skipped",
      summary: ppdPatchValidation.sourceCopyPath
        ? ppdPatchValidation.readyToApply
          ? "PPD patch copy validated and ready"
          : "PPD patch copy validated with review items"
        : "Source PPD not found for patch validation",
      artifact: {
        path: reportPath,
        type: "application/json"
      },
      attachments: [
        ...(ppdPatchValidation.sourceCopyPath
          ? [
              {
                label: "源 PPD 副本",
                path: ppdPatchValidation.sourceCopyPath,
                type: "application/octet-stream"
              }
            ]
          : []),
        ...(ppdPatchValidation.patchedCopyPath
          ? [
              {
                label: "补丁后 PPD 副本",
                path: ppdPatchValidation.patchedCopyPath,
                type: "application/octet-stream"
              }
            ]
          : [])
      ],
      ppdPatchValidation,
      followUp: ppdPatchValidation.sourceCopyPath
        ? ppdPatchValidation.readyToApply
          ? [
              "可以先人工检查补丁副本，再决定是否用 validatedCommitCommand 绑定到目标队列。",
              "如果准备真的回绑队列，建议先保留当前生产 PPD 备份。"
            ]
          : [
              "先查看未命中项和 cupstestppd 输出，再调整键名或页面别名。",
              "不要在未通过结构校验前直接执行 lpadmin -P。"
            ]
        : [
            "请把 PPD Path 改为当前系统上真实存在的 PPD 文件路径。",
            "如果还没有现成队列，先导出队列蓝图并完成建队列。"
          ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "apply-validated-ppd-copy") {
    const bindParams = buildPpdBindParams(params);

    if (!bindParams.patchedPpdPath) {
      timeline.push(
        timelineEvent(
          "warning",
          "Missing patched PPD path",
          "当前没有提供可回绑的补丁副本路径。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Patched PPD path is required",
        followUp: [
          "先执行“验证 PPD 补丁副本”，拿到真实的 patchedCopyPath。",
          "再把 patchedCopyPath 回填到当前动作中，进入回绑流程。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    if (!diagnostics.printers.queues.includes(bindParams.queueName)) {
      timeline.push(
        timelineEvent(
          "warning",
          "Queue not found",
          `当前系统没有检测到名为 ${bindParams.queueName} 的打印队列。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Target queue not found",
        followUp: [
          "先确认当前系统已经存在目标打印队列，再执行回绑。",
          "如果还没有队列，先走设备发现或队列蓝图创建流程。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    try {
      await readFile(bindParams.patchedPpdPath, "utf8");
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) {
        throw error;
      }

      timeline.push(
        timelineEvent(
          "warning",
          "Patched copy missing",
          `没有找到补丁副本 ${bindParams.patchedPpdPath}`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "failed",
        summary: "Patched PPD copy not found",
        followUp: [
          "先重新执行“验证 PPD 补丁副本”，生成新的 patchedCopyPath。",
          "确认路径存在后，再进入回绑动作。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const validationResult = await runShell(
      `cupstestppd -W translations ${shellQuote(bindParams.patchedPpdPath)}`,
      15000
    );
    timeline.push(
      timelineEvent(
        validationResult.ok ? "ok" : "warning",
        "Patched copy pre-check",
        validationResult.ok
          ? "补丁副本通过了 cupstestppd 复核。"
          : "补丁副本没有通过 cupstestppd，当前不进入回绑。"
      )
    );

    if (!validationResult.ok) {
      const result = {
        ...base,
        ok: false,
        state: "failed",
        summary: "Patched PPD failed validation",
        commandResult: validationResult,
        followUp: [
          "先修正补丁副本里的结构问题，再重新验证。",
          "不要在 cupstestppd 未通过前直接执行 lpadmin -P。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const { backupPath } = await preparePpdBindArtifacts(bindParams.queueName);

    if (!authorization.canRunFromApi) {
      const manualExecution = await createManualExecutionPlan(
        action,
        authorization,
        diagnostics,
        {
          ...bindParams,
          backupPath
        }
      );
      timeline.push(
        timelineEvent(
          "blocked",
          "Authorization handoff generated",
          "当前 API 进程没有直接执行权限，已生成 PPD 回绑脚本。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: "Authorization required before binding patched PPD",
        artifact: manualExecution.artifact,
        manualExecution,
        queuePpdBinding: {
          queueName: bindParams.queueName,
          patchedPpdPath: bindParams.patchedPpdPath,
          backupPpdPath: backupPath
        },
        followUp: [
          "先在本机完成一次人工授权，再回来检查回执状态。",
          "授权成功后，助手会继续提示你检查队列状态和当前备份文件。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const bindCommand = [
      "set -uo pipefail",
      `QUEUE_NAME=${shellQuote(bindParams.queueName)}`,
      `PATCHED_PPD=${shellQuote(bindParams.patchedPpdPath)}`,
      `BACKUP_PATH=${shellQuote(backupPath)}`,
      'mkdir -p "$(dirname "$BACKUP_PATH")"',
      'if [ -f "/etc/cups/ppd/${QUEUE_NAME}.ppd" ]; then',
      '  cp "/etc/cups/ppd/${QUEUE_NAME}.ppd" "$BACKUP_PATH"',
      "fi",
      'lpadmin -p "$QUEUE_NAME" -P "$PATCHED_PPD"'
    ].join("\n");
    const commandResult = await runPrivilegedShell(
      bindCommand,
      authorization,
      30000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Patched PPD bind attempted",
        commandResult.ok
          ? `已尝试将 ${bindParams.patchedPpdPath} 绑定到 ${bindParams.queueName}。`
          : "补丁 PPD 回绑执行失败。"
      )
    );
    const postCheck = await runShell(
      `lpstat -p ${shellQuote(bindParams.queueName)} -l`,
      15000
    );
    const backupExists = await runShell(`test -f ${shellQuote(backupPath)}`);
    timeline.push(
      timelineEvent(
        postCheck.ok ? "ok" : "warning",
        "Post-check completed",
        postCheck.ok
          ? `已完成 ${bindParams.queueName} 的队列查询。`
          : `无法确认 ${bindParams.queueName} 的队列详情。`
      )
    );

    const result = {
      ...base,
      ok: commandResult.ok && postCheck.ok,
      state: commandResult.ok && postCheck.ok ? "completed" : "failed",
      summary:
        commandResult.ok && postCheck.ok
          ? "Patched PPD bound to queue"
          : "Failed to bind patched PPD to queue",
      commandResult,
      postCheck,
      queuePpdBinding: {
        queueName: bindParams.queueName,
        patchedPpdPath: bindParams.patchedPpdPath,
        backupPpdPath: backupPath
      },
      attachments: backupExists.ok
        ? [
            {
              label: "旧 PPD 自动备份",
              path: backupPath,
              type: "application/octet-stream"
            }
          ]
        : [],
      followUp:
        commandResult.ok && postCheck.ok
          ? [
              "当前队列已经完成回绑，下一步建议立刻做一次测试打印或重新采集诊断。",
              "如果输出仍异常，可以用自动备份的旧 PPD 执行一次回滚。"
            ]
          : [
              "先查看命令输出和后置检查结果，确认是权限、队列名还是 PPD 本身的问题。",
              "如果系统已经生成旧 PPD 备份，可以先用备份文件回滚。"
            ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "run-queue-smoke-test") {
    const queueParams = buildQueueOnlyParams(params);

    if (!diagnostics.printers.queues.includes(queueParams.queueName)) {
      timeline.push(
        timelineEvent(
          "warning",
          "Queue not found",
          `当前系统没有检测到名为 ${queueParams.queueName} 的打印队列。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Target queue not found for smoke test",
        followUp: [
          "先创建真实队列，再执行测试打印。",
          "如果队列刚建好，建议先跑一次回归检查再发测试页。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const stamp = artifactTimestamp();
    const testPagePath = await writeArtifact(
      "test-pages",
      `smoke-test-${sanitizeQueueName(queueParams.queueName)}-${stamp}.txt`,
      [
        "Orbit Deepin Assistant Smoke Test",
        `Generated: ${new Date().toISOString()}`,
        `Queue: ${queueParams.queueName}`,
        `Host: ${diagnostics.host.hostname}`,
        `Distro: ${diagnostics.system.prettyName}`,
        "",
        "This page confirms queue creation / PPD tuning / rollback results."
      ].join("\n")
    );
    const commandResult = await runShell(
      `lp -d ${shellQuote(queueParams.queueName)} ${shellQuote(testPagePath)}`,
      15000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Smoke print submitted",
        commandResult.ok
          ? `已向 ${queueParams.queueName} 提交测试打印任务。`
          : "测试打印任务提交失败。"
      )
    );
    const postCheck = await runShell(
      `lpstat -W not-completed -o ${shellQuote(queueParams.queueName)}`,
      15000
    );
    const jobIdMatch = (commandResult.stdout || "").match(/request id is ([^\s]+)/i);

    const result = {
      ...base,
      ok: commandResult.ok,
      state: commandResult.ok ? "completed" : "failed",
      summary: commandResult.ok
        ? "Smoke print submitted"
        : "Failed to submit smoke print",
      commandResult,
      postCheck,
      attachments: [
        {
          label: "测试页内容",
          path: testPagePath,
          type: "text/plain"
        }
      ],
      queueSmokeTest: {
        queueName: queueParams.queueName,
        testPagePath,
        jobId: jobIdMatch?.[1] || "",
        spoolPreview: (postCheck.stdout || postCheck.stderr || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6)
      },
      followUp: commandResult.ok
        ? [
            "观察真实设备输出是否符合预期，并继续执行回归检查。",
            "如果输出异常或空白，优先查看近期 CUPS 日志并考虑回滚旧 PPD。"
          ]
        : [
            "先查看提交结果和队列状态，确认设备是否在线。",
            "如果设备未响应，先回到链路诊断和队列回归检查。"
          ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "run-queue-regression-check") {
    const queueParams = buildQueueOnlyParams(params);

    if (!diagnostics.printers.queues.includes(queueParams.queueName)) {
      timeline.push(
        timelineEvent(
          "warning",
          "Queue not found",
          `当前系统没有检测到名为 ${queueParams.queueName} 的打印队列。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Target queue not found for regression check",
        followUp: [
          "先创建或恢复目标队列，再执行回归检查。",
          "如果队列刚被删除，先重新发现设备或按蓝图建队列。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const ppdPath = `/etc/cups/ppd/${queueParams.queueName}.ppd`;
    const [queueStatus, queueOptions, ppdValidate, ppdScan, cupLogs] = await Promise.all([
      runShell(`lpstat -p ${shellQuote(queueParams.queueName)} -l`, 15000),
      runShell(`lpoptions -p ${shellQuote(queueParams.queueName)} -l`, 15000),
      runShell(
        `if [ -f ${shellQuote(ppdPath)} ]; then cupstestppd -W translations ${shellQuote(
          ppdPath
        )}; else echo "PPD not found: ${ppdPath}"; fi`,
        15000
      ),
      runShell(
        `if [ -f ${shellQuote(ppdPath)} ]; then ${buildPatternScanCommand(
          PPD_PATCH_SCAN_PATTERN,
          ppdPath
        )}; else echo "PPD not found: ${ppdPath}"; fi`,
        15000
      ),
      runShell("journalctl -u cups --since '10 min ago' --no-pager -n 60", 15000)
    ]);
    const queueText = `${queueStatus.stdout}\n${queueStatus.stderr}`;
    const queueStable = !/(paused|stopped|filter failed|unable|offline)/i.test(queueText);
    const ppdHealthy =
      ppdValidate.ok && !/FAIL/i.test(`${ppdValidate.stdout}\n${ppdValidate.stderr}`);
    const regressionHealthy = queueStatus.ok && queueStable && ppdHealthy;
    const report = {
      generatedAt: new Date().toISOString(),
      queueName: queueParams.queueName,
      ppdPath,
      queueStable,
      ppdHealthy,
      regressionHealthy,
      checks: [
        commandPreview("queueStatus", queueStatus),
        commandPreview("queueOptions", queueOptions),
        commandPreview("ppdValidate", ppdValidate),
        commandPreview("ppdScan", ppdScan),
        commandPreview("cupLogs", cupLogs)
      ]
    };
    const reportPath = await writeArtifact(
      "regression-reports",
      `queue-regression-${sanitizeQueueName(queueParams.queueName)}-${artifactTimestamp()}.json`,
      JSON.stringify(report, null, 2)
    );
    timeline.push(
      timelineEvent(
        regressionHealthy ? "ok" : "warning",
        "Regression check completed",
        regressionHealthy
          ? `队列 ${queueParams.queueName} 当前看起来处于稳定状态。`
          : `队列 ${queueParams.queueName} 仍存在需要处理的回归风险。`
      )
    );

    const result = {
      ...base,
      ok: regressionHealthy,
      state: "completed",
      summary: regressionHealthy
        ? "Queue regression looks healthy"
        : "Queue regression check found issues",
      artifact: {
        path: reportPath,
        type: "application/json"
      },
      queueRegression: report,
      followUp: regressionHealthy
        ? [
            "当前队列与 PPD 看起来稳定，可以继续做一次真实测试打印确认输出。",
            "如果后续还要演示项目，可把这份回归报告作为修复完成证据。"
          ]
        : [
            "优先查看回归报告里的 queueStatus、ppdValidate 和 cupLogs。",
            "如果问题出在 PPD，可考虑回滚旧 PPD 或重新生成补丁副本。"
          ]
    };

    result.logArtifact = {
      path: await writeActionLog(result),
      type: "application/json"
    };

    return result;
  }

  if (actionId === "rollback-ppd-backup") {
    const rollbackParams = buildPpdRollbackParams(params);

    if (!rollbackParams.backupPpdPath) {
      timeline.push(
        timelineEvent(
          "warning",
          "Missing backup path",
          "当前没有提供旧 PPD 备份路径。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Backup PPD path is required",
        followUp: [
          "先使用自动备份的旧 PPD 路径，或提供一个已验证的备份文件路径。",
          "回滚前建议先确认该备份确实属于目标队列。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    if (!diagnostics.printers.queues.includes(rollbackParams.queueName)) {
      timeline.push(
        timelineEvent(
          "warning",
          "Queue not found",
          `当前系统没有检测到名为 ${rollbackParams.queueName} 的打印队列。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "skipped",
        summary: "Target queue not found for rollback",
        followUp: [
          "先确认目标队列仍然存在，再执行 PPD 回滚。",
          "如果队列已经被删除，先恢复或重建队列。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    try {
      await readFile(rollbackParams.backupPpdPath, "utf8");
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) {
        throw error;
      }

      timeline.push(
        timelineEvent(
          "warning",
          "Backup missing",
          `没有找到旧 PPD 备份 ${rollbackParams.backupPpdPath}`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "failed",
        summary: "Backup PPD not found",
        followUp: [
          "请确认旧 PPD 备份路径正确，或先重新执行 PPD 回绑拿到新的自动备份。",
          "不要在没有备份文件的情况下尝试回滚。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const validationResult = await runShell(
      `cupstestppd -W translations ${shellQuote(rollbackParams.backupPpdPath)}`,
      15000
    );
    timeline.push(
      timelineEvent(
        validationResult.ok ? "ok" : "warning",
        "Rollback source pre-check",
        validationResult.ok
          ? "旧 PPD 备份通过了 cupstestppd 复核。"
          : "旧 PPD 备份未通过 cupstestppd，当前不进入回滚。"
      )
    );

    if (!validationResult.ok) {
      const result = {
        ...base,
        ok: false,
        state: "failed",
        summary: "Backup PPD failed validation",
        commandResult: validationResult,
        followUp: [
          "先确认备份文件完整性，再考虑其它恢复策略。",
          "如果旧备份本身有结构问题，不要直接回滚到该版本。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const { backupPath } = await preparePpdBindArtifacts(rollbackParams.queueName);

    if (!authorization.canRunFromApi) {
      const manualExecution = await createManualExecutionPlan(
        action,
        authorization,
        diagnostics,
        {
          ...rollbackParams,
          backupPath
        }
      );
      timeline.push(
        timelineEvent(
          "blocked",
          "Authorization handoff generated",
          "当前 API 进程没有直接执行权限，已生成 PPD 回滚脚本。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: "Authorization required before PPD rollback",
        artifact: manualExecution.artifact,
        manualExecution,
        queueRollback: {
          queueName: rollbackParams.queueName,
          backupPpdPath: rollbackParams.backupPpdPath,
          preRollbackSnapshotPath: backupPath
        },
        followUp: [
          "先在本机完成一次人工授权，再回来检查回执状态。",
          "回滚成功后，建议立即执行回归检查和一次测试打印。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const commandResult = await runPrivilegedShell(
      [
        "set -uo pipefail",
        `QUEUE_NAME=${shellQuote(rollbackParams.queueName)}`,
        `BACKUP_PPD=${shellQuote(rollbackParams.backupPpdPath)}`,
        `ROLLBACK_SNAPSHOT=${shellQuote(backupPath)}`,
        'mkdir -p "$(dirname "$ROLLBACK_SNAPSHOT")"',
        'if [ -f "/etc/cups/ppd/${QUEUE_NAME}.ppd" ]; then',
        '  cp "/etc/cups/ppd/${QUEUE_NAME}.ppd" "$ROLLBACK_SNAPSHOT"',
        "fi",
        'lpadmin -p "$QUEUE_NAME" -P "$BACKUP_PPD"'
      ].join("\n"),
      authorization,
      30000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "PPD rollback attempted",
        commandResult.ok
          ? `已尝试将 ${rollbackParams.backupPpdPath} 回滚到 ${rollbackParams.queueName}。`
          : "旧 PPD 回滚执行失败。"
      )
    );
    const postCheck = await runShell(
      `lpstat -p ${shellQuote(rollbackParams.queueName)} -l`,
      15000
    );
    const backupExists = await runShell(`test -f ${shellQuote(backupPath)}`);

    const result = {
      ...base,
      ok: commandResult.ok && postCheck.ok,
      state: commandResult.ok && postCheck.ok ? "completed" : "failed",
      summary:
        commandResult.ok && postCheck.ok
          ? "Backup PPD restored to queue"
          : "Failed to restore backup PPD",
      commandResult,
      postCheck,
      queueRollback: {
        queueName: rollbackParams.queueName,
        backupPpdPath: rollbackParams.backupPpdPath,
        preRollbackSnapshotPath: backupExists.ok ? backupPath : ""
      },
      attachments: backupExists.ok
        ? [
            {
              label: "回滚前当前 PPD 备份",
              path: backupPath,
              type: "application/octet-stream"
            }
          ]
        : [],
      followUp:
        commandResult.ok && postCheck.ok
          ? [
              "旧 PPD 已恢复，下一步建议立即执行回归检查和测试打印。",
              "如果恢复后依然异常，优先排查设备链路与过滤器依赖。"
            ]
          : [
              "先查看命令输出和后置检查结果，确认是权限、备份文件还是队列状态的问题。",
              "如果回滚失败，不要继续反复切换 PPD，先稳定当前队列状态。"
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

  if (actionId === "reset-print-queues") {
    const queueNames = diagnostics.printers.queues;

    if (queueNames.length === 0) {
      timeline.push(
        timelineEvent(
          "skip",
          "No configured queue detected",
          "当前没有检测到打印队列，因此跳过队列重置动作。"
        )
      );
      const result = {
        ...base,
        ok: true,
        state: "skipped",
        summary: "No print queues found, nothing to reset",
        followUp: [
          "当前没有可删除的队列定义。",
          "如果设备仍不可用，先继续检查设备发现、URI 和驱动链路。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

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
          `当前 API 进程没有直接执行权限，已为 ${joinDisplayList(
            queueNames
          )} 生成队列重置脚本。`
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: `Authorization required before resetting ${queueNames.length} queue(s)`,
        artifact: manualExecution.artifact,
        manualExecution,
        followUp: [
          "先在本机终端完成一次人工授权，再重新采集诊断。",
          "队列删除完成后，需要重新发现或重建打印机。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const resetCommand = [
      "set -uo pipefail",
      ...queueResetScriptLines(queueNames),
      '[ "$STATUS" = "completed" ]'
    ].join("\n");
    const commandResult = await runPrivilegedShell(
      resetCommand,
      authorization,
      20000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Queue reset attempted",
        commandResult.ok
          ? `已尝试删除 ${queueNames.length} 个打印队列。`
          : "打印队列重置执行失败。"
      )
    );
    const postCheck = await runShell("lpstat -t");
    const remainingQueues = parseLpstat(postCheck.stdout || postCheck.stderr).printers;
    const removed = queueNames.every((queue) => !remainingQueues.includes(queue));
    timeline.push(
      timelineEvent(
        removed ? "ok" : "warning",
        "Post-check completed",
        `重置后剩余队列：${joinDisplayList(remainingQueues)}。`
      )
    );

    const result = {
      ...base,
      ok: commandResult.ok && removed,
      state: commandResult.ok && removed ? "completed" : "failed",
      summary:
        commandResult.ok && removed
          ? "Print queues reset successfully"
          : "Failed to fully reset print queues",
      commandResult,
      postCheck,
      followUp:
        commandResult.ok && removed
          ? [
              "旧队列已经清空，下一步可以重新发现设备或重建打印机。",
              "建议重新采集诊断，确认当前系统已经不再残留旧队列。"
            ]
          : [
              "如果仍有旧队列残留，先查看命令输出和 CUPS 日志。",
              "必要时改走人工授权脚本或逐个队列手动删除。"
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

    const commandResult = await runPrivilegedShell(
      "systemctl restart cups",
      authorization
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Restart attempted",
        commandResult.ok
          ? "已发起 CUPS 服务重启。"
          : "CUPS 服务重启命令执行失败。"
      )
    );
    const postCheck = await runShell("systemctl is-active cups");
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

  if (actionId === "repair-print-stack") {
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
          "当前 API 进程没有直接执行权限，已生成核心打印栈修复脚本。"
        )
      );

      const result = {
        ...base,
        ok: false,
        state: "blocked",
        summary: "Authorization required before reinstalling print stack",
        artifact: manualExecution.artifact,
        manualExecution,
        followUp: [
          "先在本机终端完成一次人工授权，再回来查看回执状态。",
          "重装完成后，建议重新采集诊断并视情况重建打印队列。"
        ]
      };

      result.logArtifact = {
        path: await writeActionLog(result),
        type: "application/json"
      };

      return result;
    }

    const packages = CORE_PRINT_PACKAGES.join(" ");
    const commandResult = await runPrivilegedShell(
      [
        "set -uo pipefail",
        "export DEBIAN_FRONTEND=noninteractive",
        `apt-get install --reinstall -y ${packages}`,
        "systemctl restart cups"
      ].join("\n"),
      authorization,
      300000
    );
    timeline.push(
      timelineEvent(
        commandResult.ok ? "ok" : "error",
        "Core stack reinstall attempted",
        commandResult.ok
          ? `已尝试重装 ${packages} 并重启 CUPS。`
          : "核心打印栈重装执行失败。"
      )
    );
    const postCheck = await runShell("systemctl is-active cups");
    timeline.push(
      timelineEvent(
        (postCheck.stdout || "").trim() === "active" ? "ok" : "warning",
        "Post-check completed",
        `重装后服务状态为 ${(postCheck.stdout || "").trim() || "unknown"}。`
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
          ? "Core print stack repaired successfully"
          : "Failed to reinstall core print stack",
      commandResult,
      postCheck,
      followUp:
        commandResult.ok && (postCheck.stdout || "").trim() === "active"
          ? [
              "核心打印组件已完成重装，下一步建议重新发现设备或重建打印机。",
              "如果仍然报 filter failed，再检查具体厂商驱动和过滤链。"
            ]
          : [
              "如果重装失败，先查看命令结果、软件源状态和授权日志。",
              "必要时先恢复 apt 依赖，再重新尝试驱动或队列修复。"
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
  const diagnostics = {
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
      backendHints: lpinfo.backendHints.slice(0, 8),
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

  diagnostics.solutionPlan = buildIntelligentPlan(diagnostics);
  return diagnostics;
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
      const params =
        body.params && typeof body.params === "object" && !Array.isArray(body.params)
          ? body.params
          : {};
      const result = await executeAction(actionId, mode, params);
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
