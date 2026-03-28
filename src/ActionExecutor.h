#pragma once

#include "DiagnosticsService.h"

#include <QString>
#include <QStringList>

struct ActionOutcome {
  QString actionId;
  QString label;
  QString scenario;
  QString scenarioLabel;
  bool success = false;
  bool requiresManualAuth = false;
  QString summary;
  QString previewText;
  QStringList previewCommands;
  QStringList manualAuthCommands;
  QStringList supportedActionIds;
  QString details;
  QList<ActionArtifactPath> outputPaths;
  QString artifactPath;
  QString commandHint;
};

class ActionExecutor {
public:
  explicit ActionExecutor(const QString &artifactsDir);

  ActionOutcome run(const QString &actionId,
                    const QString &scenario,
                    const QString &note,
                    const DiagnosticSnapshot &snapshot,
                    const AnalysisResult &analysis) const;

  QString artifactsDir() const;
  QStringList listArtifacts() const;

private:
  QString timestamp() const;
  QString ensureSubdir(const QString &name) const;
  QString writeTextFile(const QString &subdir,
                        const QString &fileName,
                        const QString &content) const;
  QString writeJsonFile(const QString &subdir,
                        const QString &fileName,
                        const QByteArray &content) const;
  QStringList extractQueueNames(const QString &queueText) const;
  ActionOutcome createSupportBundle(const QString &scenario,
                                    const QString &note,
                                    const DiagnosticSnapshot &snapshot,
                                    const AnalysisResult &analysis) const;
  ActionOutcome exportWorkorder(const QString &scenario,
                                const QString &note,
                                const DiagnosticSnapshot &snapshot,
                                const AnalysisResult &analysis) const;
  ActionOutcome exportSimpleReport(const QString &actionId,
                                   const QString &label,
                                   const QString &subdir,
                                   const QString &body) const;
  ActionOutcome createPrivilegedScript(const QString &actionId,
                                       const QString &label,
                                       const QStringList &commands,
                                       const QString &summary) const;
  ActionOutcome runUserCommand(const QString &actionId,
                               const QString &label,
                               const QString &command,
                               const QString &summary) const;

  QString m_artifactsDir;
};
