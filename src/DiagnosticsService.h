#pragma once

#include <QMap>
#include <QString>
#include <QStringList>

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
  bool cupsActive = false;
  bool hasPrinterQueues = false;
};

struct AnalysisResult {
  QString scenario;
  QString title;
  QString summary;
  QString riskLevel;
  QStringList stages;
  QStringList recommendedActionIds;
  QStringList commandHints;
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

  QString m_artifactsDir;
};
