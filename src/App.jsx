import {
  startTransition,
  useEffect,
  useDeferredValue,
  useMemo,
  useState
} from "react";

const modules = [
  {
    id: "general",
    tag: "Core",
    title: "常见问题中枢",
    label: "System Orbit",
    description: "聚合更新、权限、网络和桌面服务异常。",
    atmosphere:
      "冷色轨道舱负责系统基础健康度，聚焦软件源、权限、服务和网络链路收敛。",
    accent: "#73f5ff",
    glow: "rgba(115, 245, 255, 0.48)",
    secondary: "#9ef8d8",
    position: { top: "14%", left: "17%" },
    workflow: ["同步系统状态", "定位异常服务", "恢复软件源与缓存"],
    quickPrompts: [
      "deepin 25 软件源更新失败怎么排查？",
      "UOS 桌面服务没有启动怎么办？",
      "系统权限异常导致应用打不开怎么修复？"
    ]
  },
  {
    id: "printer",
    tag: "Device",
    title: "外设打印机连接",
    label: "Printer Link",
    description: "围绕 USB / 网络打印机完成发现、绑定与队列检测。",
    atmosphere:
      "近地对接舱用于处理打印机发现失败、脱机、任务卡队列以及标签机链路异常。",
    accent: "#6dffb7",
    glow: "rgba(109, 255, 183, 0.46)",
    secondary: "#ceffd2",
    position: { top: "16%", left: "78%" },
    workflow: ["发现设备", "确认队列", "校准纸型与作业参数"],
    quickPrompts: [
      "USB 打印机能识别但打印队列卡住怎么办？",
      "deepin 找不到外接打印机怎么处理？",
      "网络打印机能 ping 通但打印失败，先查什么？"
    ]
  },
  {
    id: "driver",
    tag: "Repair",
    title: "驱动修复工位",
    label: "Driver Forge",
    description: "处理驱动配置、CUPS、依赖缺失和过滤链重建。",
    atmosphere:
      "橙色修复舱专注过滤链、驱动包、打印配置与介质参数的重建和校准。",
    accent: "#ffb55e",
    glow: "rgba(255, 181, 94, 0.46)",
    secondary: "#ffe7af",
    position: { top: "75%", left: "19%" },
    workflow: ["识别损坏环节", "重装关键包", "重建打印队列"],
    quickPrompts: [
      "驱动装过了但打印配置失效怎么修？",
      "CUPS 正常运行但打印参数不对怎么排查？",
      "重装驱动后还是乱码打印，下一步做什么？"
    ]
  },
  {
    id: "sensor",
    tag: "AI",
    title: "感知问答台",
    label: "Perception Deck",
    description: "结合快照、链路与故障症状生成动态建议。",
    atmosphere:
      "总控桥接收系统版本、设备类型、连接方式和症状，汇总成更具体的修复路径。",
    accent: "#ff7d6b",
    glow: "rgba(255, 125, 107, 0.42)",
    secondary: "#ffd6a5",
    position: { top: "79%", left: "81%" },
    workflow: ["采集快照", "匹配故障树", "输出修复建议与下一跳"],
    quickPrompts: [
      "根据当前快照帮我做一轮自动诊断。",
      "打印驱动和纸张参数要一起怎么排？",
      "我想把这个助手接文心模型，前端如何保留结构？"
    ]
  }
];

const knowledgeBase = {
  general: [
    {
      title: "软件源 / 更新异常恢复",
      keywords: ["更新", "软件源", "apt", "源", "仓库", "依赖"],
      summary:
        "先恢复包管理稳定性，再继续处理打印机驱动。系统依赖不健康时，后续驱动安装和打印过滤链经常连带失败。",
      steps: [
        "检查网络、DNS、时间同步，避免 TLS 和仓库签名错误。",
        "执行 `sudo apt update`，确认是源不可达、GPG 错误还是依赖断裂。",
        "若存在损坏依赖，先用 `sudo apt --fix-broken install` 和 `sudo dpkg --configure -a` 收敛状态。"
      ],
      commands: [
        "ping -c 3 mirrors.aliyun.com",
        "timedatectl status",
        "sudo apt update",
        "sudo apt --fix-broken install",
        "sudo dpkg --configure -a"
      ],
      nextAction: "系统更新恢复后，再切到“驱动修复工位”重装打印组件。"
    },
    {
      title: "服务与权限异常恢复",
      keywords: ["权限", "服务", "打不开", "托盘", "启动", "桌面"],
      summary:
        "桌面服务或权限异常会让打印管理器、系统设置页和设备发现流程表现失真，应该先修复基础服务。",
      steps: [
        "检查当前用户会话是否完整、关键守护进程是否崩溃。",
        "验证 CUPS、accountsservice、dbus 等基础服务状态。",
        "若是权限损坏，优先检查用户组、设备节点和家目录 ACL。"
      ],
      commands: [
        "systemctl --user status",
        "systemctl status cups",
        "groups",
        "ls -l /dev/usb",
        "journalctl -b -p warning --no-pager"
      ],
      nextAction: "基础服务恢复正常后，再继续进入打印机链路排查。"
    }
  ],
  printer: [
    {
      title: "USB / 网络打印机发现失败",
      keywords: ["找不到", "无法识别", "识别", "发现", "usb", "网络打印机", "脱机"],
      summary:
        "先确认设备层是否被系统识别，再决定是 CUPS 队列问题还是厂商驱动问题。链路没有打通时，重装驱动通常无效。",
      steps: [
        "USB 设备优先看 `lsusb` 和 `dmesg`，网络设备优先看 `ping` 和 `lpinfo -v`。",
        "确认 `cups` 服务在线，打印队列没有处于 paused 或 stopped。",
        "特殊介质打印场景下，设备型号、纸张参数和驱动配置必须一致。"
      ],
      commands: [
        "lsusb",
        "dmesg | tail -n 40",
        "lpinfo -v",
        "lpstat -t",
        "systemctl status cups"
      ],
      nextAction: "如果链路已经看得到设备，但打印仍失败，就切到“驱动修复工位”。"
    },
    {
      title: "打印队列卡住 / 作业不出纸",
      keywords: ["队列", "卡住", "挂起", "不打印", "job", "paused", "stopped"],
      summary:
        "多数卡队列问题不是硬件坏，而是队列被暂停、纸宽参数不匹配，或者上一次失败作业没有清掉。",
      steps: [
        "先看 `lpstat -t`，确认队列是否 paused、filter failed 或 stopped。",
        "清空旧作业并重启 `cups`，避免坏任务持续阻塞。",
        "重新核对默认纸张、标签宽度和设备 URI。"
      ],
      commands: [
        "lpstat -t",
        "cancel -a",
        "sudo systemctl restart cups",
        "lpoptions -p printer_name -l",
        "journalctl -u cups --since '15 min ago'"
      ],
      nextAction: "如果队列恢复后仍报 filter failed，进一步处理驱动和过滤链。"
    }
  ],
  driver: [
    {
      title: "驱动配置损坏 / 驱动不匹配修复",
      keywords: ["驱动", "ppd", "纸宽", "乱码", "filter failed", "重装", "配置"],
      summary:
        "打印驱动异常里最常见的是驱动配置漂移、过滤链损坏，或者驱动包升级后没有同步队列配置。",
      steps: [
        "确认当前打印队列绑定的配置和设备型号一致，避免误用相邻驱动。",
        "检查厂商驱动包或通用驱动是否完整安装，依赖是否断裂。",
        "必要时删除旧队列，重装驱动后重新创建队列。"
      ],
      commands: [
        "lpstat -p -d",
        "lpoptions -p printer_name -l",
        "dpkg -l | grep -Ei 'brother|cups|printer'",
        "sudo apt reinstall cups printer-driver-all",
        "sudo lpadmin -x printer_name"
      ],
      nextAction: "删除旧队列后重新建队列，再用测试页回归纸张和边距。"
    },
    {
      title: "CUPS 过滤链异常恢复",
      keywords: ["cups", "过滤", "过滤器", "backend", "崩溃", "后台"],
      summary:
        "如果 `cupsd` 正常但过滤链挂了，需要把问题收敛到后端、滤镜还是权限，而不是盲目重装全部软件。",
      steps: [
        "查看 `journalctl -u cups` 和 `/var/log/cups/error_log`，确认失败点。",
        "检查 `/usr/lib/cups/filter`、`/usr/lib/cups/backend` 中的执行权限。",
        "必要时重装 CUPS 和后端驱动，再回填打印队列。"
      ],
      commands: [
        "journalctl -u cups --since '30 min ago'",
        "sudo tail -n 60 /var/log/cups/error_log",
        "ls -l /usr/lib/cups/filter",
        "ls -l /usr/lib/cups/backend",
        "sudo systemctl restart cups"
      ],
      nextAction: "过滤链恢复后，再回到打印链路做一次端到端测试。"
    }
  ],
  sensor: [
    {
      title: "感知输入驱动的自动诊断",
      keywords: ["感知", "自动", "诊断", "快照", "根据当前", "agent", "模型"],
      summary:
        "这里会综合系统版本、连接类型、设备类型和故障症状，把建议压缩成具体操作流，后续可以直接接入文心或本地执行器。",
      steps: [
        "先收集快照：deepin / UOS 版本、设备类型、连接方式、故障表现。",
        "根据快照匹配故障树，并把当前场景路由到基础、链路或驱动模块。",
        "输出下一跳建议，必要时升级为可执行脚本或模型问答。"
      ],
      commands: [
        "cat /etc/os-release",
        "lsusb",
        "lpinfo -v",
        "lpstat -t",
        "journalctl -u cups --since '10 min ago'"
      ],
      nextAction: "后续把这层替换成真实模型接口时，前端结构不需要重写。"
    }
  ]
};

const snapshotOptions = {
  distro: ["deepin 25", "deepin 23.1", "UOS 1070", "deepin V23 Preview"],
  device: ["USB 打印机", "标签打印机", "激光打印机", "网络打印机", "网络一体机"],
  connection: ["USB", "Network", "Virtual Queue"],
  symptom: ["无法识别设备", "打印队列卡住", "驱动 / 过滤链异常", "纸宽或输出异常"]
};

const initialSnapshot = {
  distro: "deepin 25",
  device: "USB 打印机",
  connection: "USB",
  symptom: "打印队列卡住"
};

const pipelineStages = [
  { id: "sense", title: "设备感知", detail: "枚举设备、读取系统快照" },
  { id: "link", title: "链路确认", detail: "确认 USB / 网络 URI 与服务状态" },
  { id: "queue", title: "队列校验", detail: "检查 paused、旧作业和队列锁" },
  { id: "driver", title: "驱动修复", detail: "修复 PPD、过滤链和驱动依赖" },
  { id: "verify", title: "结果验证", detail: "测试打印、纸宽和边距回归" }
];

const symptomProfiles = {
  无法识别设备: {
    score: 42,
    severity: "critical",
    lane: "sense",
    toneSummary: "优先恢复设备枚举和链路可见性。",
    riskTags: ["设备未枚举", "链路失联", "禁止盲目重装驱动"]
  },
  打印队列卡住: {
    score: 63,
    severity: "warning",
    lane: "queue",
    toneSummary: "链路大概率已经存在，先清理队列和作业阻塞。",
    riskTags: ["队列阻塞", "旧作业堆积", "标签宽度可能漂移"]
  },
  "驱动 / 过滤链异常": {
    score: 51,
    severity: "critical",
    lane: "driver",
    toneSummary: "当前症状集中在驱动栈和过滤链，应该直接进入重建流程。",
    riskTags: ["驱动配置漂移", "过滤链损坏", "驱动依赖断裂"]
  },
  "纸宽或输出异常": {
    score: 72,
    severity: "warning",
    lane: "verify",
    toneSummary: "主要风险在输出参数和介质配置，需要回归纸宽与边距。",
    riskTags: ["纸宽不匹配", "边距异常", "输出模板错配"]
  }
};

const severityMeta = {
  critical: {
    label: "Critical",
    summary: "底层链路或驱动不稳定，继续操作前应先收敛关键故障。"
  },
  warning: {
    label: "Warning",
    summary: "存在明显异常，但修复路径已经较清晰。"
  },
  stable: {
    label: "Stable",
    summary: "整体链路可控，主要是参数和验证层问题。"
  }
};

const connectionProfiles = {
  USB: {
    health: 82,
    note: "本地直连，优先看 lsusb / dmesg 与设备节点。",
    uri: "usb://printer/device"
  },
  Network: {
    health: 69,
    note: "先确认 IP 可达、端口与协议 URI 正确。",
    uri: "socket://192.168.1.80"
  },
  "Virtual Queue": {
    health: 58,
    note: "虚拟队列适合测试，但真实设备映射容易漂移。",
    uri: "ipp://localhost/printers/virtual"
  }
};

const deviceProfiles = {
  "USB 打印机": {
    model: "USB printer",
    stack: "Vendor driver or generic printer stack",
    note: "重点核对 USB 枚举、设备节点和队列配置。"
  },
  标签打印机: {
    model: "Label printer",
    stack: "Vendor driver + CUPS + label media profile",
    note: "重点核对介质宽度、边距和驱动参数。"
  },
  激光打印机: {
    model: "LaserJet class printer",
    stack: "PCL / generic printer driver",
    note: "重点核对驱动后端和网络 URI。"
  },
  网络打印机: {
    model: "Network printer",
    stack: "IPP / socket printer stack",
    note: "重点核对 IP 可达、协议和队列绑定。"
  },
  网络一体机: {
    model: "Network MFP",
    stack: "IPP / socket + scan / print service",
    note: "需要区分打印协议和扫描协议状态。"
  }
};

const distroProfiles = {
  "deepin 25": {
    commandFamily: "apt + systemd + CUPS",
    note: "适合作为活动演示环境。"
  },
  "deepin 23.1": {
    commandFamily: "apt + systemd + CUPS",
    note: "适合作为本机诊断和原型调试环境。"
  },
  "UOS 1070": {
    commandFamily: "apt + enterprise desktop stack",
    note: "更关注桌面服务和企业镜像差异。"
  },
  "deepin V23 Preview": {
    commandFamily: "preview packages + rolling components",
    note: "需要额外注意版本漂移和兼容性。"
  }
};

const moduleMap = Object.fromEntries(modules.map((item) => [item.id, item]));
const API_BASE = import.meta.env.DEV ? "" : "http://127.0.0.1:4174";

function flattenFlows() {
  return Object.entries(knowledgeBase).flatMap(([moduleId, flows]) =>
    flows.map((flow) => ({ ...flow, moduleId }))
  );
}

