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
  diag.insert(QStringLiteral("cupsState"), snapshot.cupsState);
  diag.insert(QStringLiteral("networkManagerState"), snapshot.networkManagerState);
  diag.insert(QStringLiteral("audioState"), snapshot.audioState);
  diag.insert(QStringLiteral("printerQueues"), snapshot.printerQueues);
  diag.insert(QStringLiteral("printerDevices"), snapshot.printerDevices);
  diag.insert(QStringLiteral("recentCupsLog"), snapshot.recentCupsLog);
  diag.insert(QStringLiteral("installAudit"), snapshot.installAudit);
  root.insert(QStringLiteral("diagnostics"), diag);

  const QString fileName =
      QStringLiteral("support-bundle-%1.json").arg(timestamp());
  const QString path = writeJsonFile(
      QStringLiteral("support-bundles"),
      fileName,
      QJsonDocument(root).toJson(QJsonDocument::Indented));

  return {
      QStringLiteral("collect-support-bundle"),
      QStringLiteral("收集支持包"),
      !path.isEmpty(),
      false,
      path.isEmpty() ? QStringLiteral("支持包写入失败。")
                     : QStringLiteral("支持包已导出。"),
      path,
      path,
      QString()};
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
        << QStringLiteral("## 命令参考");
  for (const auto &hint : analysis.commandHints) {
    lines << QStringLiteral("- `%1`").arg(hint);
  }

  const QString fileName =
      QStringLiteral("diagnostic-workorder-%1.md").arg(timestamp());
  const QString path =
      writeTextFile(QStringLiteral("workorders"), fileName, lines.join('\n'));

  return {
      QStringLiteral("export-workorder"),
      QStringLiteral("导出诊断工单"),
      !path.isEmpty(),
      false,
      path.isEmpty() ? QStringLiteral("工单写入失败。")
                     : QStringLiteral("诊断工单已导出。"),
      path,
      path,
      QString()};
}

ActionOutcome ActionExecutor::exportSimpleReport(const QString &actionId,
                                                 const QString &label,
                                                 const QString &subdir,
                                                 const QString &body) const {
  const QString fileName =
      QStringLiteral("%1-%2.txt").arg(actionId, timestamp());
  const QString path = writeTextFile(subdir, fileName, body);
  return {actionId,
          label,
          !path.isEmpty(),
          false,
          path.isEmpty() ? QStringLiteral("报告写入失败。")
                         : QStringLiteral("%1已导出。").arg(label),
          path,
          path,
          QString()};
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
    return {actionId,
            label,
            false,
            true,
            QStringLiteral("授权脚本生成失败。"),
            QString(),
            QString(),
            QString()};
  }

  QFile::setPermissions(path,
                        QFileDevice::ReadOwner | QFileDevice::WriteOwner |
                            QFileDevice::ExeOwner | QFileDevice::ReadGroup |
                            QFileDevice::ExeGroup | QFileDevice::ReadOther |
                            QFileDevice::ExeOther);

  return {actionId,
          label,
          true,
          true,
          summary,
          QStringLiteral("已生成待执行脚本，请确认后再授权运行。"),
          path,
          QStringLiteral("pkexec sh \"%1\"").arg(path)};
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

  return {actionId,
          label,
          success,
          false,
          success ? summary : QStringLiteral("%1执行失败。").arg(label),
          details.join(QStringLiteral("\n")),
          QString(),
          QString()};
}

