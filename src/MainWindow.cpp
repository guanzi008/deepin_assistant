#include "MainWindow.h"

#include <QApplication>
#include <QClipboard>
#include <QCloseEvent>
#include <QComboBox>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFrame>
#include <QGuiApplication>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QListWidget>
#include <QListWidgetItem>
#include <QLineEdit>
#include <QMap>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QPixmap>
#include <QScreen>
#include <QStackedWidget>
#include <QTextEdit>
#include <QUrl>
#include <QVBoxLayout>
#include <QWindow>

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

QString singleLine(const QString &text, int limit = 140) {
  return text.simplified().left(limit);
}

QString multilinePreview(const QString &text, int limit = 320) {
  const QString trimmed = text.trimmed();
  return trimmed.isEmpty() ? QStringLiteral("（空）") : trimmed.left(limit);
}

} // namespace

MainWindow::MainWindow(const QString &artifactsDir, QWidget *parent)
    : QMainWindow(parent), m_diagnostics(artifactsDir), m_actionExecutor(artifactsDir) {
  buildUi();
  positionOnPrimaryScreen();
  refreshMailContext();
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
                 QStringLiteral("邮件整理"),
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
  m_stack->addWidget(buildMailPage());
  m_stack->addWidget(buildPrinterPage());
  m_stack->addWidget(buildGeneralPage());
  m_stack->addWidget(buildHistoryPage());
  mainLayout->addWidget(m_stack, 1);

  connect(nav, &QListWidget::currentRowChanged, this, &MainWindow::handlePageChanged);
  if (QGuiApplication::clipboard()) {
    connect(QGuiApplication::clipboard(),
            &QClipboard::dataChanged,
            this,
            &MainWindow::refreshMailContext);
  }
  handlePageChanged(0);

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
  connect(m_recommendedActionList,
          &QListWidget::currentItemChanged,
          this,
          [this](QListWidgetItem *current) {
            previewAction(current ? current->data(Qt::UserRole).toString() : QString());
          });
  connect(m_recommendedActionList, &QListWidget::itemDoubleClicked, this, [this](QListWidgetItem *item) {
    runAction(item->data(Qt::UserRole).toString());
  });
  actionsLayout->addWidget(m_recommendedActionList);
  m_actionPreviewView = new QTextEdit;
  m_actionPreviewView->setReadOnly(true);
  m_actionPreviewView->setMinimumHeight(140);
  actionsLayout->addWidget(m_actionPreviewView);
  layout->addWidget(actionsCard, 1);

  return page;
}

