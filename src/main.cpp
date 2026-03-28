#include "FloatingLauncher.h"
#include "MainWindow.h"

#include <QApplication>
#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QIcon>
#include <QStandardPaths>

namespace {

QString sourceRoot() {
  const QString path = QStringLiteral(ORBIT_SOURCE_DIR);
  return QFileInfo::exists(path) ? path : QDir::currentPath();
}

QString artifactsDir() {
  const QString root = sourceRoot();
  const QString binaryPath = QCoreApplication::applicationFilePath();
  if (!binaryPath.isEmpty() && QFileInfo(binaryPath).absolutePath().startsWith(root)) {
    QDir dir(root);
    dir.mkpath(QStringLiteral("artifacts"));
    return dir.filePath(QStringLiteral("artifacts"));
  }

  QString appDataRoot =
      QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
  if (appDataRoot.isEmpty()) {
    appDataRoot = QDir::homePath() + QStringLiteral("/.local/share/orbit-deepin-assistant");
  }

  QDir dir(appDataRoot);
  dir.mkpath(QStringLiteral("artifacts"));
  return dir.filePath(QStringLiteral("artifacts"));
}

} // namespace

int main(int argc, char *argv[]) {
  QApplication app(argc, argv);
  QApplication::setApplicationName(QStringLiteral("Orbit Deepin Assistant"));
  QApplication::setOrganizationName(QStringLiteral("guanzi008"));
  QApplication::setDesktopFileName(QStringLiteral("orbit-deepin-assistant"));
  QApplication::setStyle(QStringLiteral("Fusion"));
  QApplication::setWindowIcon(QIcon(QStringLiteral(":/icons/orbit-deepin-assistant.svg")));

  MainWindow window(artifactsDir());
  FloatingLauncher launcher;

  QObject::connect(&launcher, &FloatingLauncher::activated, &window, [&window]() {
    window.toggleVisibilityFromLauncher();
  });
  QObject::connect(&launcher, &FloatingLauncher::exitRequested, &app, &QApplication::quit);
  QObject::connect(&window, &MainWindow::exitRequested, &app, &QApplication::quit);

  launcher.anchorToPrimaryScreen();
  launcher.show();

  return app.exec();
}
