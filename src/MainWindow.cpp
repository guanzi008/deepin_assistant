#include "MainWindow.h"

#include <QApplication>
#include <QCloseEvent>
#include <QComboBox>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFrame>
#include <QGuiApplication>
#include <QHBoxLayout>
#include <QLabel>
#include <QListWidget>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QScreen>
#include <QStackedWidget>
#include <QTextEdit>
#include <QUrl>
#include <QVBoxLayout>

namespace {

QString actionLabel(const QString &actionId) {
  static const QMap<QString, QString> labels = {
      {QStringLiteral("collect-support-bundle"), QStringLiteral("收集支持包")},
      {QStringLiteral("export-workorder"), QStringLiteral("导出诊断工单")},
      {QStringLiteral("clear-print-queue"), QStringLiteral("清空打印队列")},
      {QStringLiteral("restart-cups"), QStringLiteral("重启 CUPS")},
      {QStringLiteral("delete-old-queues"), QStringLiteral("删除旧队列")},
      {QStringLiteral("reinstall-print-stack"), QStringLiteral("重装关键打印组件")},
      {QStringLiteral("repair-cups-permissions"),
       QStringLiteral("修复 CUPS 过滤链权限")},
      {QStringLiteral("export-network-check"), QStringLiteral("导出网络检查")},
      {QStringLiteral("restart-network-manager"),
       QStringLiteral("重启 NetworkManager")},
      {QStringLiteral("export-audio-check"), QStringLiteral("导出音频检查")},
      {QStringLiteral("restart-audio-session"), QStringLiteral("重启音频会话")},
      {QStringLiteral("export-install-check"), QStringLiteral("导出安装检查")},
      {QStringLiteral("repair-package-state"), QStringLiteral("修复软件包状态")}};
  return labels.value(actionId, actionId);
}

QFrame *createCard(const QString &title) {
  auto *card = new QFrame;
  card->setObjectName(QStringLiteral("Card"));
  auto *layout = new QVBoxLayout(card);
  layout->setContentsMargins(18, 16, 18, 16);
  layout->setSpacing(12);

  auto *label = new QLabel(title);
  label->setObjectName(QStringLiteral("CardTitle"));
  layout->addWidget(label);
  return card;
}

QLabel *createValueLabel(bool compact = false) {
  auto *label = new QLabel;
  label->setWordWrap(true);
  label->setTextInteractionFlags(Qt::TextSelectableByMouse);
  label->setObjectName(compact ? QStringLiteral("MetricCompact")
                               : QStringLiteral("MetricValue"));
  return label;
}

} // namespace

MainWindow::MainWindow(const QString &artifactsDir, QWidget *parent)
    : QMainWindow(parent), m_diagnostics(artifactsDir), m_actionExecutor(artifactsDir) {
  buildUi();
  positionOnPrimaryScreen();
  refreshSnapshot();
  analyzeCurrentScenario();
}