QWidget *MainWindow::buildMailPage() {
  auto *page = new QWidget;
  auto *layout = new QVBoxLayout(page);
  layout->setSpacing(14);

  auto *intentCard = createCard(QStringLiteral("邮件整理"));
  auto *intentLayout = qobject_cast<QVBoxLayout *>(intentCard->layout());
  m_mailIntentHintLabel = createValueLabel(true);
  m_mailIntentHintLabel->setText(QStringLiteral("写一句要发什么，下面会自动整理收件人、主题和正文。"));
  intentLayout->addWidget(m_mailIntentHintLabel);

  m_mailIntentEdit = new QLineEdit;
  m_mailIntentEdit->setPlaceholderText(QStringLiteral("例如：给同事发一封打印问题跟进邮件"));
  intentLayout->addWidget(m_mailIntentEdit);

  auto *toolbar = new QHBoxLayout;
  auto *refreshMailButton = new QPushButton(QStringLiteral("重新采集"));
  connect(refreshMailButton, &QPushButton::clicked, this, &MainWindow::refreshMailContext);
  toolbar->addWidget(refreshMailButton);

  auto *generateMailButton = new QPushButton(QStringLiteral("生成草稿"));
  connect(generateMailButton, &QPushButton::clicked, this, &MainWindow::generateMailDraft);
  toolbar->addWidget(generateMailButton);

  auto *exportContextButton = new QPushButton(QStringLiteral("导出上下文"));
  connect(exportContextButton, &QPushButton::clicked, this, &MainWindow::exportMailContext);
  toolbar->addWidget(exportContextButton);

  auto *captureButton = new QPushButton(QStringLiteral("截取当前屏幕"));
  connect(captureButton, &QPushButton::clicked, this, &MainWindow::captureMailScreenshot);
  toolbar->addWidget(captureButton);

  auto *exportDraftButton = new QPushButton(QStringLiteral("导出草稿"));
  connect(exportDraftButton, &QPushButton::clicked, this, &MainWindow::exportMailDraft);
  toolbar->addWidget(exportDraftButton);

  auto *copySubjectButton = new QPushButton(QStringLiteral("复制主题"));
  connect(copySubjectButton, &QPushButton::clicked, this, [this]() {
    if (m_mailSubjectEdit) {
      QGuiApplication::clipboard()->setText(m_mailSubjectEdit->text().trimmed());
    }
  });
  toolbar->addWidget(copySubjectButton);

  auto *copyBodyButton = new QPushButton(QStringLiteral("复制正文"));
  connect(copyBodyButton, &QPushButton::clicked, this, [this]() {
    if (m_mailBodyEdit) {
      QGuiApplication::clipboard()->setText(m_mailBodyEdit->toPlainText().trimmed());
    }
  });
  toolbar->addWidget(copyBodyButton);

  auto *copyAllButton = new QPushButton(QStringLiteral("复制整封草稿"));
  connect(copyAllButton, &QPushButton::clicked, this, [this]() {
    if (m_mailPreviewEdit) {
      QGuiApplication::clipboard()->setText(m_mailPreviewEdit->toPlainText().trimmed());
    }
  });
  toolbar->addWidget(copyAllButton);
  toolbar->addStretch(1);
  intentLayout->addLayout(toolbar);
  layout->addWidget(intentCard);

  auto *contextCard = createCard(QStringLiteral("桌面上下文"));
  auto *contextLayout = qobject_cast<QVBoxLayout *>(contextCard->layout());
  m_mailSessionLabel = createValueLabel(true);
  m_mailWindowLabel = createValueLabel(true);
  m_mailClipboardLabel = createValueLabel(true);
  m_mailRecipientsHintLabel = createValueLabel(true);
  contextLayout->addWidget(m_mailSessionLabel);
  contextLayout->addWidget(m_mailWindowLabel);
  contextLayout->addWidget(m_mailClipboardLabel);
  contextLayout->addWidget(m_mailRecipientsHintLabel);
  m_mailContextEdit = new QTextEdit;
  m_mailContextEdit->setReadOnly(true);
  m_mailContextEdit->setFixedHeight(170);
  contextLayout->addWidget(m_mailContextEdit);
  layout->addWidget(contextCard, 1);

  auto *draftCard = createCard(QStringLiteral("草稿"));
  auto *draftLayout = qobject_cast<QVBoxLayout *>(draftCard->layout());
  auto *recipientRow = new QHBoxLayout;
  recipientRow->addWidget(new QLabel(QStringLiteral("收件人建议")));
  m_mailRecipientsEdit = new QLineEdit;
  m_mailRecipientsEdit->setPlaceholderText(QStringLiteral("可手工调整收件人"));
  recipientRow->addWidget(m_mailRecipientsEdit, 1);
  draftLayout->addLayout(recipientRow);

  auto *subjectRow = new QHBoxLayout;
  subjectRow->addWidget(new QLabel(QStringLiteral("邮件主题")));
  m_mailSubjectEdit = new QLineEdit;
  m_mailSubjectEdit->setPlaceholderText(QStringLiteral("生成后可继续修改"));
  subjectRow->addWidget(m_mailSubjectEdit, 1);
  draftLayout->addLayout(subjectRow);

  m_mailBodyEdit = new QTextEdit;
  m_mailBodyEdit->setPlaceholderText(QStringLiteral("邮件正文会根据上下文自动整理。"));
  m_mailBodyEdit->setMinimumHeight(180);
  draftLayout->addWidget(m_mailBodyEdit);

  m_mailDraftHintLabel = createValueLabel(true);
  draftLayout->addWidget(m_mailDraftHintLabel);

  m_mailExportLabel = createValueLabel(true);
  draftLayout->addWidget(m_mailExportLabel);

  m_mailPreviewEdit = new QTextEdit;
  m_mailPreviewEdit->setReadOnly(true);
  m_mailPreviewEdit->setMinimumHeight(140);
  draftLayout->addWidget(m_mailPreviewEdit);
  layout->addWidget(draftCard, 1);

  connect(m_mailIntentEdit, &QLineEdit::textChanged, this, &MainWindow::generateMailDraft);
  connect(m_mailRecipientsEdit, &QLineEdit::textChanged, this, [this]() {
    if (m_mailDraftHintLabel) {
      m_mailDraftHintLabel->setText(QStringLiteral("可继续手工调整收件人，预览会同步更新。"));
    }
    updateMailDraftView();
  });
  connect(m_mailSubjectEdit, &QLineEdit::textChanged, this, [this]() { updateMailDraftView(); });
  connect(m_mailBodyEdit, &QTextEdit::textChanged, this, [this]() { updateMailDraftView(); });

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

QString MainWindow::timestamp() const {
  return QDateTime::currentDateTime().toString(QStringLiteral("yyyyMMdd-HHmmss"));
}

QString MainWindow::ensureArtifactSubdir(const QString &name) const {
  QDir root(m_actionExecutor.artifactsDir());
  root.mkpath(name);
  return root.filePath(name);
}

QString MainWindow::writeArtifactText(const QString &subdir,
                                      const QString &fileName,
                                      const QString &content) const {
  const QString targetPath = QDir(ensureArtifactSubdir(subdir)).filePath(fileName);
  QFile file(targetPath);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
    return QString();
  }

  file.write(content.toUtf8());
  file.close();
  return targetPath;
}

