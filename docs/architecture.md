# Architecture

## Overview

`deepin Agent Teams` 采用单一图形入口和本地编排服务。

```text
侧边助手面板
  -> 信息收集员
  -> 意图路由
  -> 系统操作员
  -> 内容整理员
  -> 验证员
  -> 本地工具 / SMTP / 日志 / 文件
```

## Runtime Layers

### 1. UI Layer

- 右侧助手面板
- 操作预览
- 用户确认
- 结果展示

### 2. Context Layer

- 活动窗口元数据
- 剪贴板内容
- 定向截图和 OCR
- 系统诊断结果

### 3. Agent Layer

- 信息收集员
- 系统操作员
- 内容整理员
- 验证员

### 4. Tool Layer

- Bash 命令
- 文件检索
- 服务管理
- 支持包导出
- 工单导出
- 邮件草稿与 SMTP 发送

### 5. Model Layer

- 文心路由模型
- 文心推理 / 生成模型

## Safety Design

- 高风险动作执行前必须确认
- 动作过程保留日志和回执
- 截图按需触发
- 不在后台静默执行敏感操作
