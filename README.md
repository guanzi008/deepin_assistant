# Orbit Deepin Assistant

`deepin_assistant` 是一款面向 `deepin / UOS` 的本地桌面助手，走的是 `Qt6 + C++ + CMake` 的原生路线。界面分成两个层次：上层是一个悬浮启动器，负责快速唤出助手；下层是固定在桌面侧边的工作面板，负责看状态、给方案、执行修复、回看结果。

当前这一版先把系统问题诊断、外设连接和常见修复动作做扎实，邮件整理能力放在下一阶段继续接。

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

## 发布内容

正式交付时，建议保留：

- `CMakeLists.txt`
- `src/`
- `docs/`
- `build/orbit_deepin_assistant`
- `build/orbit-deepin-assistant-*.tar.gz`

如果后面要继续做安装包，可以在同一套 `CMake + CPack` 基础上再接 `deb` 或 `AppImage`，但这一版先把原生二进制和 tarball 跑通。
