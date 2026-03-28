#pragma once

#include <QString>
#include <QStringList>

struct CommandResult {
  bool started = false;
  bool timedOut = false;
  int exitCode = -1;
  QString output;
  QString errorOutput;
};

class CommandRunner {
public:
  static CommandResult run(const QString &program,
                           const QStringList &arguments = {},
                           int timeoutMs = 4000);
  static CommandResult shell(const QString &command, int timeoutMs = 4000);
};
