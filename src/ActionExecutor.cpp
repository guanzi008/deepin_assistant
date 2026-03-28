#include "ActionExecutor.h"

#include "CommandRunner.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QTextStream>

namespace {

ActionOutcome makeOutcome(const QString &actionId, const QString &label) {
  ActionOutcome outcome;
  outcome.actionId = actionId;
  outcome.label = label;
  return outcome;
}

QString scenarioLabel(const QString &scenario) {
  return scenario.isEmpty() ? QStringLiteral("系统总览") : scenario;
}

void attachAnalysisMetadata(ActionOutcome &outcome,
                            const QString &scenario,
                            const AnalysisResult &analysis) {
  outcome.scenario = scenario;
  outcome.scenarioLabel = scenarioLabel(scenario);
  outcome.previewText = analysis.previewText;
  outcome.previewCommands = analysis.previewCommands;
  outcome.manualAuthCommands = analysis.manualAuthCommands;
  outcome.supportedActionIds = analysis.supportedActionIds;
}

void addOutputPath(ActionOutcome &outcome,
                   const QString &label,
                   const QString &path) {
  if (path.isEmpty()) {
    return;
  }

  outcome.outputPaths.append({label, path});
  if (outcome.artifactPath.isEmpty()) {
    outcome.artifactPath = path;
  }
}

ActionOutcome finalizeOutcome(ActionOutcome outcome,
                              const QString &scenario,
                              const AnalysisResult &analysis) {
  attachAnalysisMetadata(outcome, scenario, analysis);
  return outcome;
}

} // namespace

ActionExecutor::ActionExecutor(const QString &artifactsDir)
    : m_artifactsDir(artifactsDir) {}

QString ActionExecutor::artifactsDir() const { return m_artifactsDir; }

QString ActionExecutor::timestamp() const {
  return QDateTime::currentDateTime().toString(QStringLiteral("yyyyMMdd-HHmmss"));
}

QString ActionExecutor::ensureSubdir(const QString &name) const {
  QDir dir(m_artifactsDir);
  dir.mkpath(name);
  return dir.filePath(name);
}

QString ActionExecutor::writeTextFile(const QString &subdir,
                                      const QString &fileName,
                                      const QString &content) const {
  const QString targetDir = ensureSubdir(subdir);
  const QString targetPath = QDir(targetDir).filePath(fileName);
  QFile file(targetPath);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
    return {};
  }

  QTextStream stream(&file);
  stream << content;
  file.close();
  return targetPath;
}

QString ActionExecutor::writeJsonFile(const QString &subdir,
                                      const QString &fileName,
                                      const QByteArray &content) const {
  const QString targetDir = ensureSubdir(subdir);
  const QString targetPath = QDir(targetDir).filePath(fileName);
  QFile file(targetPath);
  if (!file.open(QIODevice::WriteOnly)) {
    return {};
  }

  file.write(content);
  file.close();
  return targetPath;
}

QStringList ActionExecutor::extractQueueNames(const QString &queueText) const {
  QStringList names;
  const QRegularExpression rx(QStringLiteral("^printer\\s+(\\S+)"),
                              QRegularExpression::MultilineOption);
  auto it = rx.globalMatch(queueText);
  while (it.hasNext()) {
    names << it.next().captured(1);
  }
  names.removeDuplicates();
  return names;
}

