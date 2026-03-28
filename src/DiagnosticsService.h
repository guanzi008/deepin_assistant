#pragma once

#include <QList>
#include <QMap>
#include <QString>
#include <QStringList>

struct ActionArtifactPath {
  QString label;
  QString path;
};

struct DiagnosticSnapshot {
  QString distroName;
  QString distroVersion;
  QString kernelVersion;
  QString rootDiskUsage;
  QString memoryUsage;
  QString networkSummary;
  QString cupsState;
  QString networkManagerState;
  QString audioState;
  QString printerQueues;
  QString printerDevices;
  QString recentCupsLog;
  QString installAudit;
  QStringList findings;
  QStringList printerQueueNames;
  QStringList printerDeviceHints;
  QStringList recentCupsLogLines;
  QStringList installAuditLines;
  QStringList networkInterfaceLines;
  QStringList audioLines;
  QString defaultPrinter;
  QString defaultAudioSink;
  QString defaultAudioSource;
  int printerQueueCount = 0;
  int printerDeviceCount = 0;
  int networkInterfaceCount = 0;
  bool cupsActive = false;
  bool hasPrinterQueues = false;
  bool hasNetworkAttention = false;
  bool hasAudioAttention = false;
  bool hasInstallAttention = false;
};

struct AnalysisResult {
  QString scenario;
  QString title;
  QString summary;
  QString riskLevel;
  QStringList stages;
  QStringList recommendedActionIds;
  QStringList commandHints;
  QString previewText;
  QStringList previewCommands;
  QStringList manualAuthCommands;
  QStringList supportedActionIds;
  QList<ActionArtifactPath> outputPaths;
};

class DiagnosticsService {
public:
  explicit DiagnosticsService(const QString &artifactsDir);

  DiagnosticSnapshot collect() const;
  AnalysisResult analyze(const QString &scenario,
                         const QString &note,
                         const DiagnosticSnapshot &snapshot) const;

  QString artifactsDir() const;

private:
  QMap<QString, QString> readOsRelease() const;
  QString clean(const QString &value) const;
  QString firstMeaningfulLines(const QString &value, int maxLines = 4) const;
  QString summarizeDiskUsage() const;
  QString summarizeMemoryUsage() const;
  QString summarizeNetwork() const;
  QString summarizeAudio() const;
  QString summarizeInstallAudit() const;
  QString inferScenario(const QString &note) const;
  QString scenarioLabel(const QString &scenario) const;
  QStringList supportedActionsForScenario(const QString &scenario) const;

  QString m_artifactsDir;
};
