#include "DiagnosticsService.h"

#include "CommandRunner.h"

#include <QFile>
#include <QRegularExpression>

namespace {

QString fallback(const QString &value, const QString &defaultValue) {
  const QString trimmed = value.trimmed();
  return trimmed.isEmpty() ? defaultValue : trimmed;
}

QStringList splitLines(const QString &value) {
  return value.split('\n', Qt::SkipEmptyParts);
}

int extractPercent(const QString &value) {
  const QRegularExpression match(QStringLiteral("(\\d+)%"));
  const auto result = match.match(value);
  if (!result.hasMatch()) {
    return -1;
  }

  return result.captured(1).toInt();
}

} // namespace

DiagnosticsService::DiagnosticsService(const QString &artifactsDir)
    : m_artifactsDir(artifactsDir) {}

QString DiagnosticsService::artifactsDir() const { return m_artifactsDir; }

QMap<QString, QString> DiagnosticsService::readOsRelease() const {
  QFile file(QStringLiteral("/etc/os-release"));
  if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
    return {};
  }

  QMap<QString, QString> values;
  while (!file.atEnd()) {
    const QString line = QString::fromUtf8(file.readLine()).trimmed();
    if (line.isEmpty() || line.startsWith('#')) {
      continue;
    }

    const int index = line.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const QString key = line.left(index).trimmed();
    QString value = line.mid(index + 1).trimmed();
    if (value.startsWith('"') && value.endsWith('"') && value.size() >= 2) {
      value = value.mid(1, value.size() - 2);
    }

    values.insert(key, value);
  }

  return values;
}

QString DiagnosticsService::clean(const QString &value) const {
  QString text = value.trimmed();
  text.replace(QStringLiteral("\r"), QString());
  return text;
}

QString DiagnosticsService::firstMeaningfulLines(const QString &value,
                                                 int maxLines) const {
  QStringList lines;
  for (const QString &line : splitLines(clean(value))) {
    const QString trimmed = line.trimmed();
    if (!trimmed.isEmpty()) {
      lines << trimmed;
    }
    if (lines.size() >= maxLines) {
      break;
    }
  }

  return lines.join(QStringLiteral("\n"));
}

QString DiagnosticsService::summarizeDiskUsage() const {
  const auto result = CommandRunner::shell(QStringLiteral("df -h / | tail -n 1"));
  return fallback(result.output, QStringLiteral("未拿到根分区信息。"));
}

QString DiagnosticsService::summarizeMemoryUsage() const {
  const auto result = CommandRunner::shell(QStringLiteral("free -h | sed -n '2p'"));
  return fallback(result.output, QStringLiteral("未拿到内存信息。"));
}

QString DiagnosticsService::summarizeNetwork() const {
  const auto result =
      CommandRunner::shell(QStringLiteral("ip -brief address 2>/dev/null | head -n 6"));
  return fallback(firstMeaningfulLines(result.output, 4),
                  QStringLiteral("未拿到网络接口信息。"));
}

QString DiagnosticsService::summarizeAudio() const {
  const auto pipewire =
      CommandRunner::shell(QStringLiteral("systemctl --user is-active pipewire"));
  const auto pactl = CommandRunner::shell(
      QStringLiteral("pactl info 2>/dev/null | sed -n '1,6p'"));

  QStringList parts;
  parts << QStringLiteral("pipewire: %1")
               .arg(fallback(pipewire.output, QStringLiteral("unknown")));
  if (!pactl.output.trimmed().isEmpty()) {
    parts << firstMeaningfulLines(pactl.output, 2);
  }

  return parts.join(QStringLiteral("\n"));
}

QString DiagnosticsService::summarizeInstallAudit() const {
  const auto audit = CommandRunner::shell(QStringLiteral("dpkg --audit 2>/dev/null"));
  if (audit.output.trimmed().isEmpty()) {
    return QStringLiteral("未发现明显安装残留问题。");
  }

  return firstMeaningfulLines(audit.output, 6);
}

