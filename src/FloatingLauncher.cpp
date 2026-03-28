#include "FloatingLauncher.h"

#include <algorithm>
#include <cmath>
#include <QApplication>
#include <QContextMenuEvent>
#include <QFontMetrics>
#include <QGuiApplication>
#include <QIcon>
#include <QMenu>
#include <QMouseEvent>
#include <QMoveEvent>
#include <QPaintEvent>
#include <QPainter>
#include <QPainterPath>
#include <QScreen>

namespace {
constexpr int kBubbleShowDelayMs = 180;
constexpr int kBubbleHideDelayMs = 220;
constexpr int kEdgeSnapThreshold = 28;
constexpr int kEdgeSnapMargin = 8;
}  // namespace

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
    titleFont.setPointSizeF(titleFont.pointSizeF() + 0.5);

    QFont bodyFont = font();
    bodyFont.setPointSizeF(bodyFont.pointSizeF() + 0.1);

    QFont footerFont = font();
    footerFont.setPointSizeF(footerFont.pointSizeF() - 0.4);

    const int innerWidth = 186;
    const int leftPadding = 16;
    const int rightPadding = 16;
    const int topPadding = 14;
    const int tailPadding = 12;
    const int spacing = 6;

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
                       spacing + footerRect.height() + 14;
    setFixedSize(width, height);
  }

  void paintEvent(QPaintEvent *) override {
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::TextAntialiasing);

    const int tailWidth = 14;
    const int topInset = 10;
    const int bottomInset = 10;
    const int leftInset = m_tailOnLeft ? 16 : 10;
    const int rightInset = m_tailOnLeft ? 10 : 16;

    QRectF bubbleRect = rect().adjusted(leftInset, topInset, -rightInset, -bottomInset);
    const qreal radius = 16.0;

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

    const QColor baseTop(12, 19, 31, 244);
    const QColor baseBottom(8, 14, 24, 246);
    QLinearGradient fillGradient(bubbleRect.topLeft(), bubbleRect.bottomRight());
    fillGradient.setColorAt(0.0, baseTop);
    fillGradient.setColorAt(1.0, baseBottom);
    painter.fillPath(bubblePath, fillGradient);

    QPen borderPen(QColor(255, 255, 255, 32), 1.1);
    painter.setPen(borderPen);
    painter.drawPath(bubblePath);

    QFont titleFont = font();
    titleFont.setBold(true);
    titleFont.setPointSizeF(titleFont.pointSizeF() + 0.4);

    QFont bodyFont = font();
    bodyFont.setPointSizeF(bodyFont.pointSizeF() + 0.1);

    QFont footerFont = font();
    footerFont.setPointSizeF(footerFont.pointSizeF() - 0.4);

    const QColor titleColor(240, 249, 255);
    const QColor bodyColor(204, 225, 241);
    const QColor footerColor(145, 166, 186);

    QRectF contentRect = bubbleRect.adjusted(16, 14, -16, -14);
    painter.setFont(titleFont);
    painter.setPen(titleColor);
    painter.drawText(contentRect.left(), contentRect.top() + 16, m_title);

    painter.setFont(bodyFont);
    painter.setPen(bodyColor);
    const QRectF bodyRect = QRectF(contentRect.left(), contentRect.top() + 32,
                                   contentRect.width(), contentRect.height());
    painter.drawText(bodyRect, Qt::TextWordWrap | Qt::AlignTop, m_body);

    painter.setFont(footerFont);
    painter.setPen(footerColor);
    const QRectF footerRect = QRectF(contentRect.left(),
                                     contentRect.bottom() - 20,
                                     contentRect.width(), 18);
    painter.drawText(footerRect, Qt::AlignLeft | Qt::AlignVCenter, m_footer);
  }

  QString m_title;
  QString m_body;
  QString m_footer;
  bool m_tailOnLeft = true;
};

