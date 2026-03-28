# Orbit Deepin Assistant

`deepin_assistant` 是一款面向 `deepin / UOS` 的本地桌面助手，走的是 `Qt6 + C++ + CMake` 的原生路线。界面分成两个层次：上层是一个悬浮启动器，负责快速唤出助手；下层是固定在桌面侧边的工作面板，负责看状态、给方案、执行修复、回看结果。

当前这一版已经把系统问题诊断、外设连接、常见修复动作、邮件草稿整理和资料导出放进同一套原生桌面界面里，重点是本地运行、直接可看、执行后可回查。

## 文档

- 方案说明：[docs/stage1-proposal.md](docs/stage1-proposal.md)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- 演示脚本：[docs/demo-script.md](docs/demo-script.md)
- PDF 版本：[docs/stage1-proposal.pdf](docs/stage1-proposal.pdf)

## 构建环境

- `Qt 6`
- `CMake 3.16+`
- `C++17`
- `Ninja` 或 `Make`
- `CPack`

## 本地构建

在项目根目录执行：

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## 桌面运行

编译完成后，直接启动生成的桌面程序即可：

```bash
./build/orbit_deepin_assistant
```

程序启动后会先显示悬浮启动器，同时打开右侧侧边面板。点击悬浮按钮可以收起或重新唤起主面板。

## 本地安装

如果要把程序和桌面入口安装到当前用户目录，可以在项目根目录执行：

```bash
cmake --install build --prefix ~/.local
```

安装后会落下这些内容：

- `~/.local/bin/orbit_deepin_assistant`
- `~/.local/share/applications/orbit-deepin-assistant.desktop`
- `~/.local/share/icons/hicolor/scalable/apps/orbit-deepin-assistant.svg`

安装版运行时，资料和日志默认写到：

```text
~/.local/share/guanzi008/Orbit Deepin Assistant/artifacts
```

## 打包方式

项目使用 `CPack` 输出 tarball 包，便于直接发给测试人员或在 deepin 上解包验证。

生成打包产物：

```bash
cmake --build build --target package
```

或者直接调用 `cpack`：

```bash
cpack --config build/CPackConfig.cmake -G TGZ
```

输出默认放在 `build/` 目录下，生成的是一个 `tar.gz` 包，不是网页发布包。

## 当前能力

### 1. 桌面入口

- 悬浮启动器
- 右侧侧边面板
- 窗口置顶切换
- 打开资料目录

### 2. 本地诊断

程序会直接在本机读取并整理系统快照，包括：

- 系统版本和内核
- 根分区和内存使用情况
- 网络接口状态
- 打印队列、设备枚举和 CUPS 日志
- PipeWire 会话状态
- `dpkg --audit` 安装残留信息
- 当前窗口、剪贴板和邮件整理上下文
- 手工触发截图并导出附件

### 3. 诊断和修复动作

当前重点动作包括：

- 收集支持包
- 导出诊断工单
- 导出网络、音频和安装检查结果
- 重启网络服务
- 重启音频会话
- 修复包管理状态
- 删除旧队列
- 重装关键驱动包
- 修复 CUPS 过滤链权限
- 高权限动作生成待执行脚本
- 导出最近生成的资料和脚本
- 保留动作执行日志和回执
- 导出邮件上下文、草稿和截图材料

### 4. 邮件整理

当前邮件页已经能做这些事：

- 读取当前窗口、会话和剪贴板内容
- 整理收件人建议、主题和正文草稿
- 导出邮件上下文 JSON
- 导出 Markdown 草稿
- 截取当前屏幕，作为附件建议一起保存

## 发布内容

正式交付时，建议保留：

- `CMakeLists.txt`
- `src/`
- `docs/`
- `build/orbit_deepin_assistant`
- `build/orbit-deepin-assistant-*.tar.gz`

如果后面继续补系统级安装包，可以在同一套 `CMake + CPack` 基础上再接 `deb`，但当前这版已经能完成原生构建、用户目录安装和 tarball 分发。