DiagnosticSnapshot DiagnosticsService::collect() const {
  DiagnosticSnapshot snapshot;
  const auto osRelease = readOsRelease();
  snapshot.distroName =
      fallback(osRelease.value(QStringLiteral("PRETTY_NAME")),
               QStringLiteral("unknown"));
  snapshot.distroVersion =
      fallback(osRelease.value(QStringLiteral("VERSION_ID")),
               QStringLiteral("unknown"));

  snapshot.kernelVersion = fallback(
      CommandRunner::shell(QStringLiteral("uname -r")).output,
      QStringLiteral("unknown"));
  snapshot.rootDiskUsage = summarizeDiskUsage();
  snapshot.memoryUsage = summarizeMemoryUsage();
  snapshot.networkSummary = summarizeNetwork();
  snapshot.audioState = summarizeAudio();

  snapshot.cupsState = fallback(
      CommandRunner::shell(QStringLiteral("systemctl is-active cups")).output,
      QStringLiteral("unknown"));
  snapshot.networkManagerState =
      fallback(CommandRunner::shell(QStringLiteral("systemctl is-active NetworkManager"))
                   .output,
               QStringLiteral("unknown"));
  snapshot.printerQueues = fallback(
      CommandRunner::shell(QStringLiteral("lpstat -t 2>/dev/null")).output,
      QStringLiteral("当前没有打印队列或系统未安装 lpstat。"));
  snapshot.printerDevices =
      fallback(CommandRunner::shell(QStringLiteral("lpinfo -v 2>/dev/null")).output,
               QStringLiteral("当前没有可见打印设备或系统未安装 lpinfo。"));
  snapshot.recentCupsLog = fallback(
      CommandRunner::shell(QStringLiteral(
                               "journalctl -u cups --since '15 min ago' "
                               "--no-pager -n 30 2>/dev/null"),
                           5000)
          .output,
      QStringLiteral("当前没有拿到 cups 最近日志。"));
  snapshot.installAudit = summarizeInstallAudit();

  snapshot.cupsActive = snapshot.cupsState == QStringLiteral("active");
  snapshot.hasPrinterQueues =
      snapshot.printerQueues.contains(QStringLiteral("printer "), Qt::CaseInsensitive);

  if (!snapshot.cupsActive) {
    snapshot.findings << QStringLiteral("CUPS 当前不在 active 状态。");
  }

  if (!snapshot.hasPrinterQueues) {
    snapshot.findings << QStringLiteral("当前没有可用打印队列。");
  }

  const int diskPercent = extractPercent(snapshot.rootDiskUsage);
  if (diskPercent >= 90) {
    snapshot.findings
        << QStringLiteral("根分区使用率偏高，安装和日志写入可能继续受影响。");
  }

  if (snapshot.installAudit != QStringLiteral("未发现明显安装残留问题。")) {
    snapshot.findings << QStringLiteral("系统里存在待处理的安装或配置残留。");
  }

  if (snapshot.networkManagerState != QStringLiteral("active")) {
    snapshot.findings << QStringLiteral("NetworkManager 当前不在 active 状态。");
  }

  return snapshot;
}

QString DiagnosticsService::inferScenario(const QString &note) const {
  const QString text = note.toLower();
  if (text.contains(QStringLiteral("打印")) || text.contains(QStringLiteral("printer")) ||
      text.contains(QStringLiteral("cups"))) {
    if (text.contains(QStringLiteral("卡")) || text.contains(QStringLiteral("queue"))) {
      return QStringLiteral("打印任务卡住");
    }
    if (text.contains(QStringLiteral("驱动")) || text.contains(QStringLiteral("filter"))) {
      return QStringLiteral("驱动与过滤链异常");
    }
    return QStringLiteral("打印机连接失败");
  }

  if (text.contains(QStringLiteral("网络")) || text.contains(QStringLiteral("wifi")) ||
      text.contains(QStringLiteral("dns"))) {
    return QStringLiteral("网络异常");
  }

  if (text.contains(QStringLiteral("声音")) || text.contains(QStringLiteral("音频")) ||
      text.contains(QStringLiteral("pipewire"))) {
    return QStringLiteral("没有声音了");
  }

  if (text.contains(QStringLiteral("安装")) || text.contains(QStringLiteral("依赖")) ||
      text.contains(QStringLiteral("软件源")) || text.contains(QStringLiteral("apt"))) {
    return QStringLiteral("软件安装失败");
  }

  return QStringLiteral("系统总览");
}

