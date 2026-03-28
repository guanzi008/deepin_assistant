#pragma once

#include <QString>
#include <QStringList>

struct DesktopContext {
  QString collectedAt;
  QString userName;
  QString hostName;
  QString sessionType;
  QString activeWindowTitle;
  QString activeWindowClass;
  QString clipboardText;
  QStringList notes;
};

class ContextCollector {
public:
  DesktopContext collect() const;

private:
  QString readActiveWindowId(const QString &sessionType) const;
  QString readActiveWindowTitle(const QString &windowId,
                                const QString &sessionType) const;
  QString readActiveWindowClass(const QString &windowId,
                                const QString &sessionType) const;
};