ActionOutcome ActionExecutor::createSupportBundle(
    const QString &scenario,
    const QString &note,
    const DiagnosticSnapshot &snapshot,
    const AnalysisResult &analysis) const {
  QJsonObject root;
  root.insert(QStringLiteral("scenario"), scenario);
  root.insert(QStringLiteral("note"), note);
  root.insert(QStringLiteral("title"), analysis.title);
  root.insert(QStringLiteral("summary"), analysis.summary);
  root.insert(QStringLiteral("riskLevel"), analysis.riskLevel);

  QJsonArray stages;
  for (const auto &stage : analysis.stages) {
    stages.append(stage);
  }
  root.insert(QStringLiteral("stages"), stages);

  QJsonArray findings;
  for (const auto &item : snapshot.findings) {
    findings.append(item);
  }
  root.insert(QStringLiteral("findings"), findings);

  QJsonObject diag;
  diag.insert(QStringLiteral("distroName"), snapshot.distroName);
  diag.insert(QStringLiteral("distroVersion"), snapshot.distroVersion);
  diag.insert(QStringLiteral("kernelVersion"), snapshot.kernelVersion);
  diag.insert(QStringLiteral("rootDiskUsage"), snapshot.rootDiskUsage);
  diag.insert(QStringLiteral("memoryUsage"), snapshot.memoryUsage);
  diag.insert(QStringLiteral("networkSummary"), snapshot.networkSummary);
  diag.insert(QStringLiteral("networkInterfaceLines"),
              QJsonArray::fromStringList(snapshot.networkInterfaceLines));
  diag.insert(QStringLiteral("networkInterfaceCount"), snapshot.networkInterfaceCount);
  diag.insert(QStringLiteral("cupsState"), snapshot.cupsState);
  diag.insert(QStringLiteral("networkManagerState"), snapshot.networkManagerState);
  diag.insert(QStringLiteral("audioState"), snapshot.audioState);
  diag.insert(QStringLiteral("audioLines"),
              QJsonArray::fromStringList(snapshot.audioLines));
  diag.insert(QStringLiteral("defaultAudioSink"), snapshot.defaultAudioSink);
  diag.insert(QStringLiteral("defaultAudioSource"), snapshot.defaultAudioSource);
  diag.insert(QStringLiteral("printerQueues"), snapshot.printerQueues);
  diag.insert(QStringLiteral("printerQueueNames"),
              QJsonArray::fromStringList(snapshot.printerQueueNames));
  diag.insert(QStringLiteral("printerQueueCount"), snapshot.printerQueueCount);
  diag.insert(QStringLiteral("printerDevices"), snapshot.printerDevices);
  diag.insert(QStringLiteral("printerDeviceHints"),
              QJsonArray::fromStringList(snapshot.printerDeviceHints));
  diag.insert(QStringLiteral("printerDeviceCount"), snapshot.printerDeviceCount);
  diag.insert(QStringLiteral("recentCupsLog"), snapshot.recentCupsLog);
  diag.insert(QStringLiteral("recentCupsLogLines"),
              QJsonArray::fromStringList(snapshot.recentCupsLogLines));
  diag.insert(QStringLiteral("installAudit"), snapshot.installAudit);
  diag.insert(QStringLiteral("installAuditLines"),
              QJsonArray::fromStringList(snapshot.installAuditLines));
  diag.insert(QStringLiteral("defaultPrinter"), snapshot.defaultPrinter);
  diag.insert(QStringLiteral("cupsActive"), snapshot.cupsActive);
  diag.insert(QStringLiteral("hasPrinterQueues"), snapshot.hasPrinterQueues);
  diag.insert(QStringLiteral("hasNetworkAttention"), snapshot.hasNetworkAttention);
  diag.insert(QStringLiteral("hasAudioAttention"), snapshot.hasAudioAttention);
  diag.insert(QStringLiteral("hasInstallAttention"), snapshot.hasInstallAttention);
  root.insert(QStringLiteral("diagnostics"), diag);

  const QString fileName =
      QStringLiteral("support-bundle-%1.json").arg(timestamp());
  const QString path = writeJsonFile(
      QStringLiteral("support-bundles"),
      fileName,
      QJsonDocument(root).toJson(QJsonDocument::Indented));

  ActionOutcome outcome = makeOutcome(QStringLiteral("collect-support-bundle"),
                                      QStringLiteral("收集支持包"));
  outcome.success = !path.isEmpty();
  outcome.summary = path.isEmpty() ? QStringLiteral("支持包写入失败。")
                                   : QStringLiteral("支持包已导出。");
  outcome.details = path;
  addOutputPath(outcome, QStringLiteral("支持包"), path);
  outcome.previewText = analysis.previewText;
  outcome.previewCommands = analysis.previewCommands;
  outcome.manualAuthCommands = analysis.manualAuthCommands;
  outcome.supportedActionIds = analysis.supportedActionIds;
  outcome.scenario = scenario;
  outcome.scenarioLabel = scenarioLabel(scenario);
  return outcome;
}

