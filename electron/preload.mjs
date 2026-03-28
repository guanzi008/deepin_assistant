import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orbitDesktop", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("desktop:toggle-always-on-top"),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath)
});