void MainWindow::handlePageChanged(int index) {
  if (m_stack) {
    m_stack->setCurrentIndex(index);
  }

  if (index == 1) {
    refreshMailContext();
  }
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
  generateMailDraft();
  appendLog(QStringLiteral("刷新诊断"),
            QStringLiteral("已重新采集系统、打印、网络和音频状态。"));
}

void MainWindow::analyzeCurrentScenario() {
  m_analysis = m_diagnostics.analyze(currentScenario(),
                                     m_noteEdit ? m_noteEdit->toPlainText().trimmed()
                                                : QString(),
                                     m_snapshot);
  updateAnalysisView();
  generateMailDraft();
}

void MainWindow::updateSnapshotView() {
  if (!m_systemLabel) {
    return;
  }

  m_systemLabel->setText(
      QStringLiteral("系统：%1\n内核：%2\n默认打印机：%3")
          .arg(m_snapshot.distroName,
               m_snapshot.kernelVersion,
               m_snapshot.defaultPrinter.isEmpty() ? QStringLiteral("无")
                                                   : m_snapshot.defaultPrinter));
  m_diskLabel->setText(QStringLiteral("根分区：%1").arg(m_snapshot.rootDiskUsage));
  m_memoryLabel->setText(
      QStringLiteral("内存：%1\n安装残留：%2")
          .arg(m_snapshot.memoryUsage,
               m_snapshot.hasInstallAttention ? QStringLiteral("需要处理")
                                              : QStringLiteral("未见异常")));
  m_networkLabel->setText(
      QStringLiteral("网络：\n%1\n\nNetworkManager：%2\n接口数：%3")
          .arg(m_snapshot.networkSummary,
               m_snapshot.networkManagerState,
               QString::number(m_snapshot.networkInterfaceCount)));
  m_audioLabel->setText(
      QStringLiteral("音频：\n%1\n\n默认输出：%2\n默认输入：%3")
          .arg(m_snapshot.audioState,
               m_snapshot.defaultAudioSink.isEmpty() ? QStringLiteral("无")
                                                     : m_snapshot.defaultAudioSink,
               m_snapshot.defaultAudioSource.isEmpty() ? QStringLiteral("无")
                                                       : m_snapshot.defaultAudioSource));
  m_cupsLabel->setText(
      QStringLiteral("cups：%1\n默认打印机：%2")
          .arg(m_snapshot.cupsState,
               m_snapshot.defaultPrinter.isEmpty() ? QStringLiteral("无")
                                                   : m_snapshot.defaultPrinter));
  m_queueLabel->setText(
      QStringLiteral("打印队列（%1）：\n%2")
          .arg(m_snapshot.printerQueueCount)
          .arg(m_snapshot.printerQueues.left(640)));
  m_printerDevicesLabel->setText(QStringLiteral("可见打印设备：\n%1")
                                     .arg(m_snapshot.printerDevices.left(420)));
  QStringList findings = m_snapshot.findings;
  if (m_snapshot.hasNetworkAttention) {
    findings << QStringLiteral("网络链路需要额外关注。");
  }
  if (m_snapshot.hasAudioAttention) {
    findings << QStringLiteral("音频会话需要额外关注。");
  }
  if (m_snapshot.hasInstallAttention) {
    findings << QStringLiteral("包管理状态需要额外关注。");
  }
  m_findingsEdit->setPlainText(findings.isEmpty()
                                   ? QStringLiteral("当前没有新的异常提示。")
                                   : findings.join(QStringLiteral("\n")));
}

