# deepin Agent Teams Prototype

`deepin_assistant` 是 `deepin Agent Teams` 的当前原型仓库，用于统信进阶任务 `27`。仓库重点不是堆概念，而是把两个固定场景先做完整：

1. 智能邮件助手
2. 系统问题智能诊断与修复

当前代码已经具备统一图形入口、系统状态采集、动作执行控制台和高权限动作确认机制，后续会继续往 `deepin 25` 真机场景收敛。

## 文档

- 方案文档：[docs/stage1-proposal.md](docs/stage1-proposal.md)
- PDF 版本：[docs/stage1-proposal.pdf](docs/stage1-proposal.pdf)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- 演示脚本：[docs/demo-script.md](docs/demo-script.md)

## 运行

要求：

- `Node.js 20+`
- `npm 10+`

启动开发环境：

```bash
cd /home/hao/AAA-PT2430PCz/deepin_assistant
npm install
npm run dev
```

默认端口：

- 前端：`http://127.0.0.1:4173`
- 本地服务：`http://127.0.0.1:4174`

生产构建：

```bash
npm run build
```

单独启动本地服务：

```bash
npm run start:api
```

## 当前原型能力

### 1. 图形入口

- 单一侧边控制台入口
- 主场景联动
- 实时状态展示

### 2. 系统状态采集

当前本地服务已经可以采集：

- `/etc/os-release`
- `systemctl`
- `journalctl`
- `lpstat`
- `lpinfo`
- `lsusb`

这些结果会被整理成统一快照，用于后续的场景判断和动作预览。

### 3. 执行控制台

当前已经有一组可演示的本地动作：

- 收集支持包
- 导出诊断工单
- 检查服务与设备状态
- 导出待执行脚本
- 对高权限操作做确认、回执和日志记录

### 4. 系统问题修复原型

当前原型仍保留了一部分围绕打印、服务和安装问题的修复动作，这是“系统问题诊断与修复”场景的实现基础。后续整理方向会更偏向桌面高频问题本身，而不是继续围绕单一 `PPD` 细节展开。

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

## 下一步

下一阶段主要补三部分：

1. 活动窗口、剪贴板、定向截图等上下文采集
2. 邮件场景的草稿生成与发送前预览
3. 更通用的系统问题场景，包括声音、安装、网络和打印问题
  - 删除旧队列
  - 重装关键驱动包
  - 修复 CUPS 过滤链权限

## 适合继续做的方向

如果继续做成参赛项目，下一阶段最值当的是：

1. 把本地诊断结果接成自动修复执行流
2. 做打印修复执行日志面板
3. 增加“自动收集截图 / 日志 / 导出工单”能力
4. 接文心做自然语言诊断和多轮追问
5. 增加 deepin / UOS 风格的本地桌面端封装
