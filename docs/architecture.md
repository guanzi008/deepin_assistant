# Architecture

## Overview

`deepin Agent Teams` uses a single desktop entry and a multi-agent orchestration backend.

```text
UI Panel
  -> Context Collector
  -> Intent Router
  -> Planner / System Operator
  -> Writer / Communicator
  -> Verifier
  -> Local Tools / SMTP / Logs / Files / Services
```

## Runtime Layers

### 1. UI Layer

- Right-side assistant panel
- Action preview
- Confirmation for risky operations
- Result verification display

### 2. Context Layer

- Active window metadata
- Clipboard content
- Screenshot and OCR
- System diagnostics

### 3. Agent Layer

- Collector
- Operator
- Writer
- Verifier

### 4. Tool Layer

- Bash commands
- File search
- Service management
- Support bundle export
- Workorder export
- Email draft and SMTP sending

### 5. Model Layer

- ERNIE routing model
- ERNIE reasoning / generation model

## Safety Design

- Explicit confirmation before risky actions
- Action logs and receipts
- Scoped screenshot collection
- No background execution of sensitive actions without consent
