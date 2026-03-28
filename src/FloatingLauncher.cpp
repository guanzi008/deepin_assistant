#include "FloatingLauncher.h"

#include <algorithm>
#include <cmath>
#include <QContextMenuEvent>
#include <QFontMetrics>
#include <QGuiApplication>
#include <QMenu>
#include <QMouseEvent>
#include <QMoveEvent>
#include <QPaintEvent>
#include <QPainter>
#include <QPainterPath>
#include <QScreen>

class DockBubble : public QWidget {
public:
  explicit DockBubble(QWidget *parent = nullptr) : QWidget(parent) {
    setAttribute(Qt::WA_TransparentForMouseEvents);
    setAttribute(Qt::WA_ShowWithoutActivating);
    setAttribute(Qt::WA_TranslucentBackground);
    setWindowFlag(Qt::ToolTip, true);
    setWindowFlag(Qt::FramelessWindowHint, true);
    setWindowFlag(Qt::NoDropShadowWindowHint, true);
    setContentsMargins(0, 0, 0, 0);
  }

  void setTailOnLeft(bool onLeft) {
    if (m_tailOnLeft == onLeft) {
      return;
    }

    m_tailOnLeft = onLeft;
    update();
  }

  void setContent(const QString &title, const QString &body, const QString &footer) {
    if (m_title == title && m_body == body && m_footer == footer) {
      return;
    }

    m_title = title;
    m_body = body;
    m_footer = footer;
    updateBubbleSize();
    update();
  }

private:
  void updateBubbleSize() {
    QFont titleFont = font();
    titleFont.setBold(true);
    titleFont.setPointSizeF(titleFont.pointSizeF() + 0.9);

    QFont bodyFont = font();
    bodyFont.setPointSizeF(bodyFont.pointSizeF() + 0.4);

    QFont footerFont = font();
    footerFont.setPointSizeF(footerFont.pointSizeF() - 0.2);

    const int innerWidth = 226;
    const int leftPadding = 18;
    const int rightPadding = 18;
    const int topPadding = 16;
    const int tailPadding = 14;
    const int spacing = 8;

    const QFontMetrics titleMetrics(titleFont);
    const QFontMetrics bodyMetrics(bodyFont);
    const QFontMetrics footerMetrics(footerFont);

    const QRect titleRect = titleMetrics.boundingRect(m_title);
    const QRect bodyRect = bodyMetrics.boundingRect(
        QRect(0, 0, innerWidth, 400), Qt::TextWordWrap, m_body);
    const QRect footerRect = footerMetrics.boundingRect(
        QRect(0, 0, innerWidth, 200), Qt::TextWordWrap, m_footer);

    const int width = leftPadding + innerWidth + rightPadding + tailPadding;
    const int height = topPadding + titleRect.height() + spacing + bodyRect.height() +
                       spacing + footerRect.height() + 18;
    setFixedSize(width, height);
  }

  void paintEvent(QPaintEvent *) override {
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::TextAntialiasing);

    const QColor shadowColor(0, 0, 0, 126);
    QRectF shadowRect = rect().adjusted(8, 10, -8, -8);
    shadowRect.translate(0, 6);

    QPainterPath shadowPath;
    shadowPath.addRoundedRect(shadowRect, 20, 20);
    painter.fillPath(shadowPath, shadowColor);

    const int tailWidth = 14;
    const int topInset = 8;
    const int bottomInset = 8;
    const int leftInset = m_tailOnLeft ? 18 : 10;
    const int rightInset = m_tailOnLeft ? 10 : 18;

    QRectF bubbleRect = rect().adjusted(leftInset, topInset, -rightInset, -bottomInset);
    const qreal radius = 20.0;

    QPainterPath bubblePath;
    bubblePath.addRoundedRect(bubbleRect, radius, radius);

    QPolygonF tail;
    if (m_tailOnLeft) {
      const qreal tailY = bubbleRect.center().y();
      tail << QPointF(bubbleRect.left(), tailY - 8)
           << QPointF(bubbleRect.left() - tailWidth, tailY)
           << QPointF(bubbleRect.left(), tailY + 8);
    } else {
      const qreal tailY = bubbleRect.center().y();
      tail << QPointF(bubbleRect.right(), tailY - 8)
           << QPointF(bubbleRect.right() + tailWidth, tailY)
           << QPointF(bubbleRect.right(), tailY + 8);
    }
    bubblePath.addPolygon(tail);