void MainWindow::buildUi() {
  setWindowTitle(QStringLiteral("Orbit Deepin Assistant"));
  setMinimumSize(520, 860);
  resize(560, 940);

  auto *root = new QWidget;
  auto *rootLayout = new QHBoxLayout(root);
  rootLayout->setContentsMargins(0, 0, 0, 0);
  rootLayout->setSpacing(0);

  auto *nav = new QListWidget;
  nav->setFixedWidth(136);
  nav->addItems({QStringLiteral("概览"),
                 QStringLiteral("打印修复"),
                 QStringLiteral("常见问题"),
                 QStringLiteral("执行记录")});
  nav->setCurrentRow(0);
  nav->setObjectName(QStringLiteral("NavList"));
  rootLayout->addWidget(nav);

  auto *mainArea = new QWidget;
  auto *mainLayout = new QVBoxLayout(mainArea);
  mainLayout->setContentsMargins(18, 18, 18, 18);
  mainLayout->setSpacing(14);

  auto *header = new QFrame;
  header->setObjectName(QStringLiteral("HeaderBar"));
  auto *headerLayout = new QHBoxLayout(header);
  headerLayout->setContentsMargins(16, 14, 16, 14);
  headerLayout->setSpacing(10);

  auto *titleWrap = new QVBoxLayout;
  auto *title = new QLabel(QStringLiteral("Orbit Deepin Assistant"));
  title->setObjectName(QStringLiteral("WindowTitle"));
  m_runtimeLabel = new QLabel(QStringLiteral("原生桌面模式 · Qt6 / C++ / CMake"));
  m_runtimeLabel->setObjectName(QStringLiteral("RuntimeHint"));
  titleWrap->addWidget(title);
  titleWrap->addWidget(m_runtimeLabel);
  headerLayout->addLayout(titleWrap, 1);

  auto *refreshButton = new QPushButton(QStringLiteral("刷新诊断"));
  connect(refreshButton, &QPushButton::clicked, this, &MainWindow::refreshSnapshot);
  headerLayout->addWidget(refreshButton);

  auto *openArtifactsButton = new QPushButton(QStringLiteral("资料目录"));
  connect(openArtifactsButton,
          &QPushButton::clicked,
          this,
          &MainWindow::openArtifactsDirectory);
  headerLayout->addWidget(openArtifactsButton);

  auto *pinButton = new QPushButton(QStringLiteral("固定窗口"));
  connect(pinButton, &QPushButton::clicked, this, &MainWindow::togglePinnedState);
  headerLayout->addWidget(pinButton);

  auto *quitButton = new QPushButton(QStringLiteral("退出"));
  connect(quitButton, &QPushButton::clicked, this, [this]() {
    m_allowClose = true;
    emit exitRequested();
  });
  headerLayout->addWidget(quitButton);

  mainLayout->addWidget(header);

  m_stack = new QStackedWidget;
  m_stack->addWidget(buildOverviewPage());
  m_stack->addWidget(buildPrinterPage());
  m_stack->addWidget(buildGeneralPage());
  m_stack->addWidget(buildHistoryPage());
  mainLayout->addWidget(m_stack, 1);

  connect(nav, &QListWidget::currentRowChanged, m_stack, &QStackedWidget::setCurrentIndex);

  rootLayout->addWidget(mainArea, 1);
  setCentralWidget(root);

  setStyleSheet(QStringLiteral(R"(
    QWidget {
      background: #07111d;
      color: #d9e6f2;
      font-size: 14px;
    }
    #HeaderBar, #Card {
      background: #0e1a29;
      border: 1px solid #18324c;
      border-radius: 18px;
    }
    #WindowTitle {
      font-size: 22px;
      font-weight: 700;
      color: #f6fbff;
    }
    #RuntimeHint {
      color: #7ca1bf;
      font-size: 12px;
    }
    #CardTitle {
      color: #9dddf0;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1px;
    }
    #MetricValue {
      color: #edf6ff;
      line-height: 1.45;
    }
    #MetricCompact {
      color: #b8d1e5;
      font-size: 13px;
    }
    QListWidget#NavList {
      background: #08111b;
      border: none;
      padding-top: 20px;
      outline: 0;
    }
    QListWidget#NavList::item {
      margin: 6px 12px;
      padding: 12px 14px;
      border-radius: 14px;
      color: #8cb3d6;
    }
    QListWidget#NavList::item:selected {
      background: #123456;
      color: #f7fbff;
    }
    QPushButton {
      background: #113354;
      border: 1px solid #245079;
      border-radius: 12px;
      padding: 10px 14px;
      color: #f5fbff;
    }
    QPushButton:hover {
      background: #17446d;
    }
    QComboBox, QPlainTextEdit, QTextEdit, QListWidget {
      background: #091521;
      border: 1px solid #17314a;
      border-radius: 12px;
    }
    QComboBox, QPlainTextEdit {
      padding: 8px 10px;
    }
    QTextEdit, QPlainTextEdit, QListWidget {
      padding: 8px;
    }
  )"));
}

