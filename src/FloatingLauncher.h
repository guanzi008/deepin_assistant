#pragma once

#include <QPoint>
#include <QWidget>

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

private:
  bool m_hovered = false;
  bool m_dragging = false;
  QPoint m_dragOffset;
  QPoint m_pressGlobalPos;
};
