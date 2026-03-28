#include "CommandRunner.h"

#include <QProcess>

CommandResult CommandRunner::run(const QString &program,
                                 const QStringList &arguments,
                                 int timeoutMs) {
  CommandResult result;
  QProcess process;
  process.setProgram(program);
  process.setArguments(arguments);
  process.start();

  if (!process.waitForStarted(1500)) {
    result.errorOutput = process.errorString();
    return result;
  }

  result.started = true;

  if (!process.waitForFinished(timeoutMs)) {
    result.timedOut = true;
    process.kill();
    process.waitForFinished(1000);
  }

  result.exitCode = process.exitCode();
  result.output = QString::fromLocal8Bit(process.readAllStandardOutput()).trimmed();
  result.errorOutput =
      QString::fromLocal8Bit(process.readAllStandardError()).trimmed();
  return result;
}

CommandResult CommandRunner::shell(const QString &command, int timeoutMs) {
  return run(QStringLiteral("/bin/sh"),
             {QStringLiteral("-lc"), command},
             timeoutMs);
}