QWidget *MainWindow::buildOverviewPage() {
  auto *page = new QWidget;
  auto *layout = new QVBoxLayout(page);
  layout->setSpacing(14);

  auto *scenarioCard = createCard(QStringLiteral("问题入口"));
  auto *scenarioLayout = qobject_cast<QVBoxLayout *>(scenarioCard->layout());
  m_scenarioBox = new QComboBox;
  m_scenarioBox->addItems({QStringLiteral("系统总览"),
                           QStringLiteral("打印机连接失败"),
                           QStringLiteral("打印任务卡住"),
                           QStringLiteral("驱动与过滤链异常"),
                           QStringLiteral("网络异常"),
                           QStringLiteral("没有声音了"),
                           QStringLiteral("软件安装失败"),
                           QStringLiteral("自定义描述")});
  connect(m_scenarioBox,
          &QComboBox::currentTextChanged,
          this,
          &MainWindow::analyzeCurrentScenario);
  scenarioLayout->addWidget(m_scenarioBox);

  m_noteEdit = new QPlainTextEdit;
  m_noteEdit->setPlaceholderText(QStringLiteral("补充一行现场描述，比如：打印机能识别但作业一直卡在队列里。"));
  m_noteEdit->setFixedHeight(78);
  scenarioLayout->addWidget(m_noteEdit);

  auto *analyzeButton = new QPushButton(QStringLiteral("重新整理处理方案"));
  connect(analyzeButton, &QPushButton::clicked, this, &MainWindow::analyzeCurrentScenario);
  scenarioLayout->addWidget(analyzeButton);
  layout->addWidget(scenarioCard);

  auto *summaryCard = createCard(QStringLiteral("当前判断"));
  auto *summaryLayout = qobject_cast<QVBoxLayout *>(summaryCard->layout());
  m_planTitleLabel = createValueLabel();
  m_planTitleLabel->setStyleSheet(QStringLiteral("font-size: 18px; font-weight: 700; color: #f7fcff;"));
  m_riskLabel = createValueLabel(true);
  m_planSummaryLabel = createValueLabel();
  summaryLayout->addWidget(m_planTitleLabel);
  summaryLayout->addWidget(m_riskLabel);
  summaryLayout->addWidget(m_planSummaryLabel);
  layout->addWidget(summaryCard);

  auto *stagesCard = createCard(QStringLiteral("处理阶段"));
  auto *stagesLayout = qobject_cast<QVBoxLayout *>(stagesCard->layout());
  m_stageList = new QListWidget;
  stagesLayout->addWidget(m_stageList);
  layout->addWidget(stagesCard, 1);

  auto *commandsCard = createCard(QStringLiteral("命令参考"));
  auto *commandsLayout = qobject_cast<QVBoxLayout *>(commandsCard->layout());
  m_commandHintList = new QListWidget;
  commandsLayout->addWidget(m_commandHintList);
  layout->addWidget(commandsCard, 1);

  auto *actionsCard = createCard(QStringLiteral("建议动作"));
  auto *actionsLayout = qobject_cast<QVBoxLayout *>(actionsCard->layout());
  m_recommendedActionList = new QListWidget;
  connect(m_recommendedActionList, &QListWidget::itemDoubleClicked, this, [this](QListWidgetItem *item) {
    runAction(item->data(Qt::UserRole).toString());
  });
  actionsLayout->addWidget(m_recommendedActionList);
  layout->addWidget(actionsCard, 1);

  return page;
}

QWidget *MainWindow::buildPrinterPage() {
  auto *page = new QWidget;
  auto *layout = new QVBoxLayout(page);
  layout->setSpacing(14);

  auto *statusCard = createCard(QStringLiteral("打印链路状态"));
  auto *statusLayout = qobject_cast<QVBoxLayout *>(statusCard->layout());
  m_cupsLabel = createValueLabel();
  m_queueLabel = createValueLabel();
  m_printerDevicesLabel = createValueLabel();
  statusLayout->addWidget(m_cupsLabel);
  statusLayout->addWidget(m_queueLabel);
  statusLayout->addWidget(m_printerDevicesLabel);
  layout->addWidget(statusCard);

  auto *actionsCard = createCard(QStringLiteral("打印修复动作"));
  auto *actionsLayout = qobject_cast<QVBoxLayout *>(actionsCard->layout());
  actionsLayout->addWidget(createActionButton(QStringLiteral("收集支持包"), QStringLiteral("collect-support-bundle")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("导出诊断工单"), QStringLiteral("export-workorder")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("清空打印队列"), QStringLiteral("clear-print-queue")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("重启 CUPS"), QStringLiteral("restart-cups")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("删除旧队列"), QStringLiteral("delete-old-queues")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("重装关键打印组件"), QStringLiteral("reinstall-print-stack")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("修复 CUPS 过滤链权限"), QStringLiteral("repair-cups-permissions")));
  layout->addWidget(actionsCard, 1);

  auto *findingsCard = createCard(QStringLiteral("当前发现"));
  auto *findingsLayout = qobject_cast<QVBoxLayout *>(findingsCard->layout());
  m_findingsEdit = new QTextEdit;
  m_findingsEdit->setReadOnly(true);
  findingsLayout->addWidget(m_findingsEdit);
  layout->addWidget(findingsCard, 1);

  return page;
}