FloatingLauncher::FloatingLauncher(QWidget *parent) : QWidget(parent), m_bubble(new DockBubble(this)) {
  setFixedSize(76, 76);
  setWindowFlags(Qt::FramelessWindowHint | Qt::Tool | Qt::WindowStaysOnTopHint);
  setAttribute(Qt::WA_TranslucentBackground);
  setAttribute(Qt::WA_Hover, true);
  setMouseTracking(true);
  setToolTip(QStringLiteral("左键打开主面板，拖动可移动"));
  setCursor(Qt::PointingHandCursor);
  m_bubble->setContent(
      QStringLiteral("Orbit Deepin Assistant"),
      QStringLiteral("左键打开主面板，拖动可移动。"),
      QStringLiteral("右键菜单"));

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

  m_bubbleShowTimer.setSingleShot(true);
  m_bubbleShowTimer.setInterval(kBubbleShowDelayMs);
  connect(&m_bubbleShowTimer, &QTimer::timeout, this, [this]() {
    showBubbleNow();
  });

  m_bubbleHideTimer.setSingleShot(true);
  m_bubbleHideTimer.setInterval(kBubbleHideDelayMs);
  connect(&m_bubbleHideTimer, &QTimer::timeout, this, [this]() {
    hideBubbleNow();
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
  const int x = workArea.x() + workArea.width() - width() - 20;
  const int y = workArea.y() + (workArea.height() - height()) / 2;
  move(x, y);
  positionBubble();
}

void FloatingLauncher::paintEvent(QPaintEvent *) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::TextAntialiasing);

  const QRectF outerRect = rect().adjusted(3, 3, -3, -3);
  const QRectF innerRect = rect().adjusted(7, 7, -7, -7);
  const qreal pulse = 0.5 + 0.5 * std::sin((m_animTick % 360) * 3.14159265358979323846 / 180.0);

  painter.setPen(Qt::NoPen);
  painter.setBrush(QColor(0, 0, 0, m_hovered || m_dragging ? 70 : 48));
  painter.drawEllipse(outerRect.translated(0, 2));

  QColor glowColor = m_dragging ? QColor(255, 181, 94, 96)
                                : m_hovered ? QColor(115, 245, 255, 86)
                                            : QColor(115, 245, 255, 58);
  glowColor.setAlphaF(glowColor.alphaF() * (0.75 + 0.25 * pulse));
  painter.setBrush(glowColor);
  painter.drawEllipse(outerRect.adjusted(-1, -1, 1, 1));

  QPainterPath capsule;
  capsule.addRoundedRect(innerRect, 18, 18);

  QLinearGradient fillGradient(innerRect.topLeft(), innerRect.bottomRight());
  fillGradient.setColorAt(0.0, QColor(20, 31, 48));
  fillGradient.setColorAt(0.55, QColor(10, 20, 34));
  fillGradient.setColorAt(1.0, QColor(7, 14, 24));
  painter.fillPath(capsule, fillGradient);

  QPen borderPen(QColor(255, 255, 255, m_hovered ? 88 : 52), 1.0);
  painter.setPen(borderPen);
  painter.drawPath(capsule);

  const QPixmap iconPixmap = QIcon(QStringLiteral(":/icons/orbit-deepin-assistant.svg"))
                                 .pixmap(QSize(58, 58) * devicePixelRatioF());
  QPointF iconPos = innerRect.center() -
                    QPointF(iconPixmap.width() / (2.0 * devicePixelRatioF()),
                            iconPixmap.height() / (2.0 * devicePixelRatioF()));
  painter.drawPixmap(iconPos, iconPixmap);

  const QPointF statusCenter(innerRect.right() - 11, innerRect.top() + 11);
  QColor statusColor = m_dragging ? QColor(255, 181, 94) : m_hovered ? QColor(115, 245, 255)
                                                                     : QColor(110, 245, 168);
  painter.setBrush(statusColor);
  painter.setPen(QPen(QColor(255, 255, 255, 120), 1.0));
  painter.drawEllipse(statusCenter, 4.5, 4.5);

  if (m_pressed || m_clickFlash > 0.0) {
    const qreal flash = 5.0 + (1.0 - m_clickFlash) * 11.0;
    QColor flashColor = QColor(115, 245, 255);
    flashColor.setAlphaF(std::max<qreal>(0.0, m_clickFlash));
    painter.setPen(QPen(flashColor, 2.0));
    painter.setBrush(Qt::NoBrush);
    painter.drawEllipse(innerRect.adjusted(-flash, -flash, flash, flash));
  }

  if (m_dragging) {
    painter.setPen(QPen(QColor(255, 181, 94, 100), 1.0));
    painter.setBrush(QColor(255, 181, 94, 20));
    painter.drawRoundedRect(innerRect.adjusted(9, 11, -9, -11), 12, 12);
  }
}

