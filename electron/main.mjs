import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from "electron";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_PORT = Number(process.env.DIAGNOSTICS_PORT || 4174);
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:4173";
const WINDOW_WIDTH = 540;
const WINDOW_MIN_WIDTH = 460;
const WINDOW_MIN_HEIGHT = 760;
const WINDOW_MARGIN = 16;

let mainWindow = null;
let apiProcess = null;
let ownsApiProcess = false;

function getArtifactsDir() {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "artifacts")
    : path.join(APP_ROOT, "artifacts");
}

function getRendererEntry() {
  if (!app.isPackaged && process.env.ORBIT_DESKTOP_DIST !== "1") {
    return {
      type: "url",
      value: DEV_RENDERER_URL
    };
  }

  return {
    type: "file",
    value: path.join(app.getAppPath(), "dist", "index.html")
  };
}

function getServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "server", "index.mjs");
  }

  return path.join(APP_ROOT, "server", "index.mjs");
}

function checkPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port
    });

    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(600);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForPort(port, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await checkPortListening(port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function ensureLocalApi() {
  if (process.env.ORBIT_SKIP_INTERNAL_API === "1") {
    return;
  }

  if (await checkPortListening(API_PORT)) {
    return;
  }

  const child = spawn(process.execPath, [getServerEntry()], {
    cwd: app.isPackaged ? app.getPath("userData") : APP_ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DIAGNOSTICS_PORT: String(API_PORT),
      ORBIT_ARTIFACTS_DIR: getArtifactsDir()
    },
    stdio: "ignore"
  });

  child.unref();
  apiProcess = child;
  ownsApiProcess = true;
  child.once("exit", () => {
    apiProcess = null;
    ownsApiProcess = false;
  });

  await waitForPort(API_PORT);
}

function cleanupApiProcess() {
  if (apiProcess && ownsApiProcess && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
  }

  apiProcess = null;
  ownsApiProcess = false;
}

function positionWindow(win) {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = Math.min(
    WINDOW_WIDTH,
    Math.max(WINDOW_MIN_WIDTH, Math.round(workArea.width * 0.34))
  );
  const height = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.min(workArea.height - WINDOW_MARGIN * 2, 980)
  );
  const x = workArea.x + workArea.width - width - WINDOW_MARGIN;
  const y = workArea.y + Math.max(WINDOW_MARGIN, Math.round((workArea.height - height) / 2));

  win.setBounds({ x, y, width, height });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: 920,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    autoHideMenuBar: true,
    show: false,
    title: "Orbit Deepin Assistant",
    backgroundColor: "#050c14",
    webPreferences: {
      preload: path.join(APP_ROOT, "electron", "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  positionWindow(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  const rendererEntry = getRendererEntry();

  if (rendererEntry.type === "url") {
    await mainWindow.loadURL(rendererEntry.value);
  } else {
    await mainWindow.loadFile(rendererEntry.value);
  }
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:get-runtime-info", () => ({
    desktop: true,
    packaged: app.isPackaged,
    platform: process.platform,
    hostname: os.hostname(),
    version: app.getVersion(),
    apiPort: API_PORT,
    artifactsDir: getArtifactsDir(),
    isAlwaysOnTop: mainWindow?.isAlwaysOnTop() ?? false,
    windowMode: "side-panel"
  }));

  ipcMain.handle("desktop:toggle-always-on-top", () => {
    if (!mainWindow) {
      return {
        isAlwaysOnTop: false
      };
    }

    const nextValue = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(nextValue, "screen-saver");

    return {
      isAlwaysOnTop: nextValue
    };
  });

  ipcMain.handle("desktop:open-path", async (_event, targetPath) => {
    const result = await shell.openPath(targetPath);

    return {
      ok: !result,
      message: result
    };
  });
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  nativeTheme.themeSource = "dark";
  registerDesktopIpc();

  app.whenReady().then(async () => {
    await ensureLocalApi();
    await createMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });

  app.on("before-quit", () => {
    cleanupApiProcess();
  });
}