AnalysisResult DiagnosticsService::analyze(const QString &scenario,
                                           const QString &note,
                                           const DiagnosticSnapshot &snapshot) const {
  AnalysisResult result;
  result.scenario = scenario == QStringLiteral("自定义描述") ? inferScenario(note) : scenario;
  result.riskLevel = QStringLiteral("中");

  if (result.scenario == QStringLiteral("打印机连接失败")) {
    result.title = QStringLiteral("先把设备和队列链路收拢起来");
    result.summary = snapshot.hasPrinterQueues
                         ? QStringLiteral("设备层已经有部分打印配置，下一步重点看设备发现与队列绑定是否一致。")
                         : QStringLiteral("当前系统里还没有可用打印队列，建议先恢复设备发现和 CUPS 服务，再建立新队列。");
    result.stages << QStringLiteral("确认 USB 或网络设备是否被系统识别")
                  << QStringLiteral("检查 cups 状态和可见设备 URI")
                  << QStringLiteral("必要时删除旧队列后重新创建");
    result.recommendedActionIds << QStringLiteral("collect-support-bundle")
                                << QStringLiteral("export-workorder")
                                << QStringLiteral("restart-cups")
                                << QStringLiteral("delete-old-queues");
    result.commandHints << QStringLiteral("lsusb")
                        << QStringLiteral("lpinfo -v")
                        << QStringLiteral("lpstat -t");
    return result;
  }

  if (result.scenario == QStringLiteral("打印任务卡住")) {
    result.title = QStringLiteral("优先清作业，再看队列状态");
    result.summary =
        QStringLiteral("卡队列大多不是硬件坏，先把旧作业和暂停状态清掉，再判断是否要动驱动。");
    result.stages << QStringLiteral("查看 paused 或 stopped 队列")
                  << QStringLiteral("清理旧作业并重启 cups")
                  << QStringLiteral("回归测试页和纸张参数");
    result.recommendedActionIds << QStringLiteral("clear-print-queue")
                                << QStringLiteral("restart-cups")
                                << QStringLiteral("export-workorder");
    result.commandHints << QStringLiteral("lpstat -t")
                        << QStringLiteral("cancel -a")
                        << QStringLiteral("journalctl -u cups --since '15 min ago'");
    return result;
  }

  if (result.scenario == QStringLiteral("驱动与过滤链异常")) {
    result.riskLevel = QStringLiteral("高");
    result.title = QStringLiteral("直接走打印栈修复，不再反复重建临时参数");
    result.summary =
        QStringLiteral("当前更像驱动包、过滤链权限或旧队列配置漂移，建议按删除旧队列、重装打印栈、修复 CUPS 权限三步走。");
    result.stages << QStringLiteral("导出现场支持包和诊断工单")
                  << QStringLiteral("删除旧队列，避免残留配置继续干扰")
                  << QStringLiteral("重装关键打印组件并修复过滤链权限");
    result.recommendedActionIds << QStringLiteral("collect-support-bundle")
                                << QStringLiteral("delete-old-queues")
                                << QStringLiteral("reinstall-print-stack")
                                << QStringLiteral("repair-cups-permissions");
    result.commandHints << QStringLiteral("dpkg -l | grep -Ei 'cups|printer|driver'")
                        << QStringLiteral("ls -l /usr/lib/cups/filter")
                        << QStringLiteral("journalctl -u cups -n 30");
    return result;
  }

  if (result.scenario == QStringLiteral("网络异常")) {
    result.title = QStringLiteral("先看链路和服务，再决定是不是系统网络栈问题");
    result.summary =
        QStringLiteral("网络问题先确认接口状态、IP 和 NetworkManager，再考虑 DNS 或镜像源。");
    result.stages << QStringLiteral("采集接口和地址信息")
                  << QStringLiteral("检查 NetworkManager 状态")
                  << QStringLiteral("必要时重启网络服务");
    result.recommendedActionIds << QStringLiteral("export-network-check")
                                << QStringLiteral("restart-network-manager")
                                << QStringLiteral("export-workorder");
    result.commandHints << QStringLiteral("ip -brief address")
                        << QStringLiteral("nmcli general status")
                        << QStringLiteral("resolvectl status");
    return result;
  }

  if (result.scenario == QStringLiteral("没有声音了")) {
    result.title = QStringLiteral("重点确认 pipewire 和当前会话");
    result.summary =
        QStringLiteral("桌面没声音多数落在用户态音频会话，先导出状态，再重启 wireplumber / pipewire。");
    result.stages << QStringLiteral("采集当前用户态音频信息")
                  << QStringLiteral("确认 pipewire、wireplumber 状态")
                  << QStringLiteral("重启会话后回放验证");
    result.recommendedActionIds << QStringLiteral("export-audio-check")
                                << QStringLiteral("restart-audio-session")
                                << QStringLiteral("export-workorder");
    result.commandHints << QStringLiteral("systemctl --user status pipewire")
                        << QStringLiteral("pactl info")
                        << QStringLiteral("wpctl status");
    return result;
  }

  if (result.scenario == QStringLiteral("软件安装失败")) {
    result.title = QStringLiteral("先修系统包状态，再继续装软件");
    result.summary =
        QStringLiteral("安装失败先看根分区空间和 dpkg 残留，避免在损坏状态下继续反复装包。");
    result.stages << QStringLiteral("检查根分区和包状态")
                  << QStringLiteral("导出安装检查结果")
                  << QStringLiteral("修复损坏依赖和未完成配置");
    result.recommendedActionIds << QStringLiteral("export-install-check")
                                << QStringLiteral("repair-package-state")
                                << QStringLiteral("export-workorder");
    result.commandHints << QStringLiteral("df -h /")
                        << QStringLiteral("dpkg --audit")
                        << QStringLiteral("apt --fix-broken install");
    return result;
  }

  result.title = QStringLiteral("先看基础状态，再收敛到具体问题");
  result.summary =
      QStringLiteral("当前没有指定明确问题，先刷新系统快照，再根据现象进入打印、网络、音频或安装链路。");
  result.stages << QStringLiteral("刷新一次本机状态")
                << QStringLiteral("选择最接近的故障场景")
                << QStringLiteral("导出工单或支持包");
  result.recommendedActionIds << QStringLiteral("collect-support-bundle")
                              << QStringLiteral("export-workorder");
  result.commandHints << QStringLiteral("cat /etc/os-release")
                      << QStringLiteral("systemctl --failed")
                      << QStringLiteral("journalctl -b -p warning -n 30");
  return result;
}