void MainWindow::updateAnalysisView() {
  m_planTitleLabel->setText(m_analysis.title);
  m_planSummaryLabel->setText(
      QStringLiteral("%1\n\n执行前说明：%2")
          .arg(m_analysis.summary, m_analysis.previewText));
  m_riskLabel->setText(
      QStringLiteral("风险等级：%1 | 可用动作：%2")
          .arg(m_analysis.riskLevel)
          .arg(m_analysis.supportedActionIds.size()));
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
  if (!m_analysis.recommendedActionIds.isEmpty()) {
    previewAction(m_analysis.recommendedActionIds.first());
    m_recommendedActionList->setCurrentRow(0);
  } else {
    previewAction(QString());
  }
}

void MainWindow::refreshMailContext() {
  m_desktopContext = m_contextCollector.collect();
  updateMailContextView();
  generateMailDraft();
}

void MainWindow::generateMailDraft() {
  if (!m_mailIntentEdit) {
    return;
  }

  m_emailDraft = m_emailComposer.compose(m_mailIntentEdit->text().trimmed(),
                                         m_desktopContext,
                                         m_snapshot,
                                         m_analysis);
  if (m_mailRecipientsEdit) {
    m_mailRecipientsEdit->setText(m_emailDraft.recipients);
  }
  if (m_mailSubjectEdit) {
    m_mailSubjectEdit->setText(m_emailDraft.subject);
  }
  if (m_mailBodyEdit) {
    m_mailBodyEdit->setPlainText(m_emailDraft.body);
  }
  updateMailDraftView();
}

void MainWindow::previewAction(const QString &actionId) {
  if (!m_actionPreviewView) {
    return;
  }

  if (actionId.isEmpty()) {
    m_actionPreviewView->setPlainText(m_analysis.previewText);
    return;
  }

  QStringList lines;
  lines << QStringLiteral("动作：%1").arg(actionLabel(actionId))
        << QStringLiteral("场景：%1").arg(m_analysis.scenario)
        << QString();

  if (!m_analysis.previewText.isEmpty()) {
    lines << m_analysis.previewText << QString();
  }

  if (!m_analysis.previewCommands.isEmpty()) {
    lines << QStringLiteral("预览命令：");
    for (const auto &command : m_analysis.previewCommands) {
      lines << QStringLiteral("- %1").arg(command);
    }
    lines << QString();
  }

  if (!m_analysis.manualAuthCommands.isEmpty()) {
    lines << QStringLiteral("需要授权时会执行：");
    for (const auto &command : m_analysis.manualAuthCommands) {
      lines << QStringLiteral("- %1").arg(command);
    }
  }

  m_actionPreviewView->setPlainText(lines.join(QStringLiteral("\n")));
}

