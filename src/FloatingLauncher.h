#pragma once

#include <QWidget>

class FloatingLauncher : public QWidget {
  Q_OBJECT

public:
  explicit FloatingLauncher(QWidget *parent = nullptr);

  void anchorToPrimaryScreen();

signals:
  void activated();

protected:
  void paintEvent(QPaintEvent *event) override;
  void mousePressEvent(QMouseEvent *event) override;
  void enterEvent(QEvent *event) override;
  void leaveEvent(QEvent *event) override;

private:
  bool m_hovered = false;
};