QWidget *MainWindow::buildGeneralPage() {
  auto *page = new QWidget;
  auto *layout = new QVBoxLayout(page);
  layout->setSpacing(14);

  auto *systemCard = createCard(QStringLiteral("系统快照"));
  auto *systemLayout = qobject_cast<QVBoxLayout *>(systemCard->layout());
  m_systemLabel = createValueLabel();
  m_diskLabel = createValueLabel();
  m_memoryLabel = createValueLabel();
  m_networkLabel = createValueLabel();
  m_audioLabel = createValueLabel();
  systemLayout->addWidget(m_systemLabel);
  systemLayout->addWidget(m_diskLabel);
  systemLayout->addWidget(m_memoryLabel);
  systemLayout->addWidget(m_networkLabel);
  systemLayout->addWidget(m_audioLabel);
  layout->addWidget(systemCard);

  auto *actionsCard = createCard(QStringLiteral("常见问题动作"));
  auto *actionsLayout = qobject_cast<QVBoxLayout *>(actionsCard->layout());
  actionsLayout->addWidget(createActionButton(QStringLiteral("导出网络检查"), QStringLiteral("export-network-check")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("重启 NetworkManager"), QStringLiteral("restart-network-manager")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("导出音频检查"), QStringLiteral("export-audio-check")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("重启音频会话"), QStringLiteral("restart-audio-session")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("导出安装检查"), QStringLiteral("export-install-check")));
  actionsLayout->addWidget(createActionButton(QStringLiteral("修复软件包状态"), QStringLiteral("repair-package-state")));
  layout->addWidget(actionsCard, 1);

  return page;
}

QWidget *MainWindow::buildHistoryPage() {
  auto *page = new QWidget;
  auto *layout = new QVBoxLayout(page);
  layout->setSpacing(14);

  auto *logCard = createCard(QStringLiteral("执行日志"));
  auto *logLayout = qobject_cast<QVBoxLayout *>(logCard->layout());
  m_logView = new QTextEdit;
  m_logView->setReadOnly(true);
  logLayout->addWidget(m_logView);
  layout->addWidget(logCard, 1);

  auto *artifactCard = createCard(QStringLiteral("导出文件"));
  auto *artifactLayout = qobject_cast<QVBoxLayout *>(artifactCard->layout());
  m_artifactList = new QListWidget;
  connect(m_artifactList, &QListWidget::itemDoubleClicked, this, [](QListWidgetItem *item) {
    QDesktopServices::openUrl(QUrl::fromLocalFile(item->text()));
  });
  artifactLayout->addWidget(m_artifactList);
  layout->addWidget(artifactCard, 1);

  return page;
}

QPushButton *MainWindow::createActionButton(const QString &label,
                                            const QString &actionId) {
  auto *button = new QPushButton(label);
  connect(button, &QPushButton::clicked, this, [this, actionId]() { runAction(actionId); });
  return button;
}

void MainWindow::positionOnPrimaryScreen() {
  if (!QGuiApplication::primaryScreen()) {
    return;
  }

  const QRect workArea = QGuiApplication::primaryScreen()->availableGeometry();
  const int width = qMin(560, qMax(520, workArea.width() / 3));
  const int height = qMin(960, qMax(860, workArea.height() - 32));
  const int x = workArea.x() + workArea.width() - width - 18;
  const int y = workArea.y() + (workArea.height() - height) / 2;
  setGeometry(x, y, width, height);
}

void MainWindow::refreshSnapshot() {
  QApplication::setOverrideCursor(Qt::BusyCursor);
  m_snapshot = m_diagnostics.collect();
  QApplication::restoreOverrideCursor();
  updateSnapshotView();
  analyzeCurrentScenario();
  appendLog(QStringLiteral("刷新诊断"),
            QStringLiteral("已重新采集系统、打印、网络和音频状态。"));
}

void MainWindow::analyzeCurrentScenario() {
  m_analysis = m_diagnostics.analyze(currentScenario(),
                                     m_noteEdit ? m_noteEdit->toPlainText().trimmed()
                                                : QString(),
                                     m_snapshot);
  updateAnalysisView();
}