    const QColor baseTop(15, 26, 44, 238);
    const QColor baseBottom(7, 13, 24, 242);
    QLinearGradient fillGradient(bubbleRect.topLeft(), bubbleRect.bottomRight());
    fillGradient.setColorAt(0.0, baseTop);
    fillGradient.setColorAt(1.0, baseBottom);
    painter.fillPath(bubblePath, fillGradient);

    QPen borderPen(QColor(255, 255, 255, 32), 1.1);
    painter.setPen(borderPen);
    painter.drawPath(bubblePath);

    const QColor accent(115, 245, 255, 170);
    painter.setPen(QPen(QColor(255, 255, 255, 38), 1.0));
    painter.drawLine(QPointF(bubbleRect.left() + 18, bubbleRect.top() + 28),
                     QPointF(bubbleRect.right() - 18, bubbleRect.top() + 28));
    painter.setPen(QPen(accent, 2.0));
    painter.drawLine(QPointF(bubbleRect.left() + 18, bubbleRect.top() + 28),
                     QPointF(bubbleRect.left() + 82, bubbleRect.top() + 28));

    QFont titleFont = font();
    titleFont.setBold(true);
    titleFont.setPointSizeF(titleFont.pointSizeF() + 0.9);

    QFont bodyFont = font();
    bodyFont.setPointSizeF(bodyFont.pointSizeF() + 0.4);

    QFont footerFont = font();
    footerFont.setPointSizeF(footerFont.pointSizeF() - 0.2);

    const QColor titleColor(240, 249, 255);
    const QColor bodyColor(204, 225, 241);
    const QColor footerColor(145, 166, 186);

    QRectF contentRect = bubbleRect.adjusted(18, 18, -18, -16);
    painter.setFont(titleFont);
    painter.setPen(titleColor);
    painter.drawText(contentRect.left(), contentRect.top() + 18, m_title);

    painter.setFont(bodyFont);
    painter.setPen(bodyColor);
    const QRectF bodyRect = QRectF(contentRect.left(), contentRect.top() + 32,
                                   contentRect.width(), contentRect.height());
    painter.drawText(bodyRect, Qt::TextWordWrap | Qt::AlignTop, m_body);

    painter.setFont(footerFont);
    painter.setPen(footerColor);
    const QRectF footerRect = QRectF(contentRect.left(),
                                     contentRect.bottom() - 24,
                                     contentRect.width(), 18);
    painter.drawText(footerRect, Qt::AlignLeft | Qt::AlignVCenter, m_footer);
  }

  QString m_title;
  QString m_body;
  QString m_footer;
  bool m_tailOnLeft = true;
};

FloatingLauncher::FloatingLauncher(QWidget *parent) : QWidget(parent), m_bubble(new DockBubble(this)) {
  setFixedSize(84, 84);
  setWindowFlags(Qt::FramelessWindowHint | Qt::Tool | Qt::WindowStaysOnTopHint);
  setAttribute(Qt::WA_TranslucentBackground);
  setAttribute(Qt::WA_Hover, true);
  setMouseTracking(true);
  setToolTip(QStringLiteral("左键打开主面板，拖动可移动，右键更多操作"));
  setCursor(Qt::PointingHandCursor);

  m_animTimer.setInterval(16);
  m_animTimer.setTimerType(Qt::PreciseTimer);
  connect(&m_animTimer, &QTimer::timeout, this, [this]() {
    if (m_clickFlash > 0.0) {
      m_clickFlash = std::max<qreal>(0.0, m_clickFlash - 0.1);
    }

    ++m_animTick;
    update();
    updateBubble();

    const bool keepAnimating = m_hovered || m_dragging || m_pressed ||
                               m_clickFlash > 0.0 || (m_bubble && m_bubble->isVisible());
    if (!keepAnimating) {
      m_animTimer.stop();
    }
  });

  m_bubbleTimer.setSingleShot(true);
  connect(&m_bubbleTimer, &QTimer::timeout, this, [this]() {
    updateBubble();
  });

  if (m_bubble) {
    m_bubble->hide();
  }
}

void FloatingLauncher::anchorToPrimaryScreen() {
  if (!QGuiApplication::primaryScreen()) {
    return;
  }

  const QRect workArea = QGuiApplication::primaryScreen()->availableGeometry();
  const int x = workArea.x() + workArea.width() - width() - 18;
  const int y = workArea.y() + (workArea.height() - height()) / 2;
  move(x, y);
  positionBubble();
}

