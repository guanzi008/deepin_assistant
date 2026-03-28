#pragma once

#include "ContextCollector.h"
#include "DiagnosticsService.h"

#include <QString>
#include <QStringList>

struct EmailDraft {
  QString recipients;
  QString cc;
  QString subject;
  QString body;
  QString rationale;
  QStringList extractedTopics;
};

class EmailComposer {
public:
  EmailDraft compose(const QString &intent,
                     const DesktopContext &context,
                     const DiagnosticSnapshot &snapshot,
                     const AnalysisResult &analysis) const;

private:
  QStringList extractEmails(const QString &text) const;
  QStringList summarizeClipboard(const QString &clipboardText) const;
  QString inferSubject(const QString &intent,
                       const DesktopContext &context,
                       const AnalysisResult &analysis,
                       const QStringList &clipboardSummary) const;
};