ActionOutcome ActionExecutor::exportWorkorder(
    const QString &scenario,
    const QString &note,
    const DiagnosticSnapshot &snapshot,
    const AnalysisResult &analysis) const {
  QStringList lines;
  lines << QStringLiteral("# 诊断工单")
        << QString()
        << QStringLiteral("- 场景：%1").arg(scenario)
        << QStringLiteral("- 备注：%1").arg(note.isEmpty() ? QStringLiteral("无") : note)
        << QStringLiteral("- 系统：%1").arg(snapshot.distroName)
        << QStringLiteral("- 内核：%1").arg(snapshot.kernelVersion)
        << QStringLiteral("- 根分区：%1").arg(snapshot.rootDiskUsage)
        << QStringLiteral("- cups：%1").arg(snapshot.cupsState)
        << QStringLiteral("- NetworkManager：%1").arg(snapshot.networkManagerState)
        << QStringLiteral("- 默认打印机：%1")
               .arg(snapshot.defaultPrinter.isEmpty() ? QStringLiteral("无")
                                                      : snapshot.defaultPrinter)
        << QStringLiteral("- 打印队列数：%1").arg(snapshot.printerQueueCount)
        << QStringLiteral("- 打印设备数：%1").arg(snapshot.printerDeviceCount)
        << QStringLiteral("- 网络接口数：%1").arg(snapshot.networkInterfaceCount)
        << QStringLiteral("- 默认音频输出：%1")
               .arg(snapshot.defaultAudioSink.isEmpty() ? QStringLiteral("无")
                                                        : snapshot.defaultAudioSink)
        << QStringLiteral("- 默认音频输入：%1")
               .arg(snapshot.defaultAudioSource.isEmpty() ? QStringLiteral("无")
                                                          : snapshot.defaultAudioSource)
        << QString()
        << QStringLiteral("## 当前判断")
        << analysis.title
        << QString()
        << analysis.summary
        << QString()
        << QStringLiteral("## 处理阶段");

  for (const auto &stage : analysis.stages) {
    lines << QStringLiteral("- %1").arg(stage);
  }

  lines << QString()
        << QStringLiteral("## 当前发现");
  for (const auto &finding : snapshot.findings) {
    lines << QStringLiteral("- %1").arg(finding);
  }

  lines << QString()
        << QStringLiteral("## 结构化快照")
        << QStringLiteral("- 网络注意项：%1")
               .arg(snapshot.hasNetworkAttention ? QStringLiteral("是")
                                                 : QStringLiteral("否"))
        << QStringLiteral("- 音频注意项：%1")
               .arg(snapshot.hasAudioAttention ? QStringLiteral("是")
                                                : QStringLiteral("否"))
        << QStringLiteral("- 安装注意项：%1")
               .arg(snapshot.hasInstallAttention ? QStringLiteral("是")
                                                  : QStringLiteral("否"));

  lines << QString()
        << QStringLiteral("## 命令参考");
  for (const auto &hint : analysis.commandHints) {
    lines << QStringLiteral("- `%1`").arg(hint);
  }

  const QString fileName =
      QStringLiteral("diagnostic-workorder-%1.md").arg(timestamp());
  const QString path =
      writeTextFile(QStringLiteral("workorders"), fileName, lines.join('\n'));

  ActionOutcome outcome = makeOutcome(QStringLiteral("export-workorder"),
                                      QStringLiteral("导出诊断工单"));
  outcome.success = !path.isEmpty();
  outcome.summary = path.isEmpty() ? QStringLiteral("工单写入失败。")
                                   : QStringLiteral("诊断工单已导出。");
  outcome.details = path;
  addOutputPath(outcome, QStringLiteral("诊断工单"), path);
  outcome.previewText = analysis.previewText;
  outcome.previewCommands = analysis.previewCommands;
  outcome.manualAuthCommands = analysis.manualAuthCommands;
  outcome.supportedActionIds = analysis.supportedActionIds;
  outcome.scenario = scenario;
  outcome.scenarioLabel = scenarioLabel(scenario);
  return outcome;
}

ActionOutcome ActionExecutor::exportSimpleReport(const QString &actionId,
                                                 const QString &label,
                                                 const QString &subdir,
                                                 const QString &body) const {
  const QString fileName =
      QStringLiteral("%1-%2.txt").arg(actionId, timestamp());
  const QString path = writeTextFile(subdir, fileName, body);
  ActionOutcome outcome = makeOutcome(actionId, label);
  outcome.success = !path.isEmpty();
  outcome.summary = path.isEmpty() ? QStringLiteral("报告写入失败。")
                                   : QStringLiteral("%1已导出。").arg(label);
  outcome.details = body;
  addOutputPath(outcome, QStringLiteral("%1报告").arg(label), path);
  return outcome;
}

