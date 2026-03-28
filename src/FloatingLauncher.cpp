#include "FloatingLauncher.h"

#include <QGuiApplication>
#include <QContextMenuEvent>
#include <QMenu>
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QScreen>

FloatingLauncher::FloatingLauncher(QWidget *parent) : QWidget(parent) {
  setFixedSize(72, 72);
  setWindowFlags(Qt::FramelessWindowHint | Qt::Tool | Qt::WindowStaysOnTopHint);
  setAttribute(Qt::WA_TranslucentBackground);
  setToolTip(QStringLiteral("打开 Orbit Deepin Assistant"));
}

void FloatingLauncher::anchorToPrimaryScreen() {
  if (!QGuiApplication::primaryScreen()) {
    return;
  }

  const QRect workArea = QGuiApplication::primaryScreen()->availableGeometry();
  const int x = workArea.x() + workArea.width() - width() - 18;
  const int y = workArea.y() + (workArea.height() - height()) / 2;
  move(x, y);
}

void FloatingLauncher::paintEvent(QPaintEvent *) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);

  QRectF circle = rect().adjusted(8, 8, -8, -8);

  painter.setPen(Qt::NoPen);
  painter.setBrush(QColor(5, 15, 28, 90));
  painter.drawEllipse(circle.translated(0, 3));

  QRadialGradient planet(circle.center() - QPointF(circle.width() * 0.18, circle.height() * 0.18),
                         circle.width() * 0.7);
  planet.setColorAt(0.0, QColor(112, 245, 255));
  planet.setColorAt(0.42, QColor(18, 118, 255));
  planet.setColorAt(1.0, QColor(4, 27, 56));
  painter.setBrush(planet);
  painter.drawEllipse(circle);

  painter.setPen(QPen(QColor(153, 255, 220, m_hovered ? 230 : 175), 3));
  painter.drawArc(circle.adjusted(-6, 10, 6, -10), 25 * 16, 130 * 16);

  QPainterPath spot;
  spot.addEllipse(circle.center().x() - 15, circle.center().y() - 4, 16, 10);
  spot.addEllipse(circle.center().x() - 2, circle.center().y() + 8, 12, 8);
  painter.fillPath(spot, QColor(115, 255, 170, m_hovered ? 170 : 120));

  painter.setPen(QPen(QColor(235, 248, 255), 1.2));
  painter.drawText(rect(), Qt::AlignCenter, QStringLiteral("轨"));
}

void FloatingLauncher::mousePressEvent(QMouseEvent *event) {
  if (event->button() == Qt::LeftButton) {
    m_dragging = true;
    m_dragOffset = event->globalPos() - frameGeometry().topLeft();
    m_pressGlobalPos = event->globalPos();
  }

  if (event->button() == Qt::RightButton) {
    event->accept();
    return;
  }

  QWidget::mousePressEvent(event);
}

void FloatingLauncher::mouseMoveEvent(QMouseEvent *event) {
  if (m_dragging && (event->buttons() & Qt::LeftButton)) {
    move(event->globalPos() - m_dragOffset);
    event->accept();
    return;
  }

  QWidget::mouseMoveEvent(event);
}

void FloatingLauncher::mouseReleaseEvent(QMouseEvent *event) {
  if (event->button() == Qt::LeftButton) {
    const int travel = (event->globalPos() - m_pressGlobalPos).manhattanLength();
    const bool wasDragging = m_dragging;
    m_dragging = false;
    if (wasDragging && travel < 6) {
      emit activated();
      event->accept();
      return;
    }
  }

  QWidget::mouseReleaseEvent(event);
}

void FloatingLauncher::enterEvent(QEvent *event) {
  m_hovered = true;
  update();
  QWidget::enterEvent(event);
}

void FloatingLauncher::leaveEvent(QEvent *event) {
  m_hovered = false;
  update();
  QWidget::leaveEvent(event);
}

void FloatingLauncher::contextMenuEvent(QContextMenuEvent *event) {
  QMenu menu(this);
  auto *toggleAction = menu.addAction(QStringLiteral("显示 / 隐藏主面板"));
  auto *dockAction = menu.addAction(QStringLiteral("回到右侧停靠位"));
  menu.addSeparator();
  auto *quitAction = menu.addAction(QStringLiteral("退出助手"));

  QAction *selected = menu.exec(event->globalPos());
  if (selected == toggleAction) {
    emit activated();
    return;
  }

  if (selected == dockAction) {
    anchorToPrimaryScreen();
    return;
  }

  if (selected == quitAction) {
    emit exitRequested();
  }
}