function findBestFlow(question, preferredModuleId) {
  const normalized = question.trim().toLowerCase();
  const candidateFlows = [
    ...(knowledgeBase[preferredModuleId] || []).map((flow) => ({
      ...flow,
      moduleId: preferredModuleId
    })),
    ...flattenFlows()
  ];

  let bestMatch = candidateFlows[0];
  let bestScore = -1;

  candidateFlows.forEach((flow) => {
    const score = flow.keywords.reduce((total, keyword) => {
      return normalized.includes(keyword.toLowerCase()) ? total + 1 : total;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = flow;
    }
  });

  return bestScore > 0 ? bestMatch : candidateFlows[0];
}

function clampScore(score) {
  return Math.max(22, Math.min(96, score));
}

function buildHealth(snapshot, moduleId) {
  const symptomProfile = symptomProfiles[snapshot.symptom];
  const severityKey = symptomProfile?.severity || "stable";
  const meta = severityMeta[severityKey];

  let score = symptomProfile?.score ?? 78;

  if (snapshot.connection === "Virtual Queue") {
    score -= 6;
  }

  if (snapshot.device === "标签打印机" && snapshot.symptom === "驱动 / 过滤链异常") {
    score -= 4;
  }

  if (moduleId === "sensor") {
    score += 2;
  }

  if (snapshot.symptom === "纸宽或输出异常" && moduleId === "driver") {
    score -= 3;
  }

  return {
    score: clampScore(score),
    severity: severityKey,
    severityLabel: meta.label,
    severitySummary: meta.summary,
    toneSummary: symptomProfile?.toneSummary || meta.summary
  };
}

function buildContext(snapshot) {
  return `当前感知快照：${snapshot.distro} / ${snapshot.device} / ${snapshot.connection} / ${snapshot.symptom}。`;
}

function buildAdaptiveHint(snapshot) {
  if (snapshot.connection === "USB" && snapshot.symptom === "无法识别设备") {
    return "优先看 USB 枚举、设备节点和 `dmesg`，不要先急着重装驱动。";
  }

  if (snapshot.connection === "USB" && snapshot.symptom === "打印队列卡住") {
    return "链路已经大概率存在，优先检查队列状态、旧作业和标签纸宽参数。";
  }

  if (snapshot.symptom === "驱动 / 过滤链异常") {
    return "当前症状更像驱动栈损坏，建议直接进入驱动 / CUPS 重建流程。";
  }

  if (snapshot.connection === "Network") {
    return "网络设备先验证 IP 可达、协议 URI 与队列绑定，再看驱动。";
  }

  return "先把故障收敛到链路、队列或驱动三层，避免重复操作。";
}

function buildSignalDeck(snapshot) {
  const connection =
    connectionProfiles[snapshot.connection] || connectionProfiles.USB;
  const device =
    deviceProfiles[snapshot.device] || deviceProfiles["USB 打印机"];
  const distro = distroProfiles[snapshot.distro] || distroProfiles["deepin 25"];
  const health = buildHealth(snapshot, "sensor");

  const queueHealth =
    snapshot.symptom === "打印队列卡住"
      ? 34
      : snapshot.symptom === "无法识别设备"
        ? 61
        : snapshot.symptom === "驱动 / 过滤链异常"
          ? 48
          : 73;

  const driverIntegrity =
    snapshot.symptom === "驱动 / 过滤链异常"
      ? 29
      : snapshot.symptom === "纸宽或输出异常"
        ? 58
        : 76;

  return [
    {
      label: "OS Stack",
      value: distro.commandFamily,
      percent: health.score,
      tone: health.severity === "critical" ? "warning" : "stable",
      detail: distro.note
    },
    {
      label: "Device Link",
      value: snapshot.connection,
      percent: connection.health,
      tone: connection.health >= 75 ? "stable" : "warning",
      detail: connection.note
    },
    {
      label: "Queue Health",
      value: queueHealth >= 60 ? "Recoverable" : "Blocked",
      percent: queueHealth,
      tone: queueHealth < 40 ? "critical" : "warning",
      detail: "关注 paused、旧作业堆积和 filter failed。"
    },
    {
      label: "Driver Integrity",
      value: device.model,
      percent: driverIntegrity,
      tone: driverIntegrity < 40 ? "critical" : "warning",
      detail: device.note
    }
  ];
}

function buildStageRail(snapshot) {
  const lane = symptomProfiles[snapshot.symptom]?.lane ?? "verify";
  const activeIndex = pipelineStages.findIndex((stage) => stage.id === lane);

  return pipelineStages.map((stage, index) => ({
    ...stage,
    state:
      index < activeIndex ? "done" : index === activeIndex ? "active" : "queued"
  }));
}

function buildOpsBoard(snapshot, flow) {
  const connection =
    connectionProfiles[snapshot.connection] || connectionProfiles.USB;
  const device =
    deviceProfiles[snapshot.device] || deviceProfiles["USB 打印机"];
  const distro = distroProfiles[snapshot.distro] || distroProfiles["deepin 25"];

  return [
    {
      title: "系统底座",
      value: snapshot.distro,
      detail: `${distro.commandFamily} · ${distro.note}`
    },
    {
      title: "设备画像",
      value: snapshot.device,
      detail: `${device.model} · ${device.stack}`
    },
    {
      title: "打印 URI",
      value: connection.uri,
      detail: "后续可直接映射到 CUPS 队列配置。"
    },
    {
      title: "建议路径",
      value: flow.title,
      detail: "当前问答已自动匹配到最接近的故障树分支。"
    }
  ];
}

function buildActionPlan(flow, snapshot) {
  return [
    {
      title: "采集现场快照",
      owner: "Probe",
      timing: "Now",
      detail: `读取 ${snapshot.distro}、${snapshot.connection} 和 ${snapshot.device} 的当前状态，确认症状是否与输入一致。`,
      command: flow.commands[0]
    },
    {
      title: "执行关键修复",
      owner: "Repair",
      timing: "Next",
      detail: flow.steps[1] || flow.steps[0],
      command: flow.commands[2] || flow.commands[1] || flow.commands[0]
    },
    {
      title: "回归验证输出",
      owner: "Verify",
      timing: "Then",
      detail: flow.nextAction,
      command: flow.commands[flow.commands.length - 1]
    }
  ];
}

function buildSceneIntel(snapshot, moduleId) {
  const health = buildHealth(snapshot, moduleId);
  const device =
    deviceProfiles[snapshot.device] || deviceProfiles["USB 打印机"];
  const route = symptomProfiles[snapshot.symptom];

  return [
    {
      label: "Mission Score",
      value: `${health.score}%`,
      detail: health.toneSummary
    },
    {
      label: "Device",
      value: device.model,
      detail: device.note
    },
    {
      label: "Fault Vector",
      value: snapshot.symptom,
      detail: route?.riskTags?.[0] || "系统状态稳定"
    },
    {
      label: "Active Lane",
      value: pipelineStages.find((item) => item.id === route?.lane)?.title || "结果验证",
      detail: "悬停不同模块时，左侧场景和这里的重点都会联动变化。"
    }
  ];
}

function mergeSnapshotWithDiagnostics(previous, diagnostics) {
  const nextSnapshot = { ...previous };
  const { inference } = diagnostics;

  if (snapshotOptions.distro.includes(inference.distro)) {
    nextSnapshot.distro = inference.distro;
  }

  if (snapshotOptions.device.includes(inference.device)) {
    nextSnapshot.device = inference.device;
  }

  if (snapshotOptions.connection.includes(inference.connection)) {
    nextSnapshot.connection = inference.connection;
  }

  if (snapshotOptions.symptom.includes(inference.symptom)) {
    nextSnapshot.symptom = inference.symptom;
  }

  return nextSnapshot;
}

function formatProbeTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function riskTone(risk) {
  if (risk === "privileged") {
    return "critical";
  }

  if (risk === "moderate") {
    return "warning";
  }

  return "stable";
}

function riskLabel(risk) {
  if (risk === "privileged") {
    return "Privileged";
  }

  if (risk === "moderate") {
    return "Moderate";
  }

  return "Safe";
}

function authorizationTone(status) {
  if (status === "interactive") {
    return "warning";
  }

  if (status === "unavailable") {
    return "critical";
  }

  return "stable";
}

function authorizationLabel(status) {
  if (status === "granted") {
    return "API 就绪";
  }

  if (status === "interactive") {
    return "需授权";
  }

  if (status === "unavailable") {
    return "手动";
  }

  return "直连";
}

function executionTone(state, ok) {
  if (state === "blocked" || state === "skipped") {
    return "warning";
  }

  if (state === "failed" || ok === false) {
    return "critical";
  }

  return "stable";
}

function executionLabel(state, mode) {
  if (state === "completed") {
    return "完成";
  }

  if (state === "blocked") {
    return "待授权";
  }

  if (state === "skipped") {
    return "跳过";
  }

  if (state === "failed") {
    return "失败";
  }

  return mode === "run" ? "执行" : "预览";
}

function privilegeMethodLabel(method) {
  if (method === "direct") {
    return "direct";
  }

  if (method === "pkexec") {
    return "pkexec";
  }

  if (method === "sudo-nopasswd") {
    return "sudo -n";
  }

  if (method === "sudo-password") {
    return "sudo password";
  }

  return "manual";
}

function actionRunLabel(action, isBusy, mode) {
  if (isBusy && mode === "run") {
    return "执行中...";
  }

  if (action.authorization?.status === "interactive") {
    return "授权执行";
  }

  if (action.authorization?.status === "unavailable") {
    return "导出脚本";
  }

  return "执行";
}

function actionInputDefaults(action) {
  return (action.inputSchema || []).reduce((accumulator, field) => {
    accumulator[field.id] = field.defaultValue ?? "";
    return accumulator;
  }, {});
}

function mergeActionInputDrafts(actions, previous) {
  return actions.reduce((accumulator, action) => {
    accumulator[action.id] = {
      ...actionInputDefaults(action),
      ...(previous[action.id] || {})
    };
    return accumulator;
  }, {});
}

function findAttachmentPathByLabel(attachments, label) {
  return (
    attachments?.find((item) => item.label?.includes(label))?.path || ""
  );
}

function findActionById(actions, actionId, fallbackId = "") {
  return (
    actions.find((action) => action.id === actionId) ||
    (fallbackId ? actions.find((action) => action.id === fallbackId) : null)
  );
}

const AGENT_SCENARIO_LABELS = {
  "email-assistant": "智能邮件助手",
  "system-repair": "系统问题诊断与修复"
};

const AGENT_SCENARIO_DEFAULT_INPUTS = {
  "email-assistant": "请帮我整理一封更自然的进阶报名邮件。",
  "system-repair": "请帮我看一下系统问题，先给出诊断和修复建议。"
};

const PRINT_REPAIR_CHAIN = [
  {
    id: "reset-print-queues",
    actionId: "reset-print-queues",
    step: "步骤 01",
    title: "删除旧队列",
    summary: "先清空残留队列、旧作业和暂停状态，避免旧配置拖住新修复流程。",
    detail:
      "适合队列卡住、任务堆积、换驱动后还残留旧配置的情况。先做这一步，后面的驱动重装和权限检查才不会被旧状态干扰。",
    note: "会直接指向现有的队列清理动作。",
    accent: "#6dffb7",
    tone: "warning",
    cta: "清理旧队列"
  },
  {
    id: "repair-print-stack",
    actionId: "repair-print-stack",
    step: "步骤 02",
    title: "重装关键驱动包",
    summary: "重装 `cups`、`printer-driver-all` 等核心打印组件，先把基础栈补齐。",
    detail:
      "适合驱动包损坏、依赖断裂、系统更新后打印组件不一致的情况。这个动作会走现有的打印栈重装流程，并在完成后重启 CUPS。",
    note: "如果软件源或依赖链有问题，这一步会先把底层修复回可用状态。",
    accent: "#ffb55e",
    tone: "critical",
    cta: "重装打印栈"
  },
  {
    id: "repair-cups-permissions",
    actionId: "repair-print-stack",
    step: "步骤 03",
    title: "修复 CUPS 过滤链权限",
    summary: "检查 `/usr/lib/cups/filter` 和 `backend` 的执行位与访问权限。",
    detail:
      "如果 `cupsd` 正常但依旧报 `filter failed`、`backend` 找不到或权限异常，这一步就把问题聚焦到过滤链和执行权限，而不是盲目重装更多软件。",
    note: "这条说明仍然落在现有 `repair-print-stack` 动作上，但强调的是过滤链和权限分支。",
    accent: "#73f5ff",
    tone: "stable",
    cta: "查看并修复权限"
  }
];

function agentScenarioLabel(scenario) {
  return AGENT_SCENARIO_LABELS[scenario] || AGENT_SCENARIO_LABELS["email-assistant"];
}

function agentScenarioDefaultInput(scenario) {
  return (
    AGENT_SCENARIO_DEFAULT_INPUTS[scenario] ||
    AGENT_SCENARIO_DEFAULT_INPUTS["email-assistant"]
  );
}

function safeText(value, fallback = "未提供") {
  const text = typeof value === "string" ? value.trim() : String(value || "").trim();
  return text || fallback;
}

function previewText(value, limit = 96, fallback = "未提供") {
  const text = safeText(value, fallback);

  if (text === fallback) {
    return fallback;
  }

  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function stringifyAgentItem(item) {
  if (typeof item === "string" || typeof item === "number") {
    return safeText(item, "");
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  if ("name" in item && "ok" in item) {
    const label = safeText(item.name, "检查项");
    const note = safeText(item.note, "");
    const status = item.ok ? "通过" : "需复核";

    return note ? `${status} · ${label}：${note}` : `${status} · ${label}`;
  }

  if ("name" in item && "value" in item) {
    return `${safeText(item.name, "信号")}：${safeText(item.value, "未提供")}`;
  }

  if ("command" in item) {
    return safeText(item.command, "");
  }

  return Object.values(item)
    .filter(
      (value) => typeof value === "string" || typeof value === "number"
    )
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" · ");
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function toList(value) {
  if (Array.isArray(value)) {
    return uniqueItems(value.map((item) => stringifyAgentItem(item)).filter(Boolean));
  }

  const text = stringifyAgentItem(value);

  return text ? [text] : [];
}

function normalizeConfidence(value, fallback = 80) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function humanizeStatusLabel(value, fallback = "Ready") {
  const text = safeText(value, "");

  if (!text) {
    return fallback;
  }

  return text
    .split("_")
    .map((item) => (item ? `${item[0].toUpperCase()}${item.slice(1)}` : ""))
    .join(" ");
}

function normalizeAgentContextPayload(payload, fallback) {
  const source = safeText(
    payload?.source ||
      (payload?.window || payload?.session || payload?.clipboard
        ? "backend"
        : ""),
    fallback.source || "local"
  );
  const collectedAt = safeText(
    payload?.collectedAt || payload?.timestamp,
    fallback.collectedAt || new Date().toISOString()
  );
  const system = payload?.system || fallback.system;
  const signals = toList(payload?.signals);
  const notes = uniqueItems([
    ...toList(payload?.notes),
    payload?.summary ? `上下文摘要：${safeText(payload.summary, "")}` : ""
  ]);

  return {
    source,
    collectedAt,
    scenario: safeText(payload?.scenario || payload?.scene, fallback.scenario),
    windowTitle: safeText(
      payload?.windowTitle || payload?.window?.title,
      fallback.windowTitle
    ),
    appName: safeText(
      payload?.appName || payload?.window?.appName || payload?.window?.className,
      fallback.appName
    ),
    clipboardPreview: safeText(
      payload?.clipboardPreview || payload?.clipboard?.preview,
      fallback.clipboardPreview
    ),
    sessionType: safeText(
      payload?.sessionType || payload?.session?.type,
      fallback.sessionType
    ),
    prompt: safeText(payload?.prompt, fallback.prompt),
    system: {
      distro: safeText(system?.distro, fallback.system.distro),
      device: safeText(system?.device, fallback.system.device),
      connection: safeText(system?.connection, fallback.system.connection),
      symptom: safeText(system?.symptom, fallback.system.symptom),
      summary: safeText(system?.summary, fallback.system.summary),
      host: safeText(payload?.host?.hostname || system?.host, fallback.system.host)
    },
    signals: signals.length ? signals : fallback.signals,
    notes: notes.length ? notes : fallback.notes
  };
}

function normalizeAgentResult(payload, fallbackContext) {
  if (!payload) {
    return null;
  }

  const scenario = safeText(payload.scenario || payload.scene, fallbackContext.scenario);
  const scenarioLabel = safeText(
    payload.scenarioLabel,
    agentScenarioLabel(scenario)
  );
  const collectorEvidence = uniqueItems([
    ...toList(payload.collector?.evidence),
    ...toList(payload.collector?.sources),
    ...toList(payload.collector?.signals)
  ]);
  const operatorSteps = uniqueItems([
    ...toList(payload.operator?.steps),
    ...toList(payload.operator?.plan),
    ...toList(payload.operator?.questions),
    ...toList(payload.operator?.commandsPreview),
    ...toList(payload.operator?.safety)
  ]);
  const writerNotes = uniqueItems([
    ...toList(payload.writer?.notes),
    ...(toList(payload.writer?.recipients).length
      ? [`收件人线索：${toList(payload.writer?.recipients).join("，")}`]
      : []),
    ...toList(payload.writer?.commands)
  ]);
  const verifierChecks = uniqueItems([
    ...toList(payload.verifier?.checks),
    ...toList(payload.verifier?.notes)
  ]);

  return {
    scenario,
    scenarioLabel,
    source: safeText(
      payload.source || (payload.context ? "backend" : ""),
      fallbackContext.source
    ),
    collectedAt: safeText(
      payload.collectedAt || payload.createdAt || payload.context?.timestamp,
      fallbackContext.collectedAt
    ),
    collector: {
      title: safeText(
        payload.collector?.title,
        "Collector / Context Collector"
      ),
      summary: safeText(
        payload.collector?.summary,
        "已完成上下文采集。"
      ),
      evidence: collectorEvidence
    },
    operator: {
      title: safeText(
        payload.operator?.title,
        "Operator / System Operator"
      ),
      summary: safeText(
        payload.operator?.summary ||
          (payload.operator?.topic
            ? `已收敛到“${payload.operator.topic}”处理路线。`
            : ""),
        "已完成任务路由和步骤编排。"
      ),
      steps: operatorSteps
    },
    writer: {
      title: safeText(
        payload.writer?.title,
        "Writer / Communicator"
      ),
      summary: safeText(
        payload.writer?.summary || (payload.writer?.brief ? "已整理出一版执行摘要。" : ""),
        "已生成面向用户的输出。"
      ),
      draftTitle: safeText(
        payload.writer?.draftTitle || payload.writer?.subject,
        ""
      ),
      draftBody: safeText(
        payload.writer?.draftBody || payload.writer?.body || payload.writer?.brief,
        ""
      ),
      notes: writerNotes
    },
    verifier: {
      title: safeText(
        payload.verifier?.title,
        "Verifier"
      ),
      summary: safeText(
        payload.verifier?.summary,
        "已完成结果校验。"
      ),
      checks: verifierChecks
    },
    outcome: {
      label: humanizeStatusLabel(payload.outcome?.label || payload.outcome?.status),
      summary: safeText(
        payload.outcome?.summary,
        "已生成可继续执行的协作结果。"
      ),
      nextStep: safeText(
        payload.outcome?.nextStep || payload.outcome?.nextAction,
        "继续下一轮确认或执行。"
      ),
      confidence: normalizeConfidence(payload.outcome?.confidence),
      tone: safeText(
        payload.outcome?.tone,
        payload.outcome?.status === "needs_more_info" ? "warning" : "stable"
      )
    }
  };
}

function buildFallbackAgentContext({
  scenario,
  input,
  clipboardText,
  snapshot,
  probeData,
  actionEnvironment,
  activeModule
}) {
  const windowTitle =
    typeof document !== "undefined" ? document.title : "Orbit Deepin Assistant";
  const source = "local";
  const systemSummary = probeData?.system
    ? `${safeText(probeData.system.prettyName, snapshot.distro)} / ${safeText(
        probeData.system.kernel,
        "unknown-kernel"
      )}`
    : `${snapshot.distro} / ${snapshot.device} / ${snapshot.connection}`;
  const queueSummary = probeData?.printers?.summary || snapshot.symptom;
  const clipboardPreview = previewText(
    clipboardText || input || "",
    96,
    "未读取剪贴板"
  );

  return {
    source,
    collectedAt: new Date().toISOString(),
    scenario,
    windowTitle,
    appName: safeText(activeModule?.title, "Orbit Deepin Assistant"),
    clipboardPreview,
    sessionType: safeText(actionEnvironment?.sessionType, "browser"),
    prompt: safeText(input, ""),
    system: {
      distro: snapshot.distro,
      device: snapshot.device,
      connection: snapshot.connection,
      symptom: snapshot.symptom,
      summary: systemSummary,
      host: safeText(probeData?.host?.hostname, "local-host")
    },
    signals: [
      `当前场景：${agentScenarioLabel(scenario)}`,
      `系统快照：${snapshot.distro} / ${snapshot.device} / ${snapshot.connection}`,
      `队列状态：${queueSummary || "未读取"}`
    ],
    notes: [
      "当前上下文由前端本地快照与实时诊断结果拼接而成。",
      "如果后端 context/live 暂时不可用，这里会自动回退到前端快照。"
    ]
  };
}

function buildFallbackAgentResult({
  scenario,
  input,
  context
}) {
  const scenarioLabel = agentScenarioLabel(scenario);
  const prompt = safeText(input, "");
  const collectorEvidence = [
    `窗口：${context.windowTitle}`,
    `剪贴板：${context.clipboardPreview}`,
    `系统：${context.system.summary}`
  ];

  if (scenario === "system-repair") {
    return {
      scenario,
      scenarioLabel,
      source: "local",
      collectedAt: context.collectedAt,
      collector: {
        title: "Collector / Context Collector",
        summary: "已采集系统快照、会话信息和当前问题描述。",
        evidence: collectorEvidence
      },
      operator: {
        title: "Operator / System Operator",
        summary: "问题更像桌面系统修复任务，先收敛到服务、设备和队列三层。",
        steps: [
          "先确认当前系统版本、会话类型和关键服务状态。",
          "再看设备枚举、日志和队列状态，避免直接重装。",
          "确认风险后，再执行修复动作并做一次回读验证。"
        ]
      },
      writer: {
        title: "Writer / Communicator",
        summary: "整理成可执行的修复摘要，方便继续确认。",
        draftTitle: `系统问题诊断摘要：${context.system.symptom}`,
        draftBody: [
          "当前判断更偏向系统问题诊断，而不是直接重装。",
          "",
          `问题描述：${prompt || context.system.symptom}`,
          `系统快照：${context.system.summary}`,
          "",
          "建议顺序：",
          "1. 检查服务状态",
          "2. 检查设备枚举和日志",
          "3. 再决定是否执行修复动作",
          "",
          "如果需要，我可以继续把这一步拆成更细的执行建议。"
        ].join("\n"),
        notes: [
          "这一步先保留确认，不直接下发高风险动作。",
          "如果后端 agent-teams/run 暂时不可用，这里会自动回退到本地演示结果。"
        ]
      },
      verifier: {
        title: "Verifier",
        summary: "确认结果还处在诊断阶段，尚未执行系统修改。",
        checks: [
          "服务是否在线",
          "设备是否枚举",
          "日志是否出现新的错误",
          "是否保留人工确认"
        ]
      },
      outcome: {
        label: "Ready for repair",
        summary: "已生成系统修复方向的草稿，可以继续确认执行范围。",
        nextStep: "先预览修复动作，再决定是否执行。",
        confidence: 84,
        tone: "warning"
      }
    };
  }

  return {
    scenario,
    scenarioLabel,
    source: "local",
    collectedAt: context.collectedAt,
    collector: {
      title: "Collector / Context Collector",
      summary: "已读取当前窗口、剪贴板和文档上下文。",
      evidence: collectorEvidence
    },
    operator: {
      title: "Operator / System Operator",
      summary: "判断当前更像邮件整理任务，先组织收件对象和语气。",
      steps: [
        "先确认邮件主题是否明确。",
        "结合当前上下文提炼收件对象和正文重点。",
        "保留人工确认后，再发送或导出。"
      ]
    },
    writer: {
      title: "Writer / Communicator",
      summary: "已整理出可编辑的邮件草稿。",
      draftTitle: "关于 deepin Agent Teams 第一阶段设计文档的说明",
      draftBody: [
        "您好，",
        "",
        `我这边整理了一版项目说明，当前关注点是：${prompt || "根据当前上下文整理邮件"}`,
        "",
        `系统上下文：${context.system.summary}`,
        `剪贴板摘要：${context.clipboardPreview}`,
        "",
        "如果需要，我可以继续把正文压得更短，或者补上更正式的版本。",
        "",
        "谢谢。"
      ].join("\n"),
      notes: [
        "邮件内容已按当前上下文组织。",
        "发送前还可以继续人工修改。"
      ]
    },
    verifier: {
      title: "Verifier",
      summary: "确认草稿结构完整，发送前保留人工确认。",
      checks: [
        "主题是否准确",
        "收件人是否正确",
        "正文是否自然",
        "附件是否齐全"
      ]
    },
    outcome: {
      label: "Ready to send",
      summary: "邮件草稿已经整理好，可以继续确认收件人后发送。",
      nextStep: "确认收件人和附件后再发。",
      confidence: 88,
      tone: "stable"
    }
  };
}

function manualExecutionTone(status) {
  if (status === "completed") {
    return "stable";
  }

  if (status === "failed") {
    return "critical";
  }

  return "warning";
}

function manualExecutionLabel(status) {
  if (status === "completed") {
    return "已回填";
  }

  if (status === "failed") {
    return "执行失败";
  }

  return "等待回执";
}

function solutionRouteLabel(route) {
  if (route === "discover") {
    return "发现设备";
  }

  if (route === "queue-recovery") {
    return "队列恢复";
  }

  if (route === "stack-repair") {
    return "打印栈修复";
  }

  return "PPD 微调";
}

function timelineTone(status) {
  if (status === "error") {
    return "critical";
  }

  if (status === "warning" || status === "skip" || status === "blocked") {
    return "warning";
  }

  return "stable";
}

function timelineLabel(status) {
  if (status === "queued") {
    return "queued";
  }

  if (status === "preview") {
    return "preview";
  }

  if (status === "skip") {
    return "skip";
  }

  if (status === "blocked") {
    return "blocked";
  }

  return status;
}

function createResponse(question, activeModule, snapshot) {
  const bestFlow = findBestFlow(question, activeModule.id);
  const targetModule = moduleMap[bestFlow.moduleId];
  const health = buildHealth(snapshot, targetModule.id);
  const symptom = symptomProfiles[snapshot.symptom];

  return {
    moduleName: targetModule.title,
    label: targetModule.label,
    title: bestFlow.title,
    summary: bestFlow.summary,
    context: buildContext(snapshot),
    adaptiveHint: buildAdaptiveHint(snapshot),
    steps: bestFlow.steps,
    commands: bestFlow.commands,
    nextAction: bestFlow.nextAction,
    severity: health.severity,
    severityLabel: health.severityLabel,
    severitySummary: health.severitySummary,
    score: health.score,
    riskTags: [
      snapshot.device,
      snapshot.connection,
      ...(symptom?.riskTags || [])
    ].slice(0, 4),
    stageRail: buildStageRail(snapshot),
    actionPlan: buildActionPlan(bestFlow, snapshot),
    opsBoard: buildOpsBoard(snapshot, bestFlow)
  };
}

function SeverityDial({ score, severityLabel, summary, tone }) {
  return (
    <article className={`severity-dial is-${tone}`}>
      <div className="severity-dial__ring">
        <strong>{score}</strong>
        <span>Health</span>
      </div>
      <div className="severity-dial__copy">
        <p className="eyebrow">Mission health</p>
        <h3>{severityLabel}</h3>
        <p>{summary}</p>
      </div>
    </article>
  );
}

function StageRail({ stages }) {
  return (
    <div className="stage-rail">
      {stages.map((stage) => (
        <article
          key={stage.id}
          className={`stage-rail__item is-${stage.state}`}
        >
          <span />
          <strong>{stage.title}</strong>
          <small>{stage.detail}</small>
        </article>
      ))}
    </div>
  );
}

function LiveProbePanel({ probe, onRefresh }) {
  const isLoading = probe.status === "loading";

  return (
    <section className="live-probe">
      <div className="live-probe__head">
        <div>
          <p className="eyebrow">Live Probe</p>
          <h3>本机实时诊断</h3>
        </div>

        <button
          type="button"
          className="copy-button"
          disabled={isLoading}
          onClick={() => onRefresh()}
        >
          {isLoading ? "采集中..." : "采集真实快照"}
        </button>
      </div>

      {probe.error ? <p className="probe-error">{probe.error}</p> : null}

      {probe.data ? (
        <>
          <div className="live-probe__grid">
            <article className="probe-card">
              <span>Host</span>
              <strong>{probe.data.host.hostname}</strong>
              <small>
                {probe.data.system.prettyName} · {probe.data.system.kernel}
              </small>
            </article>

            <article className="probe-card">
              <span>Network</span>
              <strong>{probe.data.network.online ? "online" : "offline"}</strong>
              <small>{probe.data.network.summary}</small>
            </article>

            <article className="probe-card">
              <span>Resources</span>
              <strong>{probe.data.resources.storage.usePercent}</strong>
              <small>
                Memory {probe.data.resources.memory.used} / {probe.data.resources.memory.total}
              </small>
            </article>

            <article className="probe-card">
              <span>CUPS</span>
              <strong>{probe.data.services.cupsActive}</strong>
              <small>
                enabled: {probe.data.services.cupsEnabled || "unknown"} · failed units:{" "}
                {probe.data.services.failedUnits.count}
              </small>
            </article>

            <article className="probe-card">
              <span>Queue</span>
              <strong>{probe.data.printers.summary}</strong>
              <small>
                default: {probe.data.printers.defaultPrinter || "未设置"}
              </small>
            </article>

            <article className="probe-card">
              <span>Inference</span>
              <strong>{probe.data.inference.symptom}</strong>
              <small>{probe.data.inference.note}</small>
            </article>
          </div>

          <div className="probe-status">
            <div>
              <span>连接方式</span>
              <strong>{probe.data.inference.connection || "未确定"}</strong>
            </div>
            <div>
              <span>设备类型</span>
              <strong>{probe.data.inference.device || "未识别设备"}</strong>
            </div>
            <div>
              <span>检测时间</span>
              <strong>{formatProbeTime(probe.data.timestamp)}</strong>
            </div>
            <div>
              <span>USB 设备数</span>
              <strong>{probe.data.usb.deviceCount}</strong>
            </div>
            <div>
              <span>失败服务数</span>
              <strong>{probe.data.services.failedUnits.count}</strong>
            </div>
          </div>

          <div className="probe-recommendations">
            <span>建议优先执行</span>
            <div className="probe-command-list">
              {probe.data.recommendations.map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </div>

          {probe.data.solutionPlan ? (
            <div className="probe-plan">
              <div className="probe-plan__head">
                <div>
                  <span>当前处理建议</span>
                  <strong>{probe.data.solutionPlan.headline}</strong>
                </div>
                <span className="tone-pill is-warning">
                  {solutionRouteLabel(probe.data.solutionPlan.route)} ·{" "}
                  {probe.data.solutionPlan.confidence}%
                </span>
              </div>
              <div className="tag-row">
                {probe.data.solutionPlan.recommendedActionIds.map((item) => (
                  <span key={item} className="tag-pill">
                    {item}
                  </span>
                ))}
                <span
                  className={`tone-pill is-${
                    probe.data.solutionPlan.ppdRelevant ? "warning" : "stable"
                  }`}
                >
                  {probe.data.solutionPlan.ppdRelevant
                    ? "PPD 可参与"
                    : "先别动 PPD"}
                </span>
              </div>
              <div className="probe-plan__grid">
                {probe.data.solutionPlan.stages.map((item) => (
                  <article key={item.title} className="probe-plan__item">
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                    <div className="probe-command-list">
                      {item.commands.map((command) => (
                        <code key={command}>{command}</code>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <ul className="probe-plan__notes">
                {probe.data.solutionPlan.notes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="probe-details">
            <summary>查看采集详情</summary>
            <div className="probe-details__grid">
              {probe.data.commands.map((item) => (
                <article key={item.name} className="probe-command">
                  <div className="probe-command__head">
                    <strong>{item.name}</strong>
                    <span className={`tone-pill is-${item.ok ? "stable" : "critical"}`}>
                      {item.ok ? "ok" : "error"}
                    </span>
                  </div>
                  <code>{item.command}</code>
                  <pre>{item.preview.join("\n") || item.stderr || "No output"}</pre>
                </article>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="probe-empty">
          还没有采集到真实系统数据。点击“采集真实快照”后，前端会读取本机
          `os-release`、`lpstat`、`lpinfo`、`lsusb` 和 CUPS 日志。
        </p>
      )}
    </section>
  );
}

function AgentRoleCard({ role, title, summary, items, body, tone }) {
  return (
    <article className="agent-role-card">
      <div className="agent-role-card__head">
        <div>
          <span>{role}</span>
          <strong>{title}</strong>
        </div>
        <span className={`tone-pill is-${tone}`}>{role}</span>
      </div>

      <p className="agent-role-card__summary">{summary}</p>

      {items?.length ? (
        <ul className="agent-role-card__list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {body ? <pre className="agent-role-card__code">{body}</pre> : null}
    </article>
  );
}

function AgentTeamsPanel({
  contextState,
  scenario,
  input,
  clipboardText,
  resultState,
  onScenarioChange,
  onInputChange,
  onRefreshContext,
  onReadClipboard,
  onRunTeams
}) {
  const contextTone =
    contextState.status === "loading"
      ? "warning"
      : contextState.status === "fallback"
        ? "warning"
        : "stable";
  const resultTone =
    resultState.status === "loading"
      ? "warning"
      : resultState.status === "fallback"
        ? "warning"
        : resultState.status === "error"
          ? "critical"
          : "stable";

  return (
    <section className="agent-teams">
      <div className="agent-teams__head">
        <div>
          <p className="eyebrow">Agent Teams</p>
          <h3>协作分工</h3>
          <p className="agent-teams__lede">
            这里把实时上下文、任务输入和四个角色的分工整理成一条清楚的处理链。
          </p>
        </div>

        <div className="tag-row">
          <span className="tag-pill">context/live</span>
          <span className="tag-pill">agent-teams/run</span>
          <button type="button" className="copy-button" onClick={onRefreshContext}>
            {contextState.status === "loading" ? "刷新中..." : "刷新上下文"}
          </button>
        </div>
      </div>

      {contextState.error ? <p className="probe-error">{contextState.error}</p> : null}
      {resultState.error ? <p className="probe-error">{resultState.error}</p> : null}

      <div className="agent-teams__grid">
        <article className="agent-teams__card">
          <div className="agent-teams__card-head">
            <div>
              <span>实时上下文采集</span>
              <strong>
                {safeText(
                  contextState.data?.scenarioLabel || agentScenarioLabel(scenario),
                  "未选择场景"
                )}
              </strong>
            </div>
            <span className={`tone-pill is-${contextTone}`}>
              {safeText(contextState.data?.source, "local")}
            </span>
          </div>

          <p className="agent-teams__meta">
            {contextState.data
              ? `采集于 ${formatProbeTime(contextState.data.collectedAt)} · ${
                  contextState.data.sessionType || "browser"
                }`
              : "上下文还在准备中。点击刷新后会优先读取后端 context/live，未接通时会自动降级到本地快照。"}
          </p>

          <div className="agent-mini-grid">
            <article className="agent-mini-card">
              <span>Window</span>
              <strong>{safeText(contextState.data?.windowTitle, "未提供")}</strong>
              <p>{safeText(contextState.data?.appName, "未提供")}</p>
            </article>
            <article className="agent-mini-card">
              <span>System</span>
              <strong>{safeText(contextState.data?.system?.summary, "未提供")}</strong>
              <p>
                {safeText(contextState.data?.system?.distro, "未提供")} ·{" "}
                {safeText(contextState.data?.system?.device, "未提供")}
              </p>
            </article>
            <article className="agent-mini-card">
              <span>Clipboard</span>
              <strong>{previewText(clipboardText || contextState.data?.clipboardPreview, 64)}</strong>
              <p>{safeText(contextState.data?.clipboardPreview, "未读取")}</p>
            </article>
            <article className="agent-mini-card">
              <span>Prompt</span>
              <strong>{previewText(input, 64, "未填写")}</strong>
              <p>{safeText(contextState.data?.prompt, "等待用户输入")}</p>
            </article>
          </div>

          <div className="tag-row agent-teams__signals">
            {contextState.data?.signals?.length ? (
              contextState.data.signals.map((item) => (
                <span key={item} className="tag-pill">
                  {item}
                </span>
              ))
            ) : (
              <span className="tag-pill">等待上下文结果</span>
            )}
          </div>

          {contextState.data?.notes?.length ? (
            <ul className="agent-teams__notes">
              {contextState.data.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="agent-teams__card">
          <div className="agent-teams__card-head">
            <div>
              <span>场景与输入</span>
              <strong>{agentScenarioLabel(scenario)}</strong>
            </div>
            <span className={`tone-pill is-${resultTone}`}>
              {resultState.status === "idle"
                ? "等待运行"
                : resultState.status === "loading"
                  ? "运行中"
                  : resultState.status === "fallback"
                    ? "本地降级"
                    : resultState.status === "error"
                      ? "运行失败"
                      : "已完成"}
            </span>
          </div>

          <div className="agent-scenario-switch">
            {Object.keys(AGENT_SCENARIO_LABELS).map((item) => (
              <button
                key={item}
                type="button"
                className={`copy-button ${scenario === item ? "is-active" : ""}`}
                onClick={() => onScenarioChange(item)}
              >
                {agentScenarioLabel(item)}
              </button>
            ))}
          </div>

          <label className="agent-teams__field">
            <span>用户输入</span>
            <textarea
              value={input}
              placeholder={agentScenarioDefaultInput(scenario)}
              onChange={(event) => onInputChange(event.target.value)}
            />
          </label>

          <div className="agent-teams__actions">
            <button type="button" className="copy-button" onClick={onReadClipboard}>
              读取剪贴板
            </button>
            <button type="button" className="copy-button" onClick={onRefreshContext}>
              刷新上下文
            </button>
            <button type="button" className="action-run" onClick={onRunTeams}>
              运行多智能体
            </button>
          </div>

          <p className="agent-teams__meta">
            {clipboardText
              ? `当前剪贴板已缓存，可作为上下文补充。`
              : "剪贴板内容是可选输入，后续可以接后端或浏览器授权后再自动读取。"}
          </p>
        </article>
      </div>

      {resultState.result ? (
        <div className="agent-teams__results">
          <div className="agent-teams__result-head">
            <div>
              <p className="eyebrow">协作结果</p>
              <h4>{safeText(resultState.result.scenarioLabel, agentScenarioLabel(scenario))}</h4>
            </div>
            <div className="tag-row">
              <span className={`tone-pill is-${resultTone}`}>{resultState.result.source || "local"}</span>
              <span className="tone-pill is-stable">
                {formatProbeTime(resultState.result.collectedAt)}
              </span>
            </div>
          </div>

          <div className="agent-role-grid">
            <AgentRoleCard
              role="collector"
              title={resultState.result.collector.title}
              summary={resultState.result.collector.summary}
              items={resultState.result.collector.evidence}
              tone="stable"
            />
            <AgentRoleCard
              role="operator"
              title={resultState.result.operator.title}
              summary={resultState.result.operator.summary}
              items={resultState.result.operator.steps}
              tone="warning"
            />
            <AgentRoleCard
              role="writer"
              title={resultState.result.writer.title}
              summary={resultState.result.writer.summary}
              items={resultState.result.writer.notes}
              body={
                resultState.result.writer.draftBody
                  ? `${safeText(resultState.result.writer.draftTitle, "Writer draft")}\n\n${resultState.result.writer.draftBody}`
                  : ""
              }
              tone="stable"
            />
            <AgentRoleCard
              role="verifier"
              title={resultState.result.verifier.title}
              summary={resultState.result.verifier.summary}
              items={resultState.result.verifier.checks}
              tone="critical"
            />
          </div>

          <article className="agent-outcome">
            <div className="agent-outcome__head">
              <div>
                <span>处理结论</span>
                <strong>{resultState.result.outcome.label}</strong>
              </div>
              <span className="tone-pill is-stable">
                {resultState.result.outcome.confidence}%
              </span>
            </div>

            <p>{resultState.result.outcome.summary}</p>
            <p className="agent-outcome__next">{resultState.result.outcome.nextStep}</p>
            <div className="tag-row">
              <span className="tag-pill">{resultState.result.outcome.tone}</span>
            </div>
          </article>
        </div>
      ) : (
        <p className="agent-empty">
          点击“运行多智能体”后，这里会展示 collector / operator / writer / verifier
          的分工输出和最终 outcome。
        </p>
      )}
    </section>
  );
}

function PrintRepairChainPanel({
  actions,
  probe,
  snapshot,
  actionState,
  onPreview,
  onRun
}) {
  const recommendedActionIds = probe.data?.solutionPlan?.recommendedActionIds || [];
  const queueSummary = probe.data?.printers?.summary || "No configured print queue found";
  const routeLabel = probe.data?.solutionPlan
    ? solutionRouteLabel(probe.data.solutionPlan.route)
    : "等待诊断";

  return (
    <section className="print-repair-chain">
      <div className="print-repair-chain__head">
        <div>
          <p className="eyebrow">Printer Repair</p>
          <h3>打印机驱动修复链</h3>
          <p className="print-repair-chain__lede">
            这一条链把最常用的三步放在最前面：先删旧队列，再重装关键驱动包，最后补 CUPS 过滤链权限和执行位。
          </p>
        </div>

        <div className="tag-row">
          <span className="tag-pill">{snapshot.symptom}</span>
          <span className="tag-pill">{routeLabel}</span>
          <span className="tag-pill">{queueSummary}</span>
        </div>
      </div>

      {probe.data?.solutionPlan?.notes?.length ? (
        <ul className="print-repair-chain__notes">
          {probe.data.solutionPlan.notes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="print-repair-chain__grid">
        {PRINT_REPAIR_CHAIN.map((step) => {
          const action = findActionById(actions, step.actionId);
          const isBusy = actionState.loading && actionState.activeId === step.actionId;
          const isRecommended =
            recommendedActionIds.includes(step.actionId) ||
            (step.actionId === "repair-print-stack" &&
              probe.data?.solutionPlan?.ppdRelevant === false);

          return (
            <article
              key={step.id}
              className={`print-repair-step ${isRecommended ? "is-highlighted" : ""} ${
                isBusy ? "is-busy" : ""
              }`}
              style={{ "--step-accent": step.accent }}
            >
              <div className="print-repair-step__head">
                <div>
                  <span>{step.step}</span>
                  <strong>{action?.title || step.title}</strong>
                </div>
                <span className={`tone-pill is-${step.tone}`}>
                  {action ? "已接入" : "待接入"}
                </span>
              </div>

              <p className="print-repair-step__summary">{step.summary}</p>
              <p className="print-repair-step__detail">{step.detail}</p>

              <div className="tag-row print-repair-step__tags">
                <span className="tag-pill">动作：{step.actionId}</span>
                <span className="tag-pill">
                  {isRecommended ? "当前建议" : "可手动触发"}
                </span>
              </div>

              <div className="print-repair-step__buttons">
                <button
                  type="button"
                  className="copy-button"
                  disabled={actionState.loading || !action}
                  onClick={() => onPreview(step.actionId)}
                >
                  预览
                </button>
                <button
                  type="button"
                  className="action-run"
                  disabled={actionState.loading || !action}
                  onClick={() => onRun(step.actionId)}
                >
                  {isBusy && actionState.mode === "run" ? "执行中..." : step.cta}
                </button>
              </div>

              <p className="print-repair-step__note">
                {step.note}
                {action?.summary ? ` ${action.summary}` : ""}
              </p>
            </article>
          );
        })}
      </div>

      <div className="print-repair-chain__footer">
        <span className="tag-pill">推荐顺序：删除旧队列 / 重装关键驱动包 / 修复过滤链权限</span>
        <span className="tag-pill">后续动作：测试打印 / 回归检查 / 必要时重建队列</span>
      </div>
    </section>
  );
}

function ActionConsole({
  actions,
  actionEnvironment,
  actionInputs,
  actionState,
  actionHistory,
  copiedId,
  onPreview,
  onRun,
  onActionInputChange,
  onCopyText,
  onCheckManualExecution
}) {
  return (
    <section className="action-console">
      <div className="action-console__head">
        <div>
          <p className="eyebrow">Action Console</p>
          <h3>执行控制台</h3>
        </div>
        <div className="tag-row">
          <span className="tag-pill">支持包</span>
          <span className="tag-pill">工单导出</span>
          <span className="tag-pill">修复动作预览</span>
        </div>
      </div>

      {actionEnvironment ? (
        <div className="action-console__environment">
          <div className="tag-row">
            <span className="tag-pill">账号 {actionEnvironment.user}</span>
            <span className="tag-pill">{actionEnvironment.sessionType}</span>
            <span className="tag-pill">
              {actionEnvironment.availableMethods?.length
                ? actionEnvironment.availableMethods
                    .map((item) => privilegeMethodLabel(item))
                    .join(" / ")
                : "manual"}
            </span>
          </div>
          <p className="action-console__hint">{actionEnvironment.summary}</p>
        </div>
      ) : null}

      {actionState.error ? <p className="probe-error">{actionState.error}</p> : null}

      <div className="action-console__grid">
        {actions.map((action) => {
          const tone = riskTone(action.risk);
          const isBusy = actionState.loading && actionState.activeId === action.id;

          return (
            <article key={action.id} className="action-tile">
              <div className="action-tile__head">
                <strong>{action.title}</strong>
                <span className={`tone-pill is-${tone}`}>{riskLabel(action.risk)}</span>
              </div>

              <p>{action.description}</p>

              <div className="tag-row">
                <span className="tag-pill">{action.module}</span>
                {action.requiresRoot ? <span className="tag-pill">needs root</span> : null}
              </div>

              {action.authorization ? (
                <div className="action-auth">
                  <div className="action-auth__head">
                    <strong>权限状态</strong>
                    <span
                      className={`tone-pill is-${authorizationTone(
                        action.authorization.status
                      )}`}
                    >
                      {authorizationLabel(action.authorization.status)}
                    </span>
                  </div>
                  <p>{action.authorization.summary}</p>
                </div>
              ) : null}

              <ul className="action-preview">
                {action.previewCommands.map((item) => (
                  <li key={item}>
                    <code>{item}</code>
                  </li>
                ))}
              </ul>

              {action.inputSchema?.length ? (
                <div className="action-inputs">
                  {action.inputSchema.map((field) => (
                    <label key={field.id} className="action-field">
                      <span>{field.label}</span>
                      <input
                        type="text"
                        value={actionInputs[action.id]?.[field.id] ?? field.defaultValue ?? ""}
                        placeholder={field.placeholder || ""}
                        required={field.required}
                        onChange={(event) =>
                          onActionInputChange(action.id, field.id, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="action-tile__buttons">
                <button
                  type="button"
                  className="copy-button"
                  disabled={actionState.loading}
                  onClick={() => onPreview(action.id)}
                >
                  {isBusy && actionState.mode === "preview" ? "预览中..." : "预览"}
                </button>
                <button
                  type="button"
                  className="action-run"
                  disabled={actionState.loading}
                  onClick={() => onRun(action.id)}
                >
                  {actionRunLabel(action, isBusy, actionState.mode)}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {actionState.result ? (
        <article className="action-result">
          <div className="action-result__head">
            <div>
              <p className="eyebrow">Last Action</p>
              <h3>{actionState.result.action.title}</h3>
            </div>
            <div className="tag-row">
              <span
                className={`tone-pill is-${executionTone(
                  actionState.result.state,
                  actionState.result.ok
                )}`}
              >
                {executionLabel(actionState.result.state, actionState.result.mode)}
              </span>
              <span className={`tone-pill is-${riskTone(actionState.result.action.risk)}`}>
                {riskLabel(actionState.result.action.risk)}
              </span>
            </div>
          </div>

          <p className="action-result__summary">{actionState.result.summary}</p>

          {actionState.result.warnings?.length ? (
            <div className="action-result__block">
              <h4>注意事项</h4>
              <ul>
                {actionState.result.warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {actionState.result.timeline?.length ? (
            <div className="action-result__block">
              <h4>执行时间线</h4>
              <div className="timeline-list">
                {actionState.result.timeline.map((item, index) => (
                  <article key={`${item.at}-${index}`} className="timeline-item">
                    <div className="timeline-item__meta">
                      <span className={`tone-pill is-${timelineTone(item.status)}`}>
                        {timelineLabel(item.status)}
                      </span>
                      <strong>{formatProbeTime(item.at)}</strong>
                    </div>
                    <p className="timeline-item__title">{item.title}</p>
                    <small>{item.detail}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {actionState.result.authorization ? (
            <div className="action-result__block">
              <h4>授权状态</h4>
              <div className="action-auth action-auth--result">
                <div className="action-auth__head">
                  <strong>{actionState.result.authorization.summary}</strong>
                  <span
                    className={`tone-pill is-${authorizationTone(
                      actionState.result.authorization.status
                    )}`}
                  >
                    {authorizationLabel(actionState.result.authorization.status)}
                  </span>
                </div>
                <p>{actionState.result.authorization.detail}</p>
              </div>
            </div>
          ) : null}

          {actionState.result.artifact ? (
            <div className="action-result__artifact">
              <span>已导出文件</span>
              <code>{actionState.result.artifact.path}</code>
              <button
                type="button"
                className="copy-button"
                onClick={() =>
                  onCopyText(
                    `artifact-${actionState.result.action.id}`,
                    actionState.result.artifact.path
                  )
                }
              >
                {copiedId === `artifact-${actionState.result.action.id}`
                  ? "已复制路径"
                  : "复制路径"}
              </button>
            </div>
          ) : null}

          {actionState.result.attachments?.length ? (
            <div className="action-result__block">
              <h4>附加文件</h4>
              <div className="action-attachments">
                {actionState.result.attachments.map((item, index) => (
                  <div
                    key={`${item.path}-${index}`}
                    className="action-result__artifact"
                  >
                    <span>{item.label || "附件"}</span>
                    <code>{item.path}</code>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() =>
                        onCopyText(
                          `attachment-${actionState.result.action.id}-${index}`,
                          item.path
                        )
                      }
                    >
                      {copiedId === `attachment-${actionState.result.action.id}-${index}`
                        ? "已复制路径"
                        : "复制路径"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {actionState.result.queueBlueprint ? (
            <div className="action-result__block">
              <h4>队列蓝图</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queueBlueprint.queueName}</strong>
                  <span className="tone-pill is-warning">
                    {actionState.result.queueBlueprint.concreteUriDetected
                      ? "可直接套用"
                      : "需补 URI"}
                  </span>
                </div>
                <p>
                  {actionState.result.queueBlueprint.deviceLabel} ·{" "}
                  {actionState.result.queueBlueprint.connection} · driver{" "}
                  {actionState.result.queueBlueprint.driverModel}
                </p>
                <div className="tag-row">
                  {actionState.result.queueBlueprint.backendHints?.map((item) => (
                    <span key={item} className="tag-pill">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="action-run"
                    disabled={actionState.loading}
                    onClick={() => onRun("apply-queue-blueprint")}
                  >
                    {actionState.result.queueBlueprint.concreteUriDetected
                      ? "进入建队列"
                      : "预填建队列"}
                  </button>
                </div>
                <div className="action-blueprint__grid">
                  <section>
                    <h5>候选 URI</h5>
                    <ul>
                      {actionState.result.queueBlueprint.candidateUris.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h5>命令模板</h5>
                    <ul>
                      {actionState.result.queueBlueprint.commands.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
                {actionState.result.queueBlueprint.notes?.length ? (
                  <ul>
                    {actionState.result.queueBlueprint.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            </div>
          ) : null}

          {actionState.result.queueProvisioning ? (
            <div className="action-result__block">
              <h4>队列部署</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queueProvisioning.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.state === "completed"
                        ? "stable"
                        : actionState.result.state === "blocked"
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {actionState.result.state === "completed"
                      ? "已建队列"
                      : actionState.result.state === "blocked"
                        ? "待授权"
                        : "待修正"}
                  </span>
                </div>
                <p>
                  URI：
                  <code>{actionState.result.queueProvisioning.deviceUri || "未填写"}</code>
                </p>
                <div className="tag-row">
                  <span className="tag-pill">
                    driver {actionState.result.queueProvisioning.driverModel}
                  </span>
                  <span className="tag-pill">
                    {actionState.result.queueProvisioning.setDefault
                      ? "设为默认"
                      : "不改默认"}
                  </span>
                </div>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="copy-button"
                    disabled={
                      actionState.loading ||
                      !actionState.result.queueProvisioning.queueName
                    }
                    onClick={() => onRun("run-queue-regression-check")}
                  >
                    跑回归检查
                  </button>
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      !actionState.result.queueProvisioning.queueName
                    }
                    onClick={() => onRun("run-queue-smoke-test")}
                  >
                    发测试打印
                  </button>
                </div>
              </article>
            </div>
          ) : null}

          {actionState.result.queueSmokeTest ? (
            <div className="action-result__block">
              <h4>测试打印</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queueSmokeTest.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.ok ? "stable" : "warning"
                    }`}
                  >
                    {actionState.result.ok ? "已提交" : "提交异常"}
                  </span>
                </div>
                {actionState.result.queueSmokeTest.jobId ? (
                  <p>
                    作业号：
                    <code>{actionState.result.queueSmokeTest.jobId}</code>
                  </p>
                ) : null}
                <p>
                  测试页：
                  <code>{actionState.result.queueSmokeTest.testPagePath}</code>
                </p>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="copy-button"
                    disabled={actionState.loading}
                    onClick={() => onRun("run-queue-regression-check")}
                  >
                    跑回归检查
                  </button>
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      !actionInputs["rollback-ppd-backup"]?.backupPpdPath
                    }
                    onClick={() => onRun("rollback-ppd-backup")}
                  >
                    回滚旧 PPD
                  </button>
                </div>
                <section>
                  <h5>排队回执</h5>
                  <ul>
                    {actionState.result.queueSmokeTest.spoolPreview?.length ? (
                      actionState.result.queueSmokeTest.spoolPreview.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))
                    ) : (
                      <li>当前没有读取到待处理作业回执，可能已直接送达设备或提交失败。</li>
                    )}
                  </ul>
                </section>
              </article>
            </div>
          ) : null}

          {actionState.result.queueRegression ? (
            <div className="action-result__block">
              <h4>队列回归检查</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queueRegression.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.queueRegression.regressionHealthy
                        ? "stable"
                        : "warning"
                    }`}
                  >
                    {actionState.result.queueRegression.regressionHealthy
                      ? "回归稳定"
                      : "仍有风险"}
                  </span>
                </div>
                <p>
                  PPD：
                  <code>{actionState.result.queueRegression.ppdPath}</code>
                </p>
                <div className="tag-row">
                  <span
                    className={`tag-pill ${
                      actionState.result.queueRegression.queueStable
                        ? ""
                        : "is-warning"
                    }`}
                  >
                    {actionState.result.queueRegression.queueStable
                      ? "队列稳定"
                      : "队列异常"}
                  </span>
                  <span
                    className={`tag-pill ${
                      actionState.result.queueRegression.ppdHealthy
                        ? ""
                        : "is-warning"
                    }`}
                  >
                    {actionState.result.queueRegression.ppdHealthy
                      ? "PPD 校验通过"
                      : "PPD 有风险"}
                  </span>
                </div>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="copy-button"
                    disabled={actionState.loading}
                    onClick={() => onRun("run-queue-smoke-test")}
                  >
                    发测试打印
                  </button>
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      !actionInputs["rollback-ppd-backup"]?.backupPpdPath
                    }
                    onClick={() => onRun("rollback-ppd-backup")}
                  >
                    回滚旧 PPD
                  </button>
                </div>
                <div className="action-blueprint__grid">
                  <section>
                    <h5>检查项</h5>
                    <ul>
                      {actionState.result.queueRegression.checks.map((item) => (
                        <li key={item.name}>
                          <strong>{item.name}</strong>
                          <code>{item.command}</code>
                          <pre>
                            {item.preview.join("\n") || item.stderr || "No output"}
                          </pre>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </article>
            </div>
          ) : null}

          {actionState.result.ppdTuningPlan ? (
            <div className="action-result__block">
              <h4>PPD 微调方案</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.ppdTuningPlan.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.ppdTuningPlan.useQueueOptionsFirst
                        ? "stable"
                        : "warning"
                    }`}
                  >
                    {actionState.result.ppdTuningPlan.useQueueOptionsFirst
                      ? "先稳队列"
                      : "可进 PPD"}
                  </span>
                </div>
                <p>
                  {actionState.result.ppdTuningPlan.deviceLabel} ·{" "}
                  {actionState.result.ppdTuningPlan.symptom}
                </p>
                <code>{actionState.result.ppdTuningPlan.ppdPath}</code>
                <div className="action-blueprint__grid">
                  <section>
                    <h5>候选调优项</h5>
                    <ul>
                      {actionState.result.ppdTuningPlan.tuningItems.map((item) => (
                        <li key={item.key}>
                          <strong>{item.key}</strong>
                          <p>{item.reason}</p>
                          <div className="probe-command-list">
                            {item.examples.map((example) => (
                              <code key={example}>{example}</code>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h5>操作模板</h5>
                    <ul>
                      {actionState.result.ppdTuningPlan.commands.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
                <ul>
                  {actionState.result.ppdTuningPlan.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}

          {actionState.result.ppdPatchBlueprint ? (
            <div className="action-result__block">
              <h4>PPD 补丁蓝图</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.ppdPatchBlueprint.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.ppdPatchBlueprint.edits.length
                        ? "warning"
                        : "stable"
                    }`}
                  >
                    {actionState.result.ppdPatchBlueprint.edits.length
                      ? `${actionState.result.ppdPatchBlueprint.edits.length} 项补丁`
                      : "仅校验模板"}
                  </span>
                </div>
                <p>
                  源 PPD：
                  <code>{actionState.result.ppdPatchBlueprint.ppdPath}</code>
                </p>
                <p>
                  临时副本：
                  <code>{actionState.result.ppdPatchBlueprint.tmpPath}</code>
                </p>
                <div className="tag-row">
                  {actionState.result.ppdPatchBlueprint.pageSizeKey ? (
                    <span className="tag-pill">
                      PageSize {actionState.result.ppdPatchBlueprint.pageSizeKey}
                    </span>
                  ) : null}
                  {actionState.result.ppdPatchBlueprint.resolution ? (
                    <span className="tag-pill">
                      Resolution {actionState.result.ppdPatchBlueprint.resolution}
                    </span>
                  ) : null}
                  {actionState.result.ppdPatchBlueprint.mediaType ? (
                    <span className="tag-pill">
                      Media {actionState.result.ppdPatchBlueprint.mediaType}
                    </span>
                  ) : null}
                </div>
                <div className="action-blueprint__grid">
                  <section>
                    <h5>修改项</h5>
                    <ul>
                      {actionState.result.ppdPatchBlueprint.edits.length ? (
                        actionState.result.ppdPatchBlueprint.edits.map((item) => (
                          <li key={`${item.key}-${item.target}`}>
                            <strong>{item.key}</strong>
                            <p>
                              {item.target === "default"
                                ? "默认值替换"
                                : `目标项：${item.target}`}
                            </p>
                            <code>{item.value}</code>
                          </li>
                        ))
                      ) : (
                        <li>当前参数不足以生成具体替换项，蓝图只保留校验和套用模板。</li>
                      )}
                    </ul>
                  </section>
                  <section>
                    <h5>命令模板</h5>
                    <ul>
                      {actionState.result.ppdPatchBlueprint.applyCommands.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))}
                      {actionState.result.ppdPatchBlueprint.validationCommands.map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                        </li>
                      ))}
                      <li>
                        <code>{actionState.result.ppdPatchBlueprint.commitCommand}</code>
                      </li>
                    </ul>
                  </section>
                </div>
                <ul>
                  {actionState.result.ppdPatchBlueprint.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}

          {actionState.result.ppdPatchValidation ? (
            <div className="action-result__block">
              <h4>PPD 副本验证</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.ppdPatchValidation.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.ppdPatchValidation.readyToApply
                        ? "stable"
                        : actionState.result.ppdPatchValidation.sourceCopyPath
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {actionState.result.ppdPatchValidation.readyToApply
                      ? "可进入回绑"
                      : actionState.result.ppdPatchValidation.sourceCopyPath
                        ? "需人工复核"
                        : "缺少源文件"}
                  </span>
                </div>
                <p>
                  源文件：
                  <code>{actionState.result.ppdPatchValidation.sourcePath}</code>
                </p>
                {actionState.result.ppdPatchValidation.patchedCopyPath ? (
                  <p>
                    验证副本：
                    <code>{actionState.result.ppdPatchValidation.patchedCopyPath}</code>
                  </p>
                ) : null}
                <div className="tag-row">
                  <span className="tag-pill">
                    命中 {actionState.result.ppdPatchValidation.matchedEditCount}
                  </span>
                  <span className="tag-pill">
                    未命中 {actionState.result.ppdPatchValidation.unmatchedEditCount}
                  </span>
                  <span className="tag-pill">
                    请求补丁 {actionState.result.ppdPatchValidation.requestedEdits}
                  </span>
                </div>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      !actionState.result.ppdPatchValidation.readyToApply ||
                      !actionState.result.ppdPatchValidation.patchedCopyPath
                    }
                    onClick={() => onRun("apply-validated-ppd-copy")}
                  >
                    进入回绑
                  </button>
                </div>
                <div className="action-blueprint__grid">
                  <section>
                    <h5>差异预览</h5>
                    <ul>
                      {actionState.result.ppdPatchValidation.changes.length ? (
                        actionState.result.ppdPatchValidation.changes.map((item) => (
                          <li key={`${item.key}-${item.target}`}>
                            <strong>{item.key}</strong>
                            <p>
                              {item.target === "default"
                                ? "默认值"
                                : `目标项：${item.target}`}
                            </p>
                            <div className="action-diff">
                              <code className="is-before">
                                {item.beforeLine || "未在源 PPD 中命中对应行"}
                              </code>
                              {item.afterLine ? (
                                <code className="is-after">{item.afterLine}</code>
                              ) : null}
                            </div>
                          </li>
                        ))
                      ) : (
                        <li>当前没有可应用的具体补丁项。</li>
                      )}
                    </ul>
                  </section>
                  <section>
                    <h5>校验结果</h5>
                    <ul>
                      {actionState.result.ppdPatchValidation.validationResults.length ? (
                        actionState.result.ppdPatchValidation.validationResults.map(
                          (item) => (
                            <li key={item.name}>
                              <strong>{item.name}</strong>
                              <code>{item.command}</code>
                              <pre>
                                {item.preview.join("\n") ||
                                  item.stderr ||
                                  "No output"}
                              </pre>
                            </li>
                          )
                        )
                      ) : (
                        <li>当前还没有真实校验输出，通常是因为源 PPD 文件不存在。</li>
                      )}
                      {actionState.result.ppdPatchValidation.validatedCommitCommand ? (
                        <li>
                          <strong>Validated Commit</strong>
                          <code>
                            {actionState.result.ppdPatchValidation.validatedCommitCommand}
                          </code>
                        </li>
                      ) : null}
                    </ul>
                  </section>
                </div>
                <ul>
                  {actionState.result.ppdPatchValidation.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}

          {actionState.result.queuePpdBinding ? (
            <div className="action-result__block">
              <h4>PPD 回绑</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queuePpdBinding.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.state === "completed"
                        ? "stable"
                        : actionState.result.state === "blocked"
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {actionState.result.state === "completed"
                      ? "已回绑"
                      : actionState.result.state === "blocked"
                        ? "待授权"
                        : "待修复"}
                  </span>
                </div>
                <p>
                  补丁副本：
                  <code>{actionState.result.queuePpdBinding.patchedPpdPath}</code>
                </p>
                <p>
                  旧 PPD 备份：
                  <code>{actionState.result.queuePpdBinding.backupPpdPath}</code>
                </p>
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="copy-button"
                    disabled={
                      actionState.loading ||
                      actionState.result.state !== "completed"
                    }
                    onClick={() => onRun("run-queue-regression-check")}
                  >
                    跑回归检查
                  </button>
                  <button
                    type="button"
                    className="copy-button"
                    disabled={
                      actionState.loading ||
                      actionState.result.state !== "completed"
                    }
                    onClick={() => onRun("run-queue-smoke-test")}
                  >
                    发测试打印
                  </button>
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      actionState.result.state !== "completed" ||
                      !actionInputs["rollback-ppd-backup"]?.backupPpdPath
                    }
                    onClick={() => onRun("rollback-ppd-backup")}
                  >
                    回滚旧 PPD
                  </button>
                </div>
              </article>
            </div>
          ) : null}

          {actionState.result.queueRollback ? (
            <div className="action-result__block">
              <h4>PPD 回滚</h4>
              <article className="action-receipt">
                <div className="action-receipt__head">
                  <strong>{actionState.result.queueRollback.queueName}</strong>
                  <span
                    className={`tone-pill is-${
                      actionState.result.state === "completed"
                        ? "stable"
                        : actionState.result.state === "blocked"
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {actionState.result.state === "completed"
                      ? "已回滚"
                      : actionState.result.state === "blocked"
                        ? "待授权"
                        : "待修复"}
                  </span>
                </div>
                <p>
                  回滚源：
                  <code>{actionState.result.queueRollback.backupPpdPath}</code>
                </p>
                {actionState.result.queueRollback.preRollbackSnapshotPath ? (
                  <p>
                    回滚前快照：
                    <code>
                      {actionState.result.queueRollback.preRollbackSnapshotPath}
                    </code>
                  </p>
                ) : null}
                <div className="action-tile__buttons">
                  <button
                    type="button"
                    className="copy-button"
                    disabled={
                      actionState.loading ||
                      actionState.result.state !== "completed"
                    }
                    onClick={() => onRun("run-queue-regression-check")}
                  >
                    跑回归检查
                  </button>
                  <button
                    type="button"
                    className="action-run"
                    disabled={
                      actionState.loading ||
                      actionState.result.state !== "completed"
                    }
                    onClick={() => onRun("run-queue-smoke-test")}
                  >
                    发测试打印
                  </button>
                </div>
              </article>
            </div>
          ) : null}

          {actionState.result.logArtifact ? (
            <div className="action-result__artifact">
              <span>动作日志</span>
              <code>{actionState.result.logArtifact.path}</code>
              <button
                type="button"
                className="copy-button"
                onClick={() =>
                  onCopyText(
                    `log-${actionState.result.action.id}`,
                    actionState.result.logArtifact.path
                  )
                }
              >
                {copiedId === `log-${actionState.result.action.id}`
                  ? "已复制路径"
                  : "复制路径"}
              </button>
            </div>
          ) : null}

          {actionState.result.manualExecution ? (
            <div className="action-result__block">
              <h4>人工授权执行</h4>
              <div className="action-manual__status">
                <span
                  className={`tone-pill is-${manualExecutionTone(
                    actionState.result.manualExecution.status
                  )}`}
                >
                  {manualExecutionLabel(actionState.result.manualExecution.status)}
                </span>
                <button
                  type="button"
                  className="copy-button"
                  disabled={actionState.manualCheckLoading}
                  onClick={() => onCheckManualExecution()}
                >
                  {actionState.manualCheckLoading ? "检查中..." : "检查执行结果"}
                </button>
              </div>
              <p className="action-note">{actionState.result.manualExecution.summary}</p>
              <p className="action-note is-muted">
                {actionState.result.manualExecution.detail}
              </p>
              {actionState.manualCheckError ? (
                <p className="probe-error">{actionState.manualCheckError}</p>
              ) : null}
              {actionState.result.manualExecution.receiptArtifact ? (
                <div className="action-result__artifact">
                  <span>授权回执文件</span>
                  <code>{actionState.result.manualExecution.receiptArtifact.path}</code>
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() =>
                      onCopyText(
                        `receipt-${actionState.result.action.id}`,
                        actionState.result.manualExecution.receiptArtifact.path
                      )
                    }
                  >
                    {copiedId === `receipt-${actionState.result.action.id}`
                      ? "已复制路径"
                      : "复制路径"}
                  </button>
                </div>
              ) : null}
              {actionState.result.manualExecution.runtimeLog ? (
                <div className="action-result__artifact">
                  <span>授权执行日志</span>
                  <code>{actionState.result.manualExecution.runtimeLog.path}</code>
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() =>
                      onCopyText(
                        `runtime-log-${actionState.result.action.id}`,
                        actionState.result.manualExecution.runtimeLog.path
                      )
                    }
                  >
                    {copiedId === `runtime-log-${actionState.result.action.id}`
                      ? "已复制路径"
                      : "复制路径"}
                  </button>
                </div>
              ) : null}
              <div className="action-launchers">
                {actionState.result.manualExecution.launchers.map((item) => (
                  <article key={item.id} className="action-launcher">
                    <div className="action-launcher__head">
                      <strong>{item.label}</strong>
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() =>
                          onCopyText(
                            `launcher-${actionState.result.action.id}-${item.id}`,
                            item.command
                          )
                        }
                      >
                        {copiedId === `launcher-${actionState.result.action.id}-${item.id}`
                          ? "已复制命令"
                          : "复制命令"}
                      </button>
                    </div>
                    <p>{item.description}</p>
                    <code>{item.command}</code>
                  </article>
                ))}
              </div>
              <ul>
                {actionState.result.manualExecution.steps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {actionState.result.manualExecution.receipt ? (
                <article className="action-receipt">
                  <div className="action-receipt__head">
                    <strong>{actionState.result.manualExecution.receipt.executedBy}</strong>
                    <span
                      className={`tone-pill is-${manualExecutionTone(
                        actionState.result.manualExecution.status
                      )}`}
                    >
                      {actionState.result.manualExecution.receipt.status}
                    </span>
                  </div>
                  {actionState.result.manualExecution.receipt.summary ? (
                    <p>{actionState.result.manualExecution.receipt.summary}</p>
                  ) : null}
                  <p>
                    完成时间：
                    {formatProbeTime(
                      actionState.result.manualExecution.receipt.finishedAt ||
                        actionState.result.manualExecution.receipt.startedAt
                    )}
                  </p>
                  {actionState.result.manualExecution.receipt.details?.length ? (
                    <div className="tag-row">
                      {actionState.result.manualExecution.receipt.details.map((item) => (
                        <span key={item} className="tag-pill">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : actionState.result.manualExecution.receipt.preCheck ||
                    actionState.result.manualExecution.receipt.postCheck ? (
                    <div className="tag-row">
                      {actionState.result.manualExecution.receipt.preCheck ? (
                        <span className="tag-pill">
                          pre: {actionState.result.manualExecution.receipt.preCheck}
                        </span>
                      ) : null}
                      {actionState.result.manualExecution.receipt.postCheck ? (
                        <span className="tag-pill">
                          post: {actionState.result.manualExecution.receipt.postCheck}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ) : actionState.result.manualExecution.checkedAt ? (
                <p className="action-note is-muted">
                  最近检查：
                  {formatProbeTime(actionState.result.manualExecution.checkedAt)}，尚未检测到回执文件。
                </p>
              ) : null}
            </div>
          ) : null}

          {actionState.result.commandResult ? (
            <div className="action-result__block">
              <h4>命令结果</h4>
              <code>{actionState.result.commandResult.command}</code>
              <pre>
                {actionState.result.commandResult.stdout ||
                  actionState.result.commandResult.stderr ||
                  "No output"}
              </pre>
            </div>
          ) : null}

          {actionState.result.postCheck ? (
            <div className="action-result__block">
              <h4>后置检查</h4>
              <code>{actionState.result.postCheck.command}</code>
              <pre>
                {actionState.result.postCheck.stdout ||
                  actionState.result.postCheck.stderr ||
                  "No output"}
              </pre>
            </div>
          ) : null}

          {actionState.result.followUp?.length ? (
            <div className="action-result__block">
              <h4>后续建议</h4>
              <ul>
                {actionState.result.followUp.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {actionState.result.rollbackSuggestions?.length ? (
            <div className="action-result__block">
              <h4>回滚 / 补救建议</h4>
              <ul>
                {actionState.result.rollbackSuggestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : null}

      {actionHistory.length ? (
        <div className="action-result action-history">
          <div className="action-result__head">
            <div>
              <p className="eyebrow">Recent Activity</p>
              <h3>最近动作历史</h3>
            </div>
          </div>
          <div className="history-list">
            {actionHistory.map((entry) => (
              <article key={entry.id} className="history-item">
                <div className="history-item__head">
                  <strong>{entry.title}</strong>
                  <span
                    className={`tone-pill is-${executionTone(entry.state, entry.ok)}`}
                  >
                    {executionLabel(entry.state, entry.mode)}
                  </span>
                </div>
                <p>{entry.summary}</p>
                <small>{formatProbeTime(entry.executedAt)}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AssistantCard({ entryId, payload, copiedId, onCopy }) {
  return (
    <article className="assistant-card">
      <div className="assistant-card__header">
        <div className="assistant-card__meta">
          <span>{payload.label}</span>
          <strong>{payload.moduleName}</strong>
        </div>

        <button
          type="button"
          className="copy-button"
          onClick={() => onCopy(entryId, payload.commands)}
        >
          {copiedId === entryId ? "已复制命令" : "复制命令"}
        </button>
      </div>

      <h3>{payload.title}</h3>
      <p className="assistant-card__summary">{payload.summary}</p>
      <p className="assistant-card__context">{payload.context}</p>
      <p className="assistant-card__hint">{payload.adaptiveHint}</p>

      <div className="tag-row">
        <span className={`tone-pill is-${payload.severity}`}>
          {payload.severityLabel}
        </span>
        {payload.riskTags.map((item) => (
          <span key={item} className="tag-pill">
            {item}
          </span>
        ))}
      </div>

      <div className="assistant-card__grid">
        <section>
          <h4>推荐步骤</h4>
          <ol>
            {payload.steps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section>
          <h4>关键命令</h4>
          <ul className="command-list">
            {payload.commands.map((item) => (
              <li key={item}>
                <code>{item}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="assistant-card__next">
        <span>下一跳</span>
        <strong>{payload.nextAction}</strong>
      </div>
    </article>
  );
}

export default function App() {
  const [activeModuleId, setActiveModuleId] = useState("printer");
  const [focusedModuleId, setFocusedModuleId] = useState("printer");
  const [draft, setDraft] = useState("USB 打印机能识别，但打印队列卡住怎么办？");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [copiedId, setCopiedId] = useState("");
  const [agentTeams, setAgentTeams] = useState({
    scenario: "email-assistant",
    input: agentScenarioDefaultInput("email-assistant"),
    clipboardText: "",
    contextStatus: "idle",
    contextError: "",
    context: null,
    runStatus: "idle",
    runError: "",
    result: null
  });
  const [actionCatalog, setActionCatalog] = useState([]);
  const [actionInputs, setActionInputs] = useState({});
  const [actionEnvironment, setActionEnvironment] = useState(null);
  const [actionHistory, setActionHistory] = useState([]);
  const [actionState, setActionState] = useState({
    loading: false,
    activeId: "",
    mode: "preview",
    result: null,
    error: "",
    manualCheckLoading: false,
    manualCheckError: ""
  });
  const [probe, setProbe] = useState({
    status: "idle",
    data: null,
    error: ""
  });
  const [history, setHistory] = useState(() => [
    {
      id: "assistant-seed",
      role: "assistant",
      payload: createResponse(
        "先帮我做一轮外设打印机诊断",
        moduleMap.printer,
        initialSnapshot
      )
    }
  ]);

  const deferredHistory = useDeferredValue(history);
  const activeModule = moduleMap[activeModuleId];
  const sceneModule = moduleMap[focusedModuleId];

  const sceneStyle = useMemo(
    () => ({
      "--scene-accent": sceneModule.accent,
      "--scene-glow": sceneModule.glow,
      "--scene-secondary": sceneModule.secondary
    }),
    [sceneModule]
  );

  const signalDeck = useMemo(() => buildSignalDeck(snapshot), [snapshot]);
  const sceneIntel = useMemo(
    () => buildSceneIntel(snapshot, sceneModule.id),
    [snapshot, sceneModule.id]
  );
  const agentContextFallback = useMemo(
    () =>
      buildFallbackAgentContext({
        scenario: agentTeams.scenario,
        input: agentTeams.input,
        clipboardText: agentTeams.clipboardText,
        snapshot,
        probeData: probe.data,
        actionEnvironment,
        activeModule
      }),
    [
      activeModule,
      actionEnvironment,
      agentTeams.clipboardText,
      agentTeams.input,
      agentTeams.scenario,
      probe.data,
      snapshot
    ]
  );
  const latestPayload = useMemo(() => {
    for (let index = deferredHistory.length - 1; index >= 0; index -= 1) {
      if (deferredHistory[index].role === "assistant") {
        return deferredHistory[index].payload;
      }
    }

    return null;
  }, [deferredHistory]);

  function switchModule(moduleId) {
    setActiveModuleId(moduleId);
    setFocusedModuleId(moduleId);
  }

  async function loadActions() {
    try {
      const payload = await fetchJson(`${API_BASE}/api/actions`);
      setActionCatalog(payload.actions);
      setActionInputs((previous) =>
        mergeActionInputDrafts(payload.actions, previous)
      );
      setActionEnvironment(payload.privilegeContext || null);
    } catch (error) {
      setActionState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function runLiveProbe({ silent = false } = {}) {
    setProbe((previous) => ({
      ...previous,
      status: "loading",
      error: ""
    }));

    try {
      const payload = await fetchJson(`${API_BASE}/api/diagnostics/summary`);
      const diagnostics = payload.diagnostics;
      const nextSnapshot = mergeSnapshotWithDiagnostics(snapshot, diagnostics);

      setSnapshot(nextSnapshot);
      setProbe({
        status: "ready",
        data: diagnostics,
        error: ""
      });

      if (!silent) {
        const responsePayload = createResponse(
          "根据实时诊断结果生成建议",
          activeModule,
          nextSnapshot
        );

        startTransition(() => {
          setHistory((previous) => [
            ...previous,
            {
              id: `assistant-live-${previous.length + 1}`,
              role: "assistant",
              payload: responsePayload
            }
          ]);
        });
      }
    } catch (error) {
      setProbe({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function refreshAgentContext({ silent = false } = {}) {
    setAgentTeams((previous) => ({
      ...previous,
      contextStatus:
        silent && previous.context ? previous.contextStatus : "loading",
      contextError: ""
    }));

    try {
      const payload = await fetchJson(`${API_BASE}/api/context/live`);
      const nextContext = normalizeAgentContextPayload(
        payload.context || payload.liveContext || payload.agentContext || payload,
        agentContextFallback
      );

      setAgentTeams((previous) => ({
        ...previous,
        contextStatus: "ready",
        contextError: "",
        context: nextContext
      }));

      return nextContext;
    } catch (error) {
      const fallbackContext = agentContextFallback;

      setAgentTeams((previous) => ({
        ...previous,
        contextStatus: "fallback",
        contextError: "",
        context: fallbackContext
      }));

      return fallbackContext;
    }
  }

  async function readAgentClipboard() {
    try {
      const text =
        typeof navigator !== "undefined" && navigator.clipboard?.readText
          ? await navigator.clipboard.readText()
          : "";

      setAgentTeams((previous) => ({
        ...previous,
        clipboardText: text || previous.clipboardText
      }));
    } catch {
      setAgentTeams((previous) => ({
        ...previous,
        clipboardText: previous.clipboardText
      }));
    }
  }

  function handleAgentScenarioChange(nextScenario) {
    setAgentTeams((previous) => {
      const previousDefault = agentScenarioDefaultInput(previous.scenario);
      const shouldResetInput =
        !previous.input.trim() || previous.input === previousDefault;

      return {
        ...previous,
        scenario: nextScenario,
        input: shouldResetInput
          ? agentScenarioDefaultInput(nextScenario)
          : previous.input,
        result: null,
        runStatus: "idle",
        runError: ""
      };
    });
  }

  function handleAgentInputChange(value) {
    setAgentTeams((previous) => ({
      ...previous,
      input: value
    }));
  }

  async function runAgentTeams() {
    const scenario = agentTeams.scenario;
    const input = agentTeams.input.trim();
    const fallbackContext = agentTeams.context || agentContextFallback;

    setAgentTeams((previous) => ({
      ...previous,
      runStatus: "loading",
      runError: ""
    }));

    try {
      const payload = await fetchJson(`${API_BASE}/api/agent-teams/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scene: scenario,
          scenario,
          prompt: input,
          input,
          context: fallbackContext,
          clipboardText: agentTeams.clipboardText
        })
      });

      const nextContext = normalizeAgentContextPayload(
        payload.context ||
          payload.result?.context ||
          payload.liveContext ||
          payload.agentContext ||
          fallbackContext,
        fallbackContext
      );
      const nextResult = normalizeAgentResult(
        payload.result || payload.agentResult || payload.teamResult || payload,
        nextContext
      );

      setAgentTeams((previous) => ({
        ...previous,
        contextStatus: "ready",
        context: nextContext,
        runStatus: "ready",
        runError: "",
        result: nextResult
      }));
    } catch (error) {
      const fallbackResult = buildFallbackAgentResult({
        scenario,
        input,
        context: fallbackContext
      });

      setAgentTeams((previous) => ({
        ...previous,
        contextStatus: previous.context ? previous.contextStatus : "fallback",
        context: fallbackContext,
        runStatus: "fallback",
        runError: "",
        result: fallbackResult
      }));
    }
  }

  async function runAction(actionId, mode) {
    setActionState((previous) => ({
      ...previous,
      loading: true,
      activeId: actionId,
      mode,
      error: ""
    }));

    try {
      const params = actionInputs[actionId] || {};
      const payload = await fetchJson(`${API_BASE}/api/actions/${encodeURIComponent(actionId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mode, params })
      });

      setActionState({
        loading: false,
        activeId: "",
        mode,
        result: payload.result,
        error: "",
        manualCheckLoading: false,
        manualCheckError: ""
      });
      if (payload.result.ppdPatchBlueprint) {
        const blueprint = payload.result.ppdPatchBlueprint;
        const nextInputs = {
          queueName: blueprint.queueName || "",
          ppdPath: blueprint.ppdPath || "",
          pageSizeKey: blueprint.pageSizeKey || "",
          paperDimension: blueprint.paperDimension || "",
          imageableArea: blueprint.imageableArea || "",
          resolution: blueprint.resolution || "",
          mediaType: blueprint.mediaType || ""
        };

        setActionInputs((previous) => ({
          ...previous,
          "generate-ppd-patch-blueprint": {
            ...(previous["generate-ppd-patch-blueprint"] || {}),
            ...nextInputs
          },
          "validate-ppd-patch-copy": {
            ...(previous["validate-ppd-patch-copy"] || {}),
            ...nextInputs
          }
        }));
      }
      if (payload.result.queueBlueprint) {
        const queueBlueprint = payload.result.queueBlueprint;

        setActionInputs((previous) => ({
          ...previous,
          "apply-queue-blueprint": {
            ...(previous["apply-queue-blueprint"] || {}),
            queueName: queueBlueprint.queueName || "",
            deviceUri: queueBlueprint.candidateUris?.[0] || "",
            driverModel: queueBlueprint.driverModel || "everywhere",
            setDefault:
              previous["apply-queue-blueprint"]?.setDefault ||
              (queueBlueprint.existingQueues?.length ? "no" : "yes")
          }
        }));
      }
      if (payload.result.queueProvisioning) {
        const queueProvisioning = payload.result.queueProvisioning;
        const nextPpdPath = `/etc/cups/ppd/${queueProvisioning.queueName}.ppd`;

        setActionInputs((previous) => ({
          ...previous,
          "apply-queue-blueprint": {
            ...(previous["apply-queue-blueprint"] || {}),
            queueName: queueProvisioning.queueName || "",
            deviceUri: queueProvisioning.deviceUri || "",
            driverModel: queueProvisioning.driverModel || "everywhere",
            setDefault: queueProvisioning.setDefault ? "yes" : "no"
          },
          "generate-ppd-patch-blueprint": {
            ...(previous["generate-ppd-patch-blueprint"] || {}),
            queueName: queueProvisioning.queueName || "",
            ppdPath: nextPpdPath
          },
          "validate-ppd-patch-copy": {
            ...(previous["validate-ppd-patch-copy"] || {}),
            queueName: queueProvisioning.queueName || "",
            ppdPath: nextPpdPath
          },
          "apply-validated-ppd-copy": {
            ...(previous["apply-validated-ppd-copy"] || {}),
            queueName: queueProvisioning.queueName || ""
          },
          "run-queue-smoke-test": {
            ...(previous["run-queue-smoke-test"] || {}),
            queueName: queueProvisioning.queueName || ""
          },
          "run-queue-regression-check": {
            ...(previous["run-queue-regression-check"] || {}),
            queueName: queueProvisioning.queueName || ""
          },
          "rollback-ppd-backup": {
            ...(previous["rollback-ppd-backup"] || {}),
            queueName: queueProvisioning.queueName || ""
          }
        }));
      }
      if (payload.result.queueSmokeTest) {
        const smokeTest = payload.result.queueSmokeTest;

        setActionInputs((previous) => ({
          ...previous,
          "run-queue-smoke-test": {
            ...(previous["run-queue-smoke-test"] || {}),
            queueName: smokeTest.queueName || ""
          },
          "run-queue-regression-check": {
            ...(previous["run-queue-regression-check"] || {}),
            queueName: smokeTest.queueName || ""
          },
          "rollback-ppd-backup": {
            ...(previous["rollback-ppd-backup"] || {}),
            queueName: smokeTest.queueName || previous["rollback-ppd-backup"]?.queueName || ""
          }
        }));
      }
      if (payload.result.queueRegression) {
        const queueRegression = payload.result.queueRegression;

        setActionInputs((previous) => ({
          ...previous,
          "run-queue-smoke-test": {
            ...(previous["run-queue-smoke-test"] || {}),
            queueName: queueRegression.queueName || ""
          },
          "run-queue-regression-check": {
            ...(previous["run-queue-regression-check"] || {}),
            queueName: queueRegression.queueName || ""
          },
          "rollback-ppd-backup": {
            ...(previous["rollback-ppd-backup"] || {}),
            queueName:
              queueRegression.queueName || previous["rollback-ppd-backup"]?.queueName || ""
          }
        }));
      }
      if (payload.result.ppdPatchValidation?.patchedCopyPath) {
        const validation = payload.result.ppdPatchValidation;

        setActionInputs((previous) => ({
          ...previous,
          "apply-validated-ppd-copy": {
            ...(previous["apply-validated-ppd-copy"] || {}),
            queueName: validation.queueName || "",
            patchedPpdPath: validation.patchedCopyPath || ""
          }
        }));
      }
      if (payload.result.queuePpdBinding) {
        const queuePpdBinding = payload.result.queuePpdBinding;

        setActionInputs((previous) => ({
          ...previous,
          "apply-validated-ppd-copy": {
            ...(previous["apply-validated-ppd-copy"] || {}),
            queueName: queuePpdBinding.queueName || "",
            patchedPpdPath: queuePpdBinding.patchedPpdPath || ""
          },
          "run-queue-smoke-test": {
            ...(previous["run-queue-smoke-test"] || {}),
            queueName: queuePpdBinding.queueName || ""
          },
          "run-queue-regression-check": {
            ...(previous["run-queue-regression-check"] || {}),
            queueName: queuePpdBinding.queueName || ""
          },
          "rollback-ppd-backup": {
            ...(previous["rollback-ppd-backup"] || {}),
            queueName: queuePpdBinding.queueName || "",
            backupPpdPath:
              queuePpdBinding.backupPpdPath ||
              previous["rollback-ppd-backup"]?.backupPpdPath ||
              ""
          }
        }));
      }
      if (payload.result.queueRollback) {
        const queueRollback = payload.result.queueRollback;

        setActionInputs((previous) => ({
          ...previous,
          "run-queue-smoke-test": {
            ...(previous["run-queue-smoke-test"] || {}),
            queueName: queueRollback.queueName || ""
          },
          "run-queue-regression-check": {
            ...(previous["run-queue-regression-check"] || {}),
            queueName: queueRollback.queueName || ""
          },
          "rollback-ppd-backup": {
            ...(previous["rollback-ppd-backup"] || {}),
            queueName: queueRollback.queueName || "",
            backupPpdPath: queueRollback.backupPpdPath || ""
          }
        }));
      }
      if (payload.result.action.id === "apply-validated-ppd-copy") {
        const backupPpdPath =
          payload.result.queuePpdBinding?.backupPpdPath ||
          findAttachmentPathByLabel(payload.result.attachments, "旧 PPD 自动备份");
        const queueName =
          payload.result.queuePpdBinding?.queueName ||
          payload.result.queueRollback?.queueName ||
          payload.result.ppdPatchValidation?.queueName ||
          actionInputs["apply-validated-ppd-copy"]?.queueName ||
          "";

        if (queueName || backupPpdPath) {
          setActionInputs((previous) => ({
            ...previous,
            "rollback-ppd-backup": {
              ...(previous["rollback-ppd-backup"] || {}),
              queueName: queueName || previous["rollback-ppd-backup"]?.queueName || "",
              backupPpdPath:
                backupPpdPath ||
                previous["rollback-ppd-backup"]?.backupPpdPath ||
                ""
            }
          }));
        }
      }
      setActionHistory((previous) => [
        {
          id: `${payload.result.action.id}-${payload.result.executedAt}`,
          title: payload.result.action.title,
          mode: payload.result.mode,
          state: payload.result.state,
          ok: payload.result.ok,
          manualId: payload.result.manualExecution?.id || "",
          summary: payload.result.summary,
          executedAt: payload.result.executedAt
        },
        ...previous
      ].slice(0, 6));

      if (
        mode === "run" &&
        payload.result.state !== "blocked" &&
        payload.result.action.module !== "support"
      ) {
        await runLiveProbe({ silent: true });
      }
    } catch (error) {
      setActionState((previous) => ({
        ...previous,
        loading: false,
        activeId: "",
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  function handleActionInputChange(actionId, fieldId, value) {
    setActionInputs((previous) => ({
      ...previous,
      [actionId]: {
        ...(previous[actionId] || {}),
        [fieldId]: value
      }
    }));
  }

  async function checkManualExecution({ silent = false } = {}) {
    const manualId = actionState.result?.manualExecution?.id;

    if (!manualId) {
      return;
    }

    if (!silent) {
      setActionState((previous) => ({
        ...previous,
        manualCheckLoading: true,
        manualCheckError: ""
      }));
    }

    try {
      const payload = await fetchJson(
        `${API_BASE}/api/manual-actions/${encodeURIComponent(manualId)}`
      );
      const manualExecution = payload.manualExecution;
      const manualStatus = manualExecution.status;

      setActionState((previous) => {
        if (!previous.result?.manualExecution) {
          return previous;
        }

        const nextResult = {
          ...previous.result,
          manualExecution: {
            ...previous.result.manualExecution,
            ...manualExecution
          }
        };

        if (manualStatus === "completed") {
          nextResult.state = "completed";
          nextResult.ok = true;
          nextResult.summary = "Manual execution completed";
          nextResult.followUp = [
            "已检测到人工授权脚本执行完成。",
            "系统会重新采集真实快照，确认 CUPS 和队列状态是否恢复。"
          ];
        } else if (manualStatus === "failed") {
          nextResult.state = "failed";
          nextResult.ok = false;
          nextResult.summary = "Manual execution finished with errors";
          nextResult.followUp = [
            "已经收到人工执行回执，但脚本结果显示失败。",
            "先查看授权执行日志，再决定是否重新授权或继续诊断。"
          ];
        }

        return {
          ...previous,
          result: nextResult,
          manualCheckLoading: false,
          manualCheckError: ""
        };
      });

      if (manualStatus === "completed" || manualStatus === "failed") {
        setActionHistory((previous) =>
          previous.map((entry) =>
            entry.manualId === manualId
              ? {
                  ...entry,
                  state: manualStatus === "completed" ? "completed" : "failed",
                  ok: manualStatus === "completed",
                  summary:
                    manualStatus === "completed"
                      ? "Manual execution completed"
                      : "Manual execution finished with errors",
                  executedAt:
                    manualExecution.receipt?.finishedAt || entry.executedAt
                }
              : entry
          )
        );
        await runLiveProbe({ silent: true });
        await loadActions();
      }
    } catch (error) {
      setActionState((previous) => ({
        ...previous,
        manualCheckLoading: false,
        manualCheckError: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  function submitQuestion(rawQuestion) {
    const question = rawQuestion.trim();

    if (!question) {
      return;
    }

    const response = createResponse(question, activeModule, snapshot);

    startTransition(() => {
      setHistory((previous) => [
        ...previous,
        {
          id: `user-${previous.length + 1}`,
          role: "user",
          question
        },
        {
          id: `assistant-${previous.length + 2}`,
          role: "assistant",
          payload: response
        }
      ]);
    });

    setDraft("");
  }

  async function handleCopyText(copyKey, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(copyKey);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setCopiedId("");
    }
  }

  async function handleCopyCommands(entryId, commands) {
    return handleCopyText(entryId, commands.join("\n"));
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitQuestion(draft);
  }

  useEffect(() => {
    runLiveProbe({ silent: true });
    loadActions();
    refreshAgentContext({ silent: true });
  }, []);

  useEffect(() => {
    refreshAgentContext({ silent: true });
  }, [
    snapshot.distro,
    snapshot.device,
    snapshot.connection,
    snapshot.symptom,
    probe.data?.timestamp,
    actionEnvironment?.sessionType
  ]);

  useEffect(() => {
    const plan = actionState.result?.ppdTuningPlan;

    if (!plan) {
      return;
    }

    setActionInputs((previous) => ({
      ...previous,
      "generate-ppd-patch-blueprint": {
        ...(previous["generate-ppd-patch-blueprint"] || {}),
        queueName: plan.queueName || previous["generate-ppd-patch-blueprint"]?.queueName || "",
        ppdPath: plan.ppdPath || previous["generate-ppd-patch-blueprint"]?.ppdPath || ""
      },
      "validate-ppd-patch-copy": {
        ...(previous["validate-ppd-patch-copy"] || {}),
        queueName: plan.queueName || previous["validate-ppd-patch-copy"]?.queueName || "",
        ppdPath: plan.ppdPath || previous["validate-ppd-patch-copy"]?.ppdPath || ""
      }
    }));
  }, [actionState.result?.ppdTuningPlan]);

  useEffect(() => {
    const manualId = actionState.result?.manualExecution?.id;
    const status = actionState.result?.manualExecution?.status;

    if (!manualId || status !== "pending") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      checkManualExecution({ silent: true });
    }, 6000);

    return () => window.clearInterval(timer);
  }, [actionState.result?.manualExecution?.id, actionState.result?.manualExecution?.status]);

  return (
    <div className="app-shell" style={sceneStyle}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Future support console for deepin / UOS</p>
          <h1>Orbit Deepin Assistant</h1>
        </div>

        <div className="topbar__status">
          <span>Scene: {sceneModule.label}</span>
          <strong>Focused on system recovery, printers, driver repair</strong>
        </div>
      </header>

      <main className="layout">
        <section className="scene-panel">
          <div className="scene-panel__header">
            <div>
              <p className="eyebrow">Immersive operations map</p>
              <h2>未来科技感场景 + 模块联动</h2>
            </div>

            <div className="status-pills">
              <span>{snapshot.distro}</span>
              <span>{snapshot.device}</span>
              <span>{snapshot.connection}</span>
            </div>
          </div>

          <div className="orbital-stage">
            <div className="orbital-stage__halo orbital-stage__halo--outer" />
            <div className="orbital-stage__halo orbital-stage__halo--mid" />
            <div className="orbital-stage__halo orbital-stage__halo--inner" />
            <div className="orbital-stage__nebula orbital-stage__nebula--a" />
            <div className="orbital-stage__nebula orbital-stage__nebula--b" />

            <div className="globe">
              <div className="globe__core" />
              <div className="globe__mesh" />
              <div className="globe__ring globe__ring--a" />
              <div className="globe__ring globe__ring--b" />
              <div className="globe__beacon globe__beacon--north" />
              <div className="globe__beacon globe__beacon--south" />
            </div>

            {modules.map((module) => {
              const isActive = module.id === activeModuleId;
              const isFocused = module.id === focusedModuleId;

              return (
                <button
                  key={module.id}
                  className={`module-node ${isActive ? "is-active" : ""} ${
                    isFocused ? "is-focused" : ""
                  }`}
                  style={{
                    top: module.position.top,
                    left: module.position.left,
                    "--node-accent": module.accent,
                    "--node-glow": module.glow
                  }}
                  onClick={() => switchModule(module.id)}
                  onMouseEnter={() => setFocusedModuleId(module.id)}
                  onMouseLeave={() => setFocusedModuleId(activeModuleId)}
                >
                  <span>{module.tag}</span>
                  <strong>{module.title}</strong>
                  <small>{module.label}</small>
                </button>
              );
            })}
          </div>

          <div className="scene-detail">
            <div className="scene-detail__copy">
              <p className="eyebrow">{sceneModule.label}</p>
              <h3>{sceneModule.title}</h3>
              <p>{sceneModule.atmosphere}</p>
              <div className="tag-row">
                <span className="tag-pill">{sceneModule.description}</span>
              </div>
            </div>

            <div className="workflow">
              {sceneModule.workflow.map((item, index) => (
                <article key={item} className="workflow__item">
                  <span>0{index + 1}</span>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="intel-grid">
            {sceneIntel.map((item) => (
              <article key={item.label} className="intel-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="console-panel">
          <div className="console-panel__header">
            <div>
              <p className="eyebrow">Perception Q&A</p>
              <h2>系统感知问答与排障控制台</h2>
            </div>

            <div className="console-panel__badge">MVP front-end prototype</div>
          </div>

          <div className="snapshot-grid">
            {Object.entries(snapshotOptions).map(([field, values]) => (
              <label key={field} className="snapshot-field">
                <span>{field}</span>
                <select
                  value={snapshot[field]}
                  onChange={(event) =>
                    setSnapshot((previous) => ({
                      ...previous,
                      [field]: event.target.value
                    }))
                  }
                >
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <PrintRepairChainPanel
            actions={actionCatalog}
            probe={probe}
            snapshot={snapshot}
            actionState={actionState}
            onPreview={(actionId) => runAction(actionId, "preview")}
            onRun={(actionId) => runAction(actionId, "run")}
          />
          <LiveProbePanel probe={probe} onRefresh={runLiveProbe} />
          <AgentTeamsPanel
            contextState={{
              status: agentTeams.contextStatus,
              error: agentTeams.contextError,
              data: agentTeams.context || agentContextFallback
            }}
            scenario={agentTeams.scenario}
            input={agentTeams.input}
            clipboardText={agentTeams.clipboardText}
            resultState={{
              status: agentTeams.runStatus,
              error: agentTeams.runError,
              result: agentTeams.result
            }}
            onScenarioChange={handleAgentScenarioChange}
            onInputChange={handleAgentInputChange}
            onRefreshContext={() => refreshAgentContext()}
            onReadClipboard={readAgentClipboard}
            onRunTeams={runAgentTeams}
          />
          <ActionConsole
            actions={actionCatalog}
            actionEnvironment={actionEnvironment}
            actionInputs={actionInputs}
            actionState={actionState}
            actionHistory={actionHistory}
            copiedId={copiedId}
            onPreview={(actionId) => runAction(actionId, "preview")}
            onRun={(actionId) => runAction(actionId, "run")}
            onActionInputChange={handleActionInputChange}
            onCopyText={handleCopyText}
            onCheckManualExecution={() => checkManualExecution()}
          />

          <div className="signal-grid">
            {signalDeck.map((item) => (
              <article key={item.label} className={`signal-card is-${item.tone}`}>
                <div className="signal-card__top">
                  <span>{item.label}</span>
                  <strong>{item.percent}%</strong>
                </div>
                <h3>{item.value}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          {latestPayload ? (
            <>
              <div className="mission-grid">
                <SeverityDial
                  score={latestPayload.score}
                  severityLabel={latestPayload.severityLabel}
                  summary={latestPayload.severitySummary}
                  tone={latestPayload.severity}
                />

                <article className="mission-card">
                  <div className="mission-card__head">
                    <div>
                      <p className="eyebrow">Mission brief</p>
                      <h3>{latestPayload.title}</h3>
                    </div>
                    <span className={`tone-pill is-${latestPayload.severity}`}>
                      {latestPayload.severityLabel}
                    </span>
                  </div>
                  <p className="mission-card__body">{latestPayload.summary}</p>
                  <div className="tag-row">
                    {latestPayload.riskTags.map((item) => (
                      <span key={item} className="tag-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              </div>

              <StageRail stages={latestPayload.stageRail} />

              <div className="ops-grid">
                {latestPayload.opsBoard.map((item) => (
                  <article key={item.title} className="ops-card">
                    <span>{item.title}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </article>
                ))}
              </div>

              <div className="action-grid">
                {latestPayload.actionPlan.map((item) => (
                  <article key={item.title} className="action-card">
                    <div className="action-card__meta">
                      <span>{item.timing}</span>
                      <strong>{item.owner}</strong>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                    <code>{item.command}</code>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          <div className="prompt-cluster">
            {activeModule.quickPrompts.map((item) => (
              <button
                key={item}
                type="button"
                className="ghost-chip"
                onClick={() => submitQuestion(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="输入一个系统问题，例如：外接打印机重装驱动后还是 filter failed，应该先看哪一层？"
            />
            <button type="submit">生成诊断建议</button>
          </form>

          <div className="history">
            {deferredHistory.slice(-4).map((entry) =>
              entry.role === "user" ? (
                <article key={entry.id} className="user-card">
                  <span>你的问题</span>
                  <strong>{entry.question}</strong>
                </article>
              ) : (
                <AssistantCard
                  key={entry.id}
                  entryId={entry.id}
                  payload={entry.payload}
                  copiedId={copiedId}
                  onCopy={handleCopyCommands}
                />
              )
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