void FloatingLauncher::mousePressEvent(QMouseEvent *event) {
  if (event->button() == Qt::LeftButton) {
    m_trackingPress = true;
    m_pressed = true;
    m_dragging = false;
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
  if (m_trackingPress && (event->buttons() & Qt::LeftButton)) {
    const int travel = (event->globalPos() - m_pressGlobalPos).manhattanLength();
    if (!m_dragging && travel >= QApplication::startDragDistance()) {
      m_dragging = true;
      updateAnimationState();
      showBubbleNow();
    }
  }

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
    const bool shouldActivate = m_trackingPress && travel < QApplication::startDragDistance();
    const bool wasDragging = m_dragging;
    m_pressed = false;
    m_trackingPress = false;
    m_dragging = false;

    if (shouldActivate) {
      emit activated();
      event->accept();
    }

    m_clickFlash = 1.0;
    if (wasDragging) {
      snapToNearestScreenEdge();
    }

    if (m_hovered) {
      scheduleBubbleShow();
    } else {
      scheduleBubbleHide();
    }

    updateAnimationState();
    update();
    return;
  }

  QWidget::mouseReleaseEvent(event);
}

void FloatingLauncher::enterEvent(QEvent *event) {
  m_hovered = true;
  update();
  updateAnimationState();
  scheduleBubbleShow();

  QWidget::enterEvent(event);
}

void FloatingLauncher::leaveEvent(QEvent *event) {
  m_hovered = false;
  m_pressed = false;
  m_trackingPress = false;
  if (m_dragging) {
    showBubbleNow();
  } else {
    scheduleBubbleHide();
  }
  update();
  updateAnimationState();
  QWidget::leaveEvent(event);
}

void FloatingLauncher::contextMenuEvent(QContextMenuEvent *event) {
  m_bubbleShowTimer.stop();
  m_bubbleHideTimer.stop();
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

  if (m_dragging || m_pressed || m_hovered) {
    showBubbleNow();
    return;
  }

  if (m_bubbleHideTimer.isActive() || m_bubbleShowTimer.isActive()) {
    return;
  }

  hideBubbleNow();
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

void FloatingLauncher::scheduleBubbleShow() {
  m_bubbleHideTimer.stop();

  if (!(m_hovered || m_dragging || m_pressed)) {
    return;
  }

  if (m_bubble && m_bubble->isVisible()) {
    showBubbleNow();
    return;
  }

  if (!m_bubbleShowTimer.isActive()) {
    m_bubbleShowTimer.start();
  }
  updateAnimationState();
}

void FloatingLauncher::scheduleBubbleHide() {
  m_bubbleShowTimer.stop();

  if (!m_bubble || !m_bubble->isVisible()) {
    hideBubbleNow();
    return;
  }

  if (!m_bubbleHideTimer.isActive()) {
    m_bubbleHideTimer.start();
  }
  updateAnimationState();
}

void FloatingLauncher::showBubbleNow() {
  m_bubbleHideTimer.stop();

  if (!m_bubble || !(m_hovered || m_dragging || m_pressed)) {
    return;
  }

  m_bubbleShowTimer.stop();
  m_bubble->setTailOnLeft(true);
  m_bubble->setContent(hoverTitle(), hoverBody(), hoverFooter());
  positionBubble();
  m_bubble->raise();
  m_bubble->show();
}

void FloatingLauncher::hideBubbleNow() {
  m_bubbleShowTimer.stop();
  m_bubbleHideTimer.stop();

  if (!m_bubble) {
    return;
  }

  m_bubble->hide();
}

void FloatingLauncher::snapToNearestScreenEdge() {
  QScreen *screen = QGuiApplication::screenAt(mapToGlobal(rect().center()));
  if (!screen) {
    screen = QGuiApplication::primaryScreen();
  }

  if (!screen) {
    return;
  }

  const QRect avail = screen->availableGeometry();
  const QRect geom = geometry();
  QPoint target = geom.topLeft();

  const int leftDistance = std::abs(geom.left() - avail.left());
  const int rightDistance = std::abs(avail.right() - geom.right());
  const int topDistance = std::abs(geom.top() - avail.top());
  const int bottomDistance = std::abs(avail.bottom() - geom.bottom());

  if (std::min(leftDistance, rightDistance) <= kEdgeSnapThreshold) {
    target.setX(leftDistance <= rightDistance
                    ? avail.left() + kEdgeSnapMargin
                    : avail.right() - geom.width() - kEdgeSnapMargin);
  }

  if (std::min(topDistance, bottomDistance) <= kEdgeSnapThreshold) {
    target.setY(topDistance <= bottomDistance
                    ? avail.top() + kEdgeSnapMargin
                    : avail.bottom() - geom.height() - kEdgeSnapMargin);
  }

  if (target != geom.topLeft()) {
    move(target);
    positionBubble();
    update();
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
    return QStringLiteral("拖动中，松开后会保持当前位置。");
  }

  if (m_hovered) {
    return QStringLiteral("左键打开主面板，拖动可移动。");
  }

  return QStringLiteral("这是常驻的桌面入口。");
}

QString FloatingLauncher::hoverFooter() const {
  return QStringLiteral("右键菜单");
}
