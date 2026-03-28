# deepin Agent Teams

`deepin_assistant` 是一个面向 `deepin / UOS` 桌面场景的本地助手，重点处理两类事情：

1. 邮件整理与发送前确认
2. 系统问题诊断、外设连接和常见修复动作

项目采用“前端控制台 + 本地服务”的结构，尽量把过程做清楚：先采集上下文，再整理判断结果，最后由用户确认是否执行。

## 文档

- 方案说明：[docs/stage1-proposal.md](docs/stage1-proposal.md)
- PDF 版本：[docs/stage1-proposal.pdf](docs/stage1-proposal.pdf)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- 演示脚本：[docs/demo-script.md](docs/demo-script.md)

## 环境要求

- `Node.js 20+`
- `npm 10+`

## 开发运行

在项目根目录执行：

```bash
npm install
npm run dev
```

默认端口：

- 前端：`http://127.0.0.1:4173`
- 本地服务：`http://127.0.0.1:4174`

如果只启动本地服务：

```bash
npm run start:api
```

## 正式构建

执行：

```bash
npm run build
```

构建完成后，前端静态文件会输出到：

- `dist/`

当前仓库的发布形态说明：

- `dist/`：前端静态发布包
- `server/index.mjs`：本地服务入口
- `package.json` / `package-lock.json`：依赖和启动信息

如果要部署当前版本，至少需要保留：

- `dist/`
- `server/`
- `package.json`
- `package-lock.json`

当前默认输出的是网页发布包，不直接生成 `deb`、`AppImage`、`rpm` 这类桌面安装包。  
如果后面要做正式安装包，需要再补桌面壳和对应打包流程。

## 当前功能

### 1. 图形入口

- 统一控制台入口
- 主场景联动
- 实时状态展示

### 2. 系统状态采集

本地服务当前可以读取：

- `/etc/os-release`
- `systemctl`
- `journalctl`
- `lpstat`
- `lpinfo`
- `lsusb`
- `ip`
- `free`
- `df`

这些结果会整理成统一快照，供后续判断、建议生成和动作预览使用。

### 3. 多智能体协作链

当前已经接入两条本地接口：

- `GET /api/context/live`
- `POST /api/agent-teams/run`

前端会把实时上下文、剪贴板、输入内容和角色分工串起来，当前包含四个角色：

- `collector`
- `operator`
- `writer`
- `verifier`

当前已覆盖两个场景：

- 智能邮件助手
- 系统问题诊断与修复

### 4. 执行控制台

当前控制台已经支持一组可演示的本地动作：

- 收集支持包
- 导出诊断工单
- 检查服务与设备状态
- 导出待执行脚本
- 对高权限操作做确认、回执和日志记录
- 删除旧队列
- 重装关键驱动包
- 修复 CUPS 过滤链权限

### 5. 系统修复场景

当前已经覆盖的方向包括：

- 打印与外设连接
- 打印驱动修复
- 服务状态检查
- 安装问题排查
- 网络状态排查

整体目标不是堆命令，而是把“看状态、给方案、确认执行、回看结果”这条链做完整。

其中打印机修复链当前保留的重点能力包括：

- 清理旧作业并删除旧队列
- 重装核心打印组件和关键驱动包
- 检查并修复 CUPS 过滤链相关问题
- 重建打印队列并做测试打印
- 在需要时继续进入 PPD 校验、回绑和回滚

## 仓库结构

```text
deepin_assistant/
├─ docs/
│  ├─ architecture.md
│  ├─ demo-script.md
│  ├─ stage1-proposal.md
│  └─ stage1-proposal.pdf
├─ server/
│  └─ index.mjs
├─ src/
│  ├─ App.jsx
│  ├─ index.css
│  └─ main.jsx
├─ index.html
├─ package.json
├─ vite.config.js
└─ README.md
```
