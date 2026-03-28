#pragma once

#include "ActionExecutor.h"
#include "ContextCollector.h"
#include "DiagnosticsService.h"
#include "EmailComposer.h"

#include <QMainWindow>

template <typename T>
class QFutureWatcher;
class QLabel;
class QListWidget;
class QComboBox;
class QLineEdit;
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
  void handleSnapshotCollected();
  void handlePageChanged(int index);
  void refreshMailContext();
  void generateMailDraft();
  void exportMailDraft();
  void exportMailContext();
  void captureMailScreenshot();
  void previewAction(const QString &actionId);
  void openArtifactsDirectory();
  void togglePinnedState();

private:
  void buildUi();
  QWidget *buildOverviewPage();
  QWidget *buildPrinterPage();
  QWidget *buildMailPage();
  QWidget *buildGeneralPage();
  QWidget *buildHistoryPage();
  QPushButton *createActionButton(const QString &label, const QString &actionId);
  void runAction(const QString &actionId);
  void updateSnapshotView();
  void updateAnalysisView();
  void updateMailContextView();
  void updateMailDraftView();
  void updateMailExportHint();
  void setRefreshState(bool busy, const QString &statusText = QString());
  void appendLog(const QString &title, const QString &body);
  void reloadArtifactList();
  void positionOnPrimaryScreen();
  QString currentScenario() const;
  QString timestamp() const;
  QString ensureArtifactSubdir(const QString &name) const;
  QString writeArtifactText(const QString &subdir,
                            const QString &fileName,
                            const QString &content) const;

  DiagnosticsService m_diagnostics;
  ActionExecutor m_actionExecutor;
  ContextCollector m_contextCollector;
  EmailComposer m_emailComposer;
  DiagnosticSnapshot m_snapshot;
  AnalysisResult m_analysis;
  DesktopContext m_desktopContext;
  EmailDraft m_emailDraft;
  QStringList m_mailAttachmentPaths;
  QString m_lastMailDraftPath;
  QString m_lastMailContextPath;
  bool m_pinned = true;
  bool m_allowClose = false;
  bool m_refreshQueued = false;

  QFutureWatcher<DiagnosticSnapshot> *m_snapshotWatcher = nullptr;
  QPushButton *m_refreshButton = nullptr;
  QLabel *m_runtimeLabel = nullptr;
  QLabel *m_systemLabel = nullptr;
  QLabel *m_diskLabel = nullptr;
  QLabel *m_memoryLabel = nullptr;
  QLabel *m_networkLabel = nullptr;
  QLabel *m_audioLabel = nullptr;
  QLabel *m_cupsLabel = nullptr;
  QLabel *m_queueLabel = nullptr;
  QLabel *m_printerDevicesLabel = nullptr;
  QLabel *m_mailSessionLabel = nullptr;
  QLabel *m_mailWindowLabel = nullptr;
  QLabel *m_mailClipboardLabel = nullptr;
  QLabel *m_mailIntentHintLabel = nullptr;
  QLabel *m_mailRecipientsHintLabel = nullptr;
  QLabel *m_mailDraftHintLabel = nullptr;
  QLabel *m_mailExportLabel = nullptr;
  QLabel *m_planTitleLabel = nullptr;
  QLabel *m_planSummaryLabel = nullptr;
  QLabel *m_riskLabel = nullptr;
  QTextEdit *m_findingsEdit = nullptr;
  QTextEdit *m_actionPreviewView = nullptr;
  QLineEdit *m_mailIntentEdit = nullptr;
  QLineEdit *m_mailRecipientsEdit = nullptr;
  QLineEdit *m_mailSubjectEdit = nullptr;
  QTextEdit *m_mailBodyEdit = nullptr;
  QTextEdit *m_mailContextEdit = nullptr;
  QTextEdit *m_mailPreviewEdit = nullptr;
  QListWidget *m_stageList = nullptr;
  QListWidget *m_commandHintList = nullptr;
  QListWidget *m_recommendedActionList = nullptr;
  QListWidget *m_artifactList = nullptr;
  QTextEdit *m_logView = nullptr;
  QComboBox *m_scenarioBox = nullptr;
  QPlainTextEdit *m_noteEdit = nullptr;
  QStackedWidget *m_stack = nullptr;
};
