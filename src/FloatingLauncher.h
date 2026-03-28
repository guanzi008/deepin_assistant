#pragma once

#include <QContextMenuEvent>
#include <QMouseEvent>
#include <QMoveEvent>
#include <QPaintEvent>
#include <QPoint>
#include <QTimer>
#include <QWidget>

class DockBubble;

class FloatingLauncher : public QWidget {
  Q_OBJECT

public:
  explicit FloatingLauncher(QWidget *parent = nullptr);

  void anchorToPrimaryScreen();

signals:
  void activated();
  void exitRequested();

protected:
  void paintEvent(QPaintEvent *event) override;
  void mousePressEvent(QMouseEvent *event) override;
  void mouseMoveEvent(QMouseEvent *event) override;
  void mouseReleaseEvent(QMouseEvent *event) override;
  void enterEvent(QEvent *event) override;
  void leaveEvent(QEvent *event) override;
  void contextMenuEvent(QContextMenuEvent *event) override;
  void moveEvent(QMoveEvent *event) override;

private:
  void updateBubble();
  void positionBubble();
  void updateAnimationState();
  void scheduleBubbleShow();
  void scheduleBubbleHide();
  void showBubbleNow();
  void hideBubbleNow();
  void snapToNearestScreenEdge();
  QString hoverTitle() const;
  QString hoverBody() const;
  QString hoverFooter() const;

  bool m_hovered = false;
  bool m_trackingPress = false;
  bool m_dragging = false;
  bool m_pressed = false;
  qreal m_clickFlash = 0.0;
  int m_animTick = 0;
  QPoint m_dragOffset;
  QPoint m_pressGlobalPos;
  QTimer m_animTimer;
  QTimer m_bubbleShowTimer;
  QTimer m_bubbleHideTimer;
  DockBubble *m_bubble = nullptr;
};
