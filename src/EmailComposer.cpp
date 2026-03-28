#include "EmailComposer.h"

#include <QDate>
#include <QRegularExpression>

namespace {

QString joinOrFallback(const QStringList &items, const QString &fallback) {
  QStringList compact;
  for (const auto &item : items) {
    const QString trimmed = item.trimmed();
    if (!trimmed.isEmpty()) {
      compact << trimmed;
    }
  }

  compact.removeDuplicates();
  return compact.isEmpty() ? fallback : compact.join(QStringLiteral("; "));
}

QStringList firstUsefulLines(const QString &text, int maxLines = 4) {
  QStringList lines;
  for (const auto &rawLine : text.split('\n', Qt::SkipEmptyParts)) {
    const QString line = rawLine.trimmed();
    if (line.isEmpty()) {
      continue;
    }
    lines << line;
    if (lines.size() >= maxLines) {
      break;
    }
  }
  return lines;
}

} // namespace

QStringList EmailComposer::extractEmails(const QString &text) const {
  QStringList emails;
  const QRegularExpression pattern(
      QStringLiteral(R"(([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))"));
  auto iterator = pattern.globalMatch(text);
  while (iterator.hasNext()) {
    emails << iterator.next().captured(1);
  }
  emails.removeDuplicates();
  return emails;
}

QStringList EmailComposer::summarizeClipboard(const QString &clipboardText) const {
  return firstUsefulLines(clipboardText, 5);
}

QString EmailComposer::inferSubject(const QString &intent,
                                    const DesktopContext &context,
                                    const AnalysisResult &analysis,
                                    const QStringList &clipboardSummary) const {
  const QString cleanedIntent = intent.trimmed();
  if (!cleanedIntent.isEmpty()) {
    return QStringLiteral("【需确认】%1").arg(cleanedIntent);
  }

  if (!clipboardSummary.isEmpty()) {
    return QStringLiteral("【整理草稿】%1").arg(clipboardSummary.first().left(36));
  }

  if (!context.activeWindowTitle.isEmpty() &&
      !context.activeWindowTitle.contains(QStringLiteral("暂不直接读取"))) {
    return QStringLiteral("【窗口内容整理】%1").arg(context.activeWindowTitle.left(36));
  }

  if (!analysis.title.isEmpty()) {
    return QStringLiteral("【情况说明】%1").arg(analysis.title);
  }

  return QStringLiteral("【待确认】邮件草稿 %1")
      .arg(QDate::currentDate().toString(QStringLiteral("MM-dd")));
}

EmailDraft EmailComposer::compose(const QString &intent,
                                  const DesktopContext &context,
                                  const DiagnosticSnapshot &snapshot,
                                  const AnalysisResult &analysis) const {
  EmailDraft draft;
  const QString combinedSource =
      intent + QStringLiteral("\n") + context.clipboardText;
  const QStringList detectedEmails = extractEmails(combinedSource);
  const QStringList clipboardSummary = summarizeClipboard(context.clipboardText);
  draft.recipients = joinOrFallback(detectedEmails, QStringLiteral("（待填写）"));
  draft.cc = QStringLiteral("（按需补充）");
  draft.subject = inferSubject(intent, context, analysis, clipboardSummary);

  QStringList topics;
  if (!clipboardSummary.isEmpty()) {
    topics << clipboardSummary;
  }
  if (!analysis.title.isEmpty()) {
    topics << analysis.title;
  }
  topics.removeDuplicates();
  draft.extractedTopics = topics;

  QStringList body;
  body << QStringLiteral("各位好，")
       << QString()
       << QStringLiteral("我先根据当前桌面上下文整理一版邮件草稿，便于后续直接补充和发送。")
       << QString()
       << QStringLiteral("【当前事项】")
       << QStringLiteral("%1").arg(intent.trimmed().isEmpty() ? analysis.summary
                                                             : intent.trimmed())
       << QString()
       << QStringLiteral("【上下文】")
       << QStringLiteral("- 活动窗口：%1").arg(context.activeWindowTitle)
       << QStringLiteral("- 会话环境：%1 / %2@%3")
              .arg(context.sessionType, context.userName, context.hostName)
       << QStringLiteral("- 系统：%1").arg(snapshot.distroName)
       << QString();

  if (!clipboardSummary.isEmpty()) {
    body << QStringLiteral("【剪贴板关键信息】");
    for (const auto &line : clipboardSummary) {
      body << QStringLiteral("- %1").arg(line);
    }
    body << QString();
  }

  if (!analysis.stages.isEmpty()) {
    body << QStringLiteral("【建议下一步】");
    for (int index = 0; index < analysis.stages.size(); ++index) {
      body << QStringLiteral("%1. %2").arg(index + 1).arg(analysis.stages.at(index));
    }
    body << QString();
  }

  body << QStringLiteral("如无问题，我再继续补充附件、收件人和正式措辞。")
       << QString()
       << QStringLiteral("谢谢。");

  draft.body = body.join(QStringLiteral("\n"));

  QStringList rationale;
  rationale << QStringLiteral("收件人建议来自剪贴板和当前输入里识别到的邮箱地址。");
  if (detectedEmails.isEmpty()) {
    rationale << QStringLiteral("当前没有识别到明确邮箱地址，先保留为待填写。");
  }
  rationale << QStringLiteral("标题优先参考手工意图，其次使用剪贴板或当前窗口内容。");
  rationale << QStringLiteral("正文会把当前系统和窗口上下文一起带进去，适合先发进展同步或问题说明。");
  draft.rationale = rationale.join(QStringLiteral("\n"));

  return draft;
}