void MainWindow::updateMailContextView() {
  if (!m_mailContextEdit) {
    return;
  }

  m_mailSessionLabel->setText(
      QStringLiteral("会话：%1 | 用户：%2@%3")
          .arg(m_desktopContext.sessionType.isEmpty() ? QStringLiteral("unknown")
                                                      : m_desktopContext.sessionType,
               m_desktopContext.userName.isEmpty() ? QStringLiteral("unknown")
                                                   : m_desktopContext.userName,
               m_desktopContext.hostName.isEmpty() ? QStringLiteral("unknown")
                                                   : m_desktopContext.hostName));
  m_mailWindowLabel->setText(
      QStringLiteral("活动窗口：%1\n窗口类别：%2")
          .arg(singleLine(m_desktopContext.activeWindowTitle, 120),
               m_desktopContext.activeWindowClass.isEmpty()
                   ? QStringLiteral("unknown")
                   : m_desktopContext.activeWindowClass));
  m_mailClipboardLabel->setText(
      QStringLiteral("剪贴板预览：%1")
          .arg(multilinePreview(m_desktopContext.clipboardText, 160)));
  m_mailRecipientsHintLabel->setText(
      m_desktopContext.notes.isEmpty()
          ? QStringLiteral("当前上下文已就绪，可以直接整理一版邮件。")
          : m_desktopContext.notes.join(QStringLiteral("\n")));

  QStringList lines;
  lines << QStringLiteral("采集时间：%1").arg(m_desktopContext.collectedAt)
        << QStringLiteral("会话类型：%1").arg(m_desktopContext.sessionType)
        << QStringLiteral("用户：%1@%2")
               .arg(m_desktopContext.userName, m_desktopContext.hostName)
        << QStringLiteral("活动窗口：%1").arg(m_desktopContext.activeWindowTitle)
        << QStringLiteral("窗口类别：%1").arg(m_desktopContext.activeWindowClass)
        << QStringLiteral("剪贴板：%1")
               .arg(multilinePreview(m_desktopContext.clipboardText, 240));
  if (!m_desktopContext.notes.isEmpty()) {
    lines << QStringLiteral("提示：");
    for (const auto &note : m_desktopContext.notes) {
      lines << QStringLiteral("- %1").arg(note);
    }
  }
  m_mailContextEdit->setPlainText(lines.join(QStringLiteral("\n")));
}

void MainWindow::updateMailDraftView() {
  if (!m_mailRecipientsEdit || !m_mailSubjectEdit || !m_mailBodyEdit ||
      !m_mailPreviewEdit || !m_mailDraftHintLabel || !m_mailExportLabel) {
    return;
  }

  QStringList attachmentLines;
  for (const auto &path : m_mailAttachmentPaths) {
    attachmentLines << QStringLiteral("- %1").arg(path);
  }

  const QString preview =
      QStringLiteral("收件人：%1\n抄送：%2\n主题：%3\n\n%4%5")
          .arg(m_mailRecipientsEdit->text().trimmed().isEmpty()
                   ? m_emailDraft.recipients
                   : m_mailRecipientsEdit->text().trimmed(),
               m_emailDraft.cc.isEmpty() ? QStringLiteral("（按需补充）")
                                         : m_emailDraft.cc,
               m_mailSubjectEdit->text().trimmed().isEmpty()
                   ? m_emailDraft.subject
                   : m_mailSubjectEdit->text().trimmed(),
               m_mailBodyEdit->toPlainText().trimmed().isEmpty()
                   ? m_emailDraft.body
                   : m_mailBodyEdit->toPlainText().trimmed(),
               attachmentLines.isEmpty()
                   ? QString()
                   : QStringLiteral("\n\n附件建议：\n%1")
                         .arg(attachmentLines.join(QStringLiteral("\n"))));
  m_mailPreviewEdit->setPlainText(preview);

  QStringList hints;
  hints << m_emailDraft.rationale;
  if (!m_emailDraft.extractedTopics.isEmpty()) {
    hints << QStringLiteral("抓到的重点：%1")
                 .arg(m_emailDraft.extractedTopics.join(QStringLiteral(" / ")));
  }
  m_mailDraftHintLabel->setText(hints.join(QStringLiteral("\n")));
  updateMailExportHint();
}

