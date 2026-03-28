#include "ContextCollector.h"

#include "CommandRunner.h"

#include <QApplication>
#include <QClipboard>
#include <QDateTime>
#include <QRegularExpression>
#include <QSysInfo>

namespace {

QString clean(const QString &value) {
  return value.trimmed();
}

QString captureFirstQuotedValue(const QString &value) {
  const QRegularExpression pattern(QStringLiteral("\"([^\"]+)\""));
  const auto match = pattern.match(value);
  if (match.hasMatch()) {
    return match.captured(1).trimmed();
  }

  return {};
}

QString fallbackText(const QString &value, const QString &fallback) {
  const QString trimmed = value.trimmed();
  return trimmed.isEmpty() ? fallback : trimmed;
}

} // namespace

DesktopContext ContextCollector::collect() const {
  DesktopContext context;
  context.collectedAt =
      QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));
  context.userName = qEnvironmentVariable("USER", QStringLiteral("unknown"));
  context.hostName = QSysInfo::machineHostName();
  context.sessionType = qEnvironmentVariable("XDG_SESSION_TYPE", QStringLiteral("unknown"));
  context.clipboardText =
      clean(QApplication::clipboard() ? QApplication::clipboard()->text() : QString());

  const QString activeWindowId = readActiveWindowId(context.sessionType);
  context.activeWindowTitle =
      readActiveWindowTitle(activeWindowId, context.sessionType);
  context.activeWindowClass =
      readActiveWindowClass(activeWindowId, context.sessionType);

  if (context.clipboardText.isEmpty()) {
    context.notes << QStringLiteral("剪贴板当前为空，邮件整理会更多依赖手工输入。");
  } else if (context.clipboardText.size() > 1200) {
    context.notes << QStringLiteral("剪贴板内容较长，草稿只会抓取前几段重点。");
  }

  if (context.activeWindowTitle.contains(QStringLiteral("暂不直接读取"))) {
    context.notes << QStringLiteral("当前会话没有稳定拿到活动窗口标题，先用剪贴板和手工意图整理邮件。");
  }

  return context;
}

QString ContextCollector::readActiveWindowId(const QString &sessionType) const {
  if (sessionType != QStringLiteral("x11")) {
    return {};
  }

  const auto result = CommandRunner::shell(
      QStringLiteral("xprop -root _NET_ACTIVE_WINDOW 2>/dev/null"));
  const QRegularExpression pattern(QStringLiteral("0x[0-9a-fA-F]+"));
  const auto match = pattern.match(result.output);
  return match.hasMatch() ? match.captured(0) : QString();
}

QString ContextCollector::readActiveWindowTitle(const QString &windowId,
                                                const QString &sessionType) const {
  if (sessionType != QStringLiteral("x11")) {
    return QStringLiteral("当前是 %1 会话，暂不直接读取活动窗口标题。")
        .arg(sessionType);
  }

  if (windowId.isEmpty()) {
    return QStringLiteral("当前没有拿到活动窗口标题。");
  }

  const auto result = CommandRunner::shell(
      QStringLiteral("xprop -id %1 _NET_WM_NAME WM_NAME 2>/dev/null").arg(windowId));
  return fallbackText(captureFirstQuotedValue(result.output),
                      QStringLiteral("当前没有拿到活动窗口标题。"));
}

QString ContextCollector::readActiveWindowClass(const QString &windowId,
                                                const QString &sessionType) const {
  if (sessionType != QStringLiteral("x11") || windowId.isEmpty()) {
    return QStringLiteral("unknown");
  }

  const auto result = CommandRunner::shell(
      QStringLiteral("xprop -id %1 WM_CLASS 2>/dev/null").arg(windowId));
  QString value = captureFirstQuotedValue(result.output);
  if (!value.isEmpty()) {
    return value;
  }

  return QStringLiteral("unknown");
}