void FloatingLauncher::paintEvent(QPaintEvent *) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::TextAntialiasing);

  const QRectF outerRect = rect().adjusted(4, 4, -4, -4);
  const QRectF innerRect = rect().adjusted(9, 9, -9, -9);
  const qreal pulse = 0.5 + 0.5 * std::sin((m_animTick % 360) * 3.14159265358979323846 / 180.0);

  painter.setPen(Qt::NoPen);
  painter.setBrush(QColor(0, 0, 0, m_hovered || m_dragging ? 92 : 60));
  painter.drawEllipse(outerRect.translated(0, 3));

  QColor glowColor = m_dragging ? QColor(255, 181, 94, 130)
                                : m_hovered ? QColor(115, 245, 255, 120)
                                            : QColor(115, 245, 255, 72);
  glowColor.setAlphaF(glowColor.alphaF() * (0.7 + 0.3 * pulse));
  painter.setBrush(glowColor);
  painter.drawEllipse(outerRect.adjusted(-2, -2, 2, 2));

  QPainterPath capsule;
  capsule.addRoundedRect(innerRect, 26, 26);

  QLinearGradient fillGradient(innerRect.topLeft(), innerRect.bottomRight());
  fillGradient.setColorAt(0.0, QColor(24, 45, 78));
  fillGradient.setColorAt(0.55, QColor(11, 28, 48));
  fillGradient.setColorAt(1.0, QColor(6, 16, 29));
  painter.fillPath(capsule, fillGradient);

  QPen borderPen(QColor(255, 255, 255, m_hovered ? 96 : 60), 1.1);
  painter.setPen(borderPen);
  painter.drawPath(capsule);

  const qreal orbitRadius = innerRect.width() * 0.22;
  const QPointF center = innerRect.center();
  const qreal orbitAngle = (m_animTick % 360) * 3.14159265358979323846 / 180.0;
  const QPointF orbitCenter(center.x() + std::cos(orbitAngle) * 2.0,
                            center.y() - std::sin(orbitAngle) * 1.5);

  QRadialGradient planet(orbitCenter, innerRect.width() * 0.62);
  planet.setColorAt(0.0, QColor(127, 247, 255));
  planet.setColorAt(0.48, QColor(41, 137, 255));
  planet.setColorAt(1.0, QColor(6, 20, 42));
  painter.setBrush(planet);
  painter.setPen(Qt::NoPen);
  painter.drawEllipse(center, orbitRadius, orbitRadius);

  const QRectF ringRect = QRectF(center.x() - orbitRadius * 1.32,
                                 center.y() - orbitRadius * 0.54,
                                 orbitRadius * 2.64, orbitRadius * 1.08);
  painter.setBrush(Qt::NoBrush);
  painter.setPen(QPen(QColor(139, 255, 222, m_hovered ? 220 : 170), 2.2));
  painter.drawArc(ringRect, 18 * 16, 140 * 16);

  painter.setPen(QPen(QColor(235, 248, 255), 1.1));
  painter.setFont(font());
  painter.drawText(rect(), Qt::AlignCenter, QStringLiteral("O"));

  const QPointF statusCenter(innerRect.right() - 15, innerRect.top() + 15);
  QColor statusColor = m_dragging ? QColor(255, 181, 94) : m_hovered ? QColor(115, 245, 255)
                                                                     : QColor(110, 245, 168);
  painter.setBrush(statusColor);
  painter.setPen(QPen(QColor(255, 255, 255, 120), 1.0));
  painter.drawEllipse(statusCenter, 5.5, 5.5);

  if (m_pressed || m_clickFlash > 0.0) {
    const qreal flash = 6.0 + (1.0 - m_clickFlash) * 14.0;
    QColor flashColor = QColor(115, 245, 255);
    flashColor.setAlphaF(std::max<qreal>(0.0, m_clickFlash));
    painter.setPen(QPen(flashColor, 2.0));
    painter.setBrush(Qt::NoBrush);
    painter.drawEllipse(innerRect.adjusted(-flash, -flash, flash, flash));
  }

  if (m_dragging) {
    painter.setPen(QPen(QColor(255, 181, 94, 120), 1.0));
    painter.setBrush(QColor(255, 181, 94, 24));
    painter.drawRoundedRect(innerRect.adjusted(8, 10, -8, -10), 14, 14);
  }
}

