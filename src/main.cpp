#include "FloatingLauncher.h"
#include "MainWindow.h"

#include <QApplication>
#include <QDir>
#include <QFileInfo>
#include <QStandardPaths>

namespace {

QString sourceRoot() {
  const QString path = QStringLiteral(ORBIT_SOURCE_DIR);
  return QFileInfo::exists(path) ? path : QDir::currentPath();
}

QString artifactsDir() {
  const QString root = sourceRoot();
  QDir dir(root);
  dir.mkpath(QStringLiteral("artifacts"));
  return dir.filePath(QStringLiteral("artifacts"));
}

} // namespace

int main(int argc, char *argv[]) {
  QApplication app(argc, argv);
  QApplication::setApplicationName(QStringLiteral("Orbit Deepin Assistant"));
  QApplication::setOrganizationName(QStringLiteral("guanzi008"));
  QApplication::setStyle(QStringLiteral("Fusion"));

  MainWindow window(artifactsDir());
  FloatingLauncher launcher;

  QObject::connect(&launcher, &FloatingLauncher::activated, &window, [&window]() {
    window.toggleVisibilityFromLauncher();
  });
  QObject::connect(&launcher, &FloatingLauncher::exitRequested, &app, &QApplication::quit);
  QObject::connect(&window, &MainWindow::exitRequested, &app, &QApplication::quit);

  launcher.anchorToPrimaryScreen();
  launcher.show();
  window.show();

  return app.exec();
}