void MainWindow::updateMailExportHint() {
  if (!m_mailExportLabel) {
    return;
  }

  QStringList lines;
  if (!m_lastMailContextPath.isEmpty()) {
    lines << QStringLiteral("上下文：%1").arg(m_lastMailContextPath);
  }
  if (!m_lastMailDraftPath.isEmpty()) {
    lines << QStringLiteral("草稿：%1").arg(m_lastMailDraftPath);
  }
  if (!m_mailAttachmentPaths.isEmpty()) {
    lines << QStringLiteral("截图：");
    for (const auto &path : m_mailAttachmentPaths) {
      lines << QStringLiteral("- %1").arg(path);
    }
  }

  m_mailExportLabel->setText(lines.isEmpty()
                                 ? QStringLiteral("导出后会在资料目录里留下草稿、上下文和截图。")
                                 : lines.join(QStringLiteral("\n")));
}

void MainWindow::exportMailContext() {
  QJsonObject root;
  root.insert(QStringLiteral("collectedAt"), m_desktopContext.collectedAt);
  root.insert(QStringLiteral("userName"), m_desktopContext.userName);
  root.insert(QStringLiteral("hostName"), m_desktopContext.hostName);
  root.insert(QStringLiteral("sessionType"), m_desktopContext.sessionType);
  root.insert(QStringLiteral("activeWindowTitle"), m_desktopContext.activeWindowTitle);
  root.insert(QStringLiteral("activeWindowClass"), m_desktopContext.activeWindowClass);
  root.insert(QStringLiteral("clipboardText"), m_desktopContext.clipboardText);
  root.insert(QStringLiteral("notes"), QJsonArray::fromStringList(m_desktopContext.notes));
  root.insert(QStringLiteral("distroName"), m_snapshot.distroName);
  root.insert(QStringLiteral("analysisTitle"), m_analysis.title);
  root.insert(QStringLiteral("analysisSummary"), m_analysis.summary);

  const QString fileName = QStringLiteral("mail-context-%1.json").arg(timestamp());
  const QString path =
      writeArtifactText(QStringLiteral("mail-contexts"),
                        fileName,
                        QString::fromUtf8(QJsonDocument(root).toJson(QJsonDocument::Indented)));
  if (!path.isEmpty()) {
    m_lastMailContextPath = path;
    reloadArtifactList();
    updateMailExportHint();
    appendLog(QStringLiteral("导出邮件上下文"),
              QStringLiteral("已导出到\n%1").arg(path));
  }
}

