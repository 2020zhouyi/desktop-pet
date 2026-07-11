const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getStatus: () => ipcRenderer.invoke("pet:get-status"),
  listPets: () => ipcRenderer.invoke("pet:list"),
  getPetPreview: (id) => ipcRenderer.invoke("pet:preview", id),
  selectPet: (id) => ipcRenderer.invoke("pet:select", id),
  openPetLibrary: () => ipcRenderer.invoke("pet:library-open"),
  setState: (state, durationMs) =>
    ipcRenderer.invoke("pet:set-state", { state, durationMs }),
  startWindowDrag: (payload) => {
    ipcRenderer.send("window:drag-start", payload);
    return Promise.resolve();
  },
  moveWindowDrag: (payload) => {
    ipcRenderer.send("window:drag-move", payload);
    return Promise.resolve();
  },
  stopWindowDrag: () => {
    ipcRenderer.send("window:drag-end");
    return Promise.resolve();
  },
  resizeMascot: (widthPx, persist = false) =>
    ipcRenderer.invoke("window:resize-mascot", { widthPx, persist }),
  setVisualInsets: (insets) => {
    ipcRenderer.send("window:visual-insets", insets);
    return Promise.resolve();
  },
  setPointerPassthrough: (enabled) => {
    ipcRenderer.send("window:pointer-passthrough", enabled);
    return Promise.resolve();
  },
  closeControlWindow: () => ipcRenderer.invoke("window:control-close"),
  showContextMenu: () => ipcRenderer.invoke("window:context-menu"),
  close: () => ipcRenderer.invoke("app:close"),
  onStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("pet:status-changed", listener);
    return () => ipcRenderer.removeListener("pet:status-changed", listener);
  },
});