ActionOutcome ActionExecutor::run(const QString &actionId,
                                  const QString &scenario,
                                  const QString &note,
                                  const DiagnosticSnapshot &snapshot,
                                  const AnalysisResult &analysis) const {
  if (actionId == QStringLiteral("collect-support-bundle")) {
    return createSupportBundle(scenario, note, snapshot, analysis);
  }

  if (actionId == QStringLiteral("export-workorder")) {
    return exportWorkorder(scenario, note, snapshot, analysis);
  }

  if (actionId == QStringLiteral("export-network-check")) {
    return exportSimpleReport(QStringLiteral("network-check"),
                              QStringLiteral("网络检查"),
                              QStringLiteral("reports"),
                              snapshot.networkSummary);
  }

  if (actionId == QStringLiteral("export-audio-check")) {
    return exportSimpleReport(QStringLiteral("audio-check"),
                              QStringLiteral("音频检查"),
                              QStringLiteral("reports"),
                              snapshot.audioState);
  }

  if (actionId == QStringLiteral("export-install-check")) {
    return exportSimpleReport(QStringLiteral("install-check"),
                              QStringLiteral("安装检查"),
                              QStringLiteral("reports"),
                              snapshot.installAudit);
  }

  if (actionId == QStringLiteral("clear-print-queue")) {
    return runUserCommand(actionId,
                          QStringLiteral("清空打印队列"),
                          QStringLiteral("cancel -a"),
                          QStringLiteral("打印队列清理命令已执行。"));
  }

  if (actionId == QStringLiteral("restart-audio-session")) {
    return runUserCommand(
        actionId,
        QStringLiteral("重启音频会话"),
        QStringLiteral(
            "systemctl --user restart wireplumber pipewire pipewire-pulse"),
        QStringLiteral("音频会话重启命令已执行。"));
  }

  if (actionId == QStringLiteral("restart-cups")) {
    return createPrivilegedScript(
        actionId,
        QStringLiteral("重启 CUPS"),
        {QStringLiteral("systemctl restart cups"),
         QStringLiteral("systemctl is-active cups")},
        QStringLiteral("已生成 CUPS 重启脚本。"));
  }

  if (actionId == QStringLiteral("restart-network-manager")) {
    return createPrivilegedScript(
        actionId,
        QStringLiteral("重启 NetworkManager"),
        {QStringLiteral("systemctl restart NetworkManager"),
         QStringLiteral("systemctl is-active NetworkManager")},
        QStringLiteral("已生成 NetworkManager 重启脚本。"));
  }

  if (actionId == QStringLiteral("repair-package-state")) {
    return createPrivilegedScript(
        actionId,
        QStringLiteral("修复软件包状态"),
        {QStringLiteral("apt --fix-broken install -y"),
         QStringLiteral("dpkg --configure -a")},
        QStringLiteral("已生成软件包修复脚本。"));
  }

  if (actionId == QStringLiteral("reinstall-print-stack")) {
    return createPrivilegedScript(
        actionId,
        QStringLiteral("重装关键打印组件"),
        {QStringLiteral(
             "apt install --reinstall -y cups cups-filters printer-driver-all"),
         QStringLiteral("systemctl restart cups")},
        QStringLiteral("已生成打印栈重装脚本。"));
  }

  if (actionId == QStringLiteral("repair-cups-permissions")) {
    return createPrivilegedScript(
        actionId,
        QStringLiteral("修复 CUPS 过滤链权限"),
        {QStringLiteral(
             "find /usr/lib/cups/filter -type f -exec chmod 755 {} + 2>/dev/null || true"),
         QStringLiteral(
             "find /usr/lib/cups/backend -type f -exec chmod 755 {} + 2>/dev/null || true"),
         QStringLiteral("systemctl restart cups")},
        QStringLiteral("已生成 CUPS 过滤链权限修复脚本。"));
  }

  if (actionId == QStringLiteral("delete-old-queues")) {
    const auto queues = extractQueueNames(snapshot.printerQueues);
    if (queues.isEmpty()) {
      return {actionId,
              QStringLiteral("删除旧队列"),
              true,
              false,
              QStringLiteral("当前没有检测到可删除的打印队列。"),
              QString(),
              QString(),
              QString()};
    }

    QStringList commands;
    for (const auto &queue : queues) {
      commands << QStringLiteral("lpadmin -x %1").arg(queue);
    }

    return createPrivilegedScript(actionId,
                                  QStringLiteral("删除旧队列"),
                                  commands,
                                  QStringLiteral("已生成删除旧打印队列脚本。"));
  }

  return {actionId,
          actionId,
          false,
          false,
          QStringLiteral("未识别的动作。"),
          QString(),
          QString(),
          QString()};
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