void MainWindow::updateSnapshotView() {
  if (!m_systemLabel) {
    return;
  }

  m_systemLabel->setText(
      QStringLiteral("系统：%1\n内核：%2")
          .arg(m_snapshot.distroName, m_snapshot.kernelVersion));
  m_diskLabel->setText(QStringLiteral("根分区：%1").arg(m_snapshot.rootDiskUsage));
  m_memoryLabel->setText(QStringLiteral("内存：%1").arg(m_snapshot.memoryUsage));
  m_networkLabel->setText(
      QStringLiteral("网络：\n%1\n\nNetworkManager：%2")
          .arg(m_snapshot.networkSummary, m_snapshot.networkManagerState));
  m_audioLabel->setText(QStringLiteral("音频：\n%1").arg(m_snapshot.audioState));
  m_cupsLabel->setText(QStringLiteral("cups：%1").arg(m_snapshot.cupsState));
  m_queueLabel->setText(QStringLiteral("打印队列：\n%1")
                            .arg(m_snapshot.printerQueues.left(640)));
  m_printerDevicesLabel->setText(QStringLiteral("可见打印设备：\n%1")
                                     .arg(m_snapshot.printerDevices.left(420)));
  m_findingsEdit->setPlainText(m_snapshot.findings.isEmpty()
                                   ? QStringLiteral("当前没有新的异常提示。")
                                   : m_snapshot.findings.join(QStringLiteral("\n")));
}

void MainWindow::updateAnalysisView() {
  m_planTitleLabel->setText(m_analysis.title);
  m_planSummaryLabel->setText(m_analysis.summary);
  m_riskLabel->setText(QStringLiteral("风险等级：%1").arg(m_analysis.riskLevel));
  m_stageList->clear();
  m_stageList->addItems(m_analysis.stages);
  m_commandHintList->clear();
  for (const auto &command : m_analysis.commandHints) {
    m_commandHintList->addItem(command);
  }
  m_recommendedActionList->clear();
  for (const auto &actionId : m_analysis.recommendedActionIds) {
    auto *item = new QListWidgetItem(actionLabel(actionId), m_recommendedActionList);
    item->setData(Qt::UserRole, actionId);
  }
}

void MainWindow::runAction(const QString &actionId) {
  const auto outcome = m_actionExecutor.run(actionId,
                                            currentScenario(),
                                            m_noteEdit ? m_noteEdit->toPlainText().trimmed()
                                                       : QString(),
                                            m_snapshot,
                                            m_analysis);

  QString body = outcome.summary;
  if (!outcome.commandHint.isEmpty()) {
    body.append(QStringLiteral("\n%1").arg(outcome.commandHint));
  }
  if (!outcome.artifactPath.isEmpty()) {
    body.append(QStringLiteral("\n%1").arg(outcome.artifactPath));
  }
  if (!outcome.details.isEmpty()) {
    body.append(QStringLiteral("\n\n%1").arg(outcome.details));
  }

  appendLog(outcome.label, body);
  reloadArtifactList();
}

void MainWindow::appendLog(const QString &title, const QString &body) {
  const QString block =
      QStringLiteral("[%1] %2\n%3\n")
          .arg(QDateTime::currentDateTime().toString(QStringLiteral("HH:mm:ss")),
               title,
               body);
  m_logView->append(block);
}

void MainWindow::reloadArtifactList() {
  m_artifactList->clear();
  const auto files = m_actionExecutor.listArtifacts();
  for (const auto &file : files) {
    m_artifactList->addItem(file);
  }
}

QString MainWindow::currentScenario() const {
  return m_scenarioBox ? m_scenarioBox->currentText() : QStringLiteral("系统总览");
}

void MainWindow::openArtifactsDirectory() {
  QDesktopServices::openUrl(QUrl::fromLocalFile(m_actionExecutor.artifactsDir()));
}

void MainWindow::togglePinnedState() {
  m_pinned = !m_pinned;
  setWindowFlag(Qt::WindowStaysOnTopHint, m_pinned);
  show();
}

void MainWindow::toggleVisibilityFromLauncher() {
  if (isVisible()) {
    hide();
    return;
  }

  show();
  raise();
  activateWindow();
}

void MainWindow::closeEvent(QCloseEvent *event) {
  if (m_allowClose) {
    QMainWindow::closeEvent(event);
    return;
  }

  hide();
  event->ignore();
}