void MainWindow::exportMailDraft() {
  const QString recipients =
      m_mailRecipientsEdit ? m_mailRecipientsEdit->text().trimmed() : m_emailDraft.recipients;
  const QString subject =
      m_mailSubjectEdit ? m_mailSubjectEdit->text().trimmed() : m_emailDraft.subject;
  const QString body =
      m_mailBodyEdit ? m_mailBodyEdit->toPlainText().trimmed() : m_emailDraft.body;

  QStringList lines;
  lines << QStringLiteral("# 邮件草稿")
        << QString()
        << QStringLiteral("- 收件人：%1").arg(recipients.isEmpty() ? QStringLiteral("待确认") : recipients)
        << QStringLiteral("- 主题：%1").arg(subject.isEmpty() ? QStringLiteral("待确认") : subject)
        << QStringLiteral("- 生成时间：%1").arg(QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss")))
        << QString();
  if (!m_mailAttachmentPaths.isEmpty()) {
    lines << QStringLiteral("## 附件建议");
    for (const auto &path : m_mailAttachmentPaths) {
      lines << QStringLiteral("- %1").arg(path);
    }
    lines << QString();
  }
  lines << QStringLiteral("## 正文")
        << body
        << QString()
        << QStringLiteral("## 说明")
        << m_emailDraft.rationale;

  const QString fileName = QStringLiteral("mail-draft-%1.md").arg(timestamp());
  const QString path =
      writeArtifactText(QStringLiteral("mail-drafts"), fileName, lines.join(QStringLiteral("\n")));
  if (!path.isEmpty()) {
    m_lastMailDraftPath = path;
    reloadArtifactList();
    updateMailExportHint();
    appendLog(QStringLiteral("导出邮件草稿"),
              QStringLiteral("已导出到\n%1").arg(path));
  }
}

void MainWindow::captureMailScreenshot() {
  QScreen *screen = windowHandle() && windowHandle()->screen()
                        ? windowHandle()->screen()
                        : QGuiApplication::primaryScreen();
  if (!screen) {
    appendLog(QStringLiteral("截取当前屏幕"), QStringLiteral("当前没有可用屏幕。"));
    return;
  }

  const QString path = QDir(ensureArtifactSubdir(QStringLiteral("screenshots")))
                           .filePath(QStringLiteral("mail-shot-%1.png").arg(timestamp()));
  const QPixmap shot = screen->grabWindow(0);
  if (shot.isNull() || !shot.save(path, "PNG")) {
    appendLog(QStringLiteral("截取当前屏幕"), QStringLiteral("截图保存失败。"));
    return;
  }

  if (!m_mailAttachmentPaths.contains(path)) {
    m_mailAttachmentPaths.prepend(path);
  }
  reloadArtifactList();
  updateMailDraftView();
  appendLog(QStringLiteral("截取当前屏幕"),
            QStringLiteral("已保存截图\n%1").arg(path));
}

void MainWindow::runAction(const QString &actionId) {
  const auto outcome = m_actionExecutor.run(actionId,
                                            currentScenario(),
                                            m_noteEdit ? m_noteEdit->toPlainText().trimmed()
                                                       : QString(),
                                            m_snapshot,
                                            m_analysis);

  QStringList bodyLines;
  bodyLines << QStringLiteral("场景：%1").arg(outcome.scenarioLabel);
  if (outcome.pendingManualAuth) {
    bodyLines << QStringLiteral("状态：待授权执行");
  } else {
    bodyLines << QStringLiteral("状态：%1")
                     .arg(outcome.success ? QStringLiteral("已执行")
                                          : QStringLiteral("执行失败"));
  }
  bodyLines << outcome.summary;
  if (!outcome.previewText.isEmpty()) {
    bodyLines << QString() << QStringLiteral("执行前说明：") << outcome.previewText;
  }
  if (!outcome.previewCommands.isEmpty()) {
    bodyLines << QString() << QStringLiteral("命令 / 步骤：");
    for (const auto &command : outcome.previewCommands) {
      bodyLines << QStringLiteral("- %1").arg(command);
    }
  }
  if (!outcome.manualAuthCommands.isEmpty()) {
    bodyLines << QString() << QStringLiteral("授权命令：");
    for (const auto &command : outcome.manualAuthCommands) {
      bodyLines << QStringLiteral("- %1").arg(command);
    }
  }
  if (!outcome.commandHint.isEmpty()) {
    bodyLines << QString() << outcome.commandHint;
  }
  if (!outcome.outputPaths.isEmpty()) {
    bodyLines << QString() << QStringLiteral("导出文件：");
    for (const auto &artifact : outcome.outputPaths) {
      bodyLines << QStringLiteral("- %1：%2").arg(artifact.label, artifact.path);
    }
  }
  if (!outcome.runLogPath.isEmpty()) {
    bodyLines << QString() << QStringLiteral("运行日志：")
              << outcome.runLogPath;
  }
  if (!outcome.details.isEmpty()) {
    bodyLines << QString() << outcome.details;
  }

  appendLog(outcome.label, bodyLines.join(QStringLiteral("\n")));
  reloadArtifactList();
  if (!outcome.pendingManualAuth) {
    refreshSnapshot();
  }
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