ActionOutcome ActionExecutor::createPrivilegedScript(const QString &actionId,
                                                     const QString &label,
                                                     const QStringList &commands,
                                                     const QString &summary) const {
  QStringList lines;
  lines << QStringLiteral("#!/bin/sh")
        << QStringLiteral("set -eu");
  lines << commands;

  const QString fileName =
      QStringLiteral("%1-%2.sh").arg(actionId, timestamp());
  const QString path =
      writeTextFile(QStringLiteral("pending-actions"), fileName, lines.join('\n'));

  if (path.isEmpty()) {
    ActionOutcome failed = makeOutcome(actionId, label);
    failed.success = false;
    failed.requiresManualAuth = true;
    failed.summary = QStringLiteral("授权脚本生成失败。");
    return failed;
  }

  QFile::setPermissions(path,
                        QFileDevice::ReadOwner | QFileDevice::WriteOwner |
                            QFileDevice::ExeOwner | QFileDevice::ReadGroup |
                            QFileDevice::ExeGroup | QFileDevice::ReadOther |
                            QFileDevice::ExeOther);

  ActionOutcome outcome = makeOutcome(actionId, label);
  outcome.success = true;
  outcome.requiresManualAuth = true;
  outcome.summary = summary;
  outcome.details = QStringLiteral("已生成待执行脚本，请确认后再授权运行。");
  outcome.commandHint = QStringLiteral("pkexec sh \"%1\"").arg(path);
  outcome.previewText = summary;
  outcome.previewCommands = commands;
  outcome.manualAuthCommands << outcome.commandHint;
  addOutputPath(outcome, QStringLiteral("待执行脚本"), path);
  return outcome;
}

ActionOutcome ActionExecutor::runUserCommand(const QString &actionId,
                                             const QString &label,
                                             const QString &command,
                                             const QString &summary) const {
  const auto result = CommandRunner::shell(command, 6000);
  const bool success =
      result.started && !result.timedOut && result.exitCode == 0;

  QStringList details;
  details << QStringLiteral("$ %1").arg(command);
  if (!result.output.isEmpty()) {
    details << result.output;
  }
  if (!result.errorOutput.isEmpty()) {
    details << result.errorOutput;
  }

  ActionOutcome outcome = makeOutcome(actionId, label);
  outcome.success = success;
  outcome.requiresManualAuth = false;
  outcome.summary = success ? summary : QStringLiteral("%1执行失败。").arg(label);
  outcome.details = details.join(QStringLiteral("\n"));
  outcome.previewText = summary;
  outcome.previewCommands << command;
  return outcome;
}

