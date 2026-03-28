#pragma once

#include "ActionExecutor.h"
#include "DiagnosticsService.h"

#include <QMainWindow>

class QLabel;
class QListWidget;
class QComboBox;
class QTextEdit;
class QPlainTextEdit;
class QPushButton;
class QStackedWidget;

class MainWindow : public QMainWindow {
  Q_OBJECT

public:
  explicit MainWindow(const QString &artifactsDir, QWidget *parent = nullptr);

  void toggleVisibilityFromLauncher();

signals:
  void exitRequested();

protected:
  void closeEvent(QCloseEvent *event) override;

private slots:
  void refreshSnapshot();
  void analyzeCurrentScenario();
  void openArtifactsDirectory();
  void togglePinnedState();

private:
  void buildUi();
  QWidget *buildOverviewPage();
  QWidget *buildPrinterPage();
  QWidget *buildGeneralPage();
  QWidget *buildHistoryPage();
  QPushButton *createActionButton(const QString &label, const QString &actionId);
  void runAction(const QString &actionId);
  void updateSnapshotView();
  void updateAnalysisView();
  void appendLog(const QString &title, const QString &body);
  void reloadArtifactList();
  void positionOnPrimaryScreen();
  QString currentScenario() const;

  DiagnosticsService m_diagnostics;
  ActionExecutor m_actionExecutor;
  DiagnosticSnapshot m_snapshot;
  AnalysisResult m_analysis;
  bool m_pinned = true;
  bool m_allowClose = false;

  QLabel *m_runtimeLabel = nullptr;
  QLabel *m_systemLabel = nullptr;
  QLabel *m_diskLabel = nullptr;
  QLabel *m_memoryLabel = nullptr;
  QLabel *m_networkLabel = nullptr;
  QLabel *m_audioLabel = nullptr;
  QLabel *m_cupsLabel = nullptr;
  QLabel *m_queueLabel = nullptr;
  QLabel *m_printerDevicesLabel = nullptr;
  QLabel *m_planTitleLabel = nullptr;
  QLabel *m_planSummaryLabel = nullptr;
  QLabel *m_riskLabel = nullptr;
  QTextEdit *m_findingsEdit = nullptr;
  QListWidget *m_stageList = nullptr;
  QListWidget *m_commandHintList = nullptr;
  QListWidget *m_recommendedActionList = nullptr;
  QListWidget *m_artifactList = nullptr;
  QTextEdit *m_logView = nullptr;
  QComboBox *m_scenarioBox = nullptr;
  QPlainTextEdit *m_noteEdit = nullptr;
  QStackedWidget *m_stack = nullptr;
};