void FloatingLauncher::mousePressEvent(QMouseEvent *event) {
  if (event->button() == Qt::LeftButton) {
    m_pressed = true;
    m_dragging = true;
    m_dragOffset = event->globalPos() - frameGeometry().topLeft();
    m_pressGlobalPos = event->globalPos();
    m_clickFlash = 1.0;
    updateAnimationState();
    updateBubble();
    event->accept();
    return;
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
    positionBubble();
    update();
    updateBubble();
    event->accept();
    return;
  }

  QWidget::mouseMoveEvent(event);
}

void FloatingLauncher::mouseReleaseEvent(QMouseEvent *event) {
  if (event->button() == Qt::LeftButton) {
    const int travel = (event->globalPos() - m_pressGlobalPos).manhattanLength();
    const bool wasDragging = m_dragging;
    m_pressed = false;
    m_dragging = false;

    if (wasDragging && travel < 6) {
      emit activated();
      event->accept();
    }

    m_clickFlash = 1.0;
    updateAnimationState();
    updateBubble();
    update();
    return;
  }

  QWidget::mouseReleaseEvent(event);
}

void FloatingLauncher::enterEvent(QEvent *event) {
  m_hovered = true;
  update();
  updateAnimationState();

  if (!m_dragging) {
    m_bubbleTimer.start(180);
  } else {
    updateBubble();
  }

  QWidget::enterEvent(event);
}

void FloatingLauncher::leaveEvent(QEvent *event) {
  m_hovered = false;
  m_pressed = false;
  m_bubbleTimer.stop();
  if (m_bubble) {
    m_bubble->hide();
  }
  update();
  updateAnimationState();
  QWidget::leaveEvent(event);
}

void FloatingLauncher::contextMenuEvent(QContextMenuEvent *event) {
  m_bubbleTimer.stop();
  if (m_bubble) {
    m_bubble->hide();
  }

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

void FloatingLauncher::moveEvent(QMoveEvent *event) {
  QWidget::moveEvent(event);
  positionBubble();
}

void FloatingLauncher::updateBubble() {
  if (!m_bubble) {
    return;
  }

  if (!(m_hovered || m_dragging || m_pressed)) {
    m_bubble->hide();
    return;
  }

  m_bubble->setTailOnLeft(true);
  m_bubble->setContent(hoverTitle(), hoverBody(), hoverFooter());
  positionBubble();
  m_bubble->raise();
  m_bubble->show();
}

void FloatingLauncher::positionBubble() {
  if (!m_bubble || !m_bubble->isVisible()) {
    return;
  }

  QScreen *screen = QGuiApplication::screenAt(mapToGlobal(rect().center()));
  if (!screen) {
    screen = QGuiApplication::primaryScreen();
  }

  if (!screen) {
    return;
  }

  const QRect avail = screen->availableGeometry();
  const QSize bubbleSize = m_bubble->size();
  const QPoint widgetCenter = mapToGlobal(rect().center());
  const int gap = 14;

  bool tailOnLeft = true;
  int x = frameGeometry().right() + gap;
  if (x + bubbleSize.width() > avail.right() - 12) {
    tailOnLeft = false;
    x = frameGeometry().left() - gap - bubbleSize.width();
  }

  int y = widgetCenter.y() - bubbleSize.height() / 2;
  y = std::max(avail.top() + 12, std::min(y, avail.bottom() - bubbleSize.height() - 12));
  x = std::max(avail.left() + 12, std::min(x, avail.right() - bubbleSize.width() - 12));

  m_bubble->setTailOnLeft(tailOnLeft);
  m_bubble->move(x, y);
}

void FloatingLauncher::updateAnimationState() {
  const bool keepRunning = m_hovered || m_dragging || m_pressed || m_clickFlash > 0.0;
  if (keepRunning && !m_animTimer.isActive()) {
    m_animTimer.start();
    return;
  }

  if (!keepRunning && m_animTimer.isActive()) {
    m_animTimer.stop();
  }
}

QString FloatingLauncher::hoverTitle() const {
  if (m_dragging) {
    return QStringLiteral("Orbit Deepin Assistant");
  }

  return QStringLiteral("桌面助手入口");
}

QString FloatingLauncher::hoverBody() const {
  if (m_dragging) {
    return QStringLiteral("正在拖动，松开后会保持当前位置。");
  }

  if (m_hovered) {
    return QStringLiteral("左键打开主面板，右键查看更多操作。");
  }

  return QStringLiteral("这是常驻的桌面入口。");
}

QString FloatingLauncher::hoverFooter() const {
  return QStringLiteral("可拖动 · 右键菜单 · 保持悬浮");
}