ActionOutcome ActionExecutor::run(const QString &actionId,
                                  const QString &scenario,
                                  const QString &note,
                                  const DiagnosticSnapshot &snapshot,
                                  const AnalysisResult &analysis) const {
  if (actionId == QStringLiteral("collect-support-bundle")) {
    return finalizeOutcome(createSupportBundle(scenario, note, snapshot, analysis),
                           scenario,
                           analysis);
  }

  if (actionId == QStringLiteral("export-workorder")) {
    return finalizeOutcome(exportWorkorder(scenario, note, snapshot, analysis),
                           scenario,
                           analysis);
  }

  if (actionId == QStringLiteral("export-network-check")) {
    auto outcome = exportSimpleReport(QStringLiteral("network-check"),
                                      QStringLiteral("网络检查"),
                                      QStringLiteral("reports"),
                                      snapshot.networkSummary);
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.previewText = analysis.previewText;
    outcome.previewCommands = analysis.previewCommands;
    outcome.manualAuthCommands = analysis.manualAuthCommands;
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("export-audio-check")) {
    auto outcome = exportSimpleReport(QStringLiteral("audio-check"),
                                      QStringLiteral("音频检查"),
                                      QStringLiteral("reports"),
                                      snapshot.audioState);
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.previewText = analysis.previewText;
    outcome.previewCommands = analysis.previewCommands;
    outcome.manualAuthCommands = analysis.manualAuthCommands;
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("export-install-check")) {
    auto outcome = exportSimpleReport(QStringLiteral("install-check"),
                                      QStringLiteral("安装检查"),
                                      QStringLiteral("reports"),
                                      snapshot.installAudit);
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.previewText = analysis.previewText;
    outcome.previewCommands = analysis.previewCommands;
    outcome.manualAuthCommands = analysis.manualAuthCommands;
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("clear-print-queue")) {
    auto outcome = runUserCommand(actionId,
                                  QStringLiteral("清空打印队列"),
                                  QStringLiteral("cancel -a"),
                                  QStringLiteral("打印队列清理命令已执行。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.previewText = QStringLiteral("清理当前用户可执行的打印作业。");
    outcome.previewCommands << QStringLiteral("cancel -a");
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("restart-audio-session")) {
    auto outcome = runUserCommand(
        actionId,
        QStringLiteral("重启音频会话"),
        QStringLiteral(
            "systemctl --user restart wireplumber pipewire pipewire-pulse"),
        QStringLiteral("音频会话重启命令已执行。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.previewText = QStringLiteral("重启当前用户态音频会话。");
    outcome.previewCommands << QStringLiteral(
        "systemctl --user restart wireplumber pipewire pipewire-pulse");
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("restart-cups")) {
    auto outcome = createPrivilegedScript(
        actionId,
        QStringLiteral("重启 CUPS"),
        {QStringLiteral("systemctl restart cups"),
         QStringLiteral("systemctl is-active cups")},
        QStringLiteral("已生成 CUPS 重启脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("restart-network-manager")) {
    auto outcome = createPrivilegedScript(
        actionId,
        QStringLiteral("重启 NetworkManager"),
        {QStringLiteral("systemctl restart NetworkManager"),
         QStringLiteral("systemctl is-active NetworkManager")},
        QStringLiteral("已生成 NetworkManager 重启脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("repair-package-state")) {
    auto outcome = createPrivilegedScript(
        actionId,
        QStringLiteral("修复软件包状态"),
        {QStringLiteral("apt --fix-broken install -y"),
         QStringLiteral("dpkg --configure -a")},
        QStringLiteral("已生成软件包修复脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("reinstall-print-stack")) {
    auto outcome = createPrivilegedScript(
        actionId,
        QStringLiteral("重装关键打印组件"),
        {QStringLiteral(
             "apt install --reinstall -y cups cups-filters printer-driver-all"),
         QStringLiteral("systemctl restart cups")},
        QStringLiteral("已生成打印栈重装脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("repair-cups-permissions")) {
    auto outcome = createPrivilegedScript(
        actionId,
        QStringLiteral("修复 CUPS 过滤链权限"),
        {QStringLiteral(
             "find /usr/lib/cups/filter -type f -exec chmod 755 {} + 2>/dev/null || true"),
         QStringLiteral(
             "find /usr/lib/cups/backend -type f -exec chmod 755 {} + 2>/dev/null || true"),
         QStringLiteral("systemctl restart cups")},
        QStringLiteral("已生成 CUPS 过滤链权限修复脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  if (actionId == QStringLiteral("delete-old-queues")) {
    const auto queues = extractQueueNames(snapshot.printerQueues);
    if (queues.isEmpty()) {
      ActionOutcome outcome = makeOutcome(actionId, QStringLiteral("删除旧队列"));
      outcome.success = true;
      outcome.summary = QStringLiteral("当前没有检测到可删除的打印队列。");
      outcome.scenario = scenario;
      outcome.scenarioLabel = scenarioLabel(scenario);
      outcome.previewText = QStringLiteral("在没有旧队列时，这一步会直接跳过。");
      outcome.supportedActionIds = analysis.supportedActionIds;
      return outcome;
    }

    QStringList commands;
    for (const auto &queue : queues) {
      commands << QStringLiteral("lpadmin -x %1").arg(queue);
    }

    auto outcome = createPrivilegedScript(actionId,
                                          QStringLiteral("删除旧队列"),
                                          commands,
                                          QStringLiteral("已生成删除旧打印队列脚本。"));
    outcome.scenario = scenario;
    outcome.scenarioLabel = scenarioLabel(scenario);
    outcome.supportedActionIds = analysis.supportedActionIds;
    return outcome;
  }

  ActionOutcome outcome = makeOutcome(actionId, actionId);
  outcome.success = false;
  outcome.summary = QStringLiteral("未识别的动作。");
  outcome.scenario = scenario;
  outcome.scenarioLabel = scenarioLabel(scenario);
  outcome.supportedActionIds = analysis.supportedActionIds;
  return outcome;
}

QStringList ActionExecutor::listArtifacts() const {
  QStringList files;
  QDir root(m_artifactsDir);
  const QStringList subdirs = {QStringLiteral("support-bundles"),
                               QStringLiteral("workorders"),
                               QStringLiteral("reports"),
                               QStringLiteral("pending-actions")};
  for (const auto &subdir : subdirs) {
    QDir dir(root.filePath(subdir));
    if (!dir.exists()) {
      continue;
    }

    const auto entries =
        dir.entryInfoList(QDir::Files, QDir::Time | QDir::Reversed);
    for (const auto &entry : entries) {
      files << entry.absoluteFilePath();
    }
  }
  return files;
}
