import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopPet", {
  getStatus: () => ipcRenderer.invoke("pet:get-status"),
  listPets: () => ipcRenderer.invoke("pet:list"),
  getPetPreview: (id) => ipcRenderer.invoke("pet:preview", id),
  selectPet: (id) => ipcRenderer.invoke("pet:select", id),
  setState: (state, durationMs) =>
    ipcRenderer.invoke("pet:set-state", { state, durationMs }),
  startWindowDrag: (payload) => {
    ipcRenderer.send("window:drag-start", payload);
    return Promise.resolve();
  },
  stopWindowDrag: () => {
    ipcRenderer.send("window:drag-end");
    return Promise.resolve();
  },
  resizeMascot: (widthPx) => {
    ipcRenderer.send("window:resize-mascot", widthPx);
    return Promise.resolve();
  },
  setVisualInsets: (insets) => {
    ipcRenderer.send("window:visual-insets", insets);
    return Promise.resolve();
  },
  setPointerPassthrough: (enabled) => {
    ipcRenderer.send("window:pointer-passthrough", enabled);
    return Promise.resolve();
  },
  setPickerOpen: (enabled) => ipcRenderer.invoke("window:picker-open", enabled),
  showContextMenu: () => ipcRenderer.invoke("window:context-menu"),
  close: () => ipcRenderer.invoke("app:close"),
  onStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("pet:status-changed", listener);
    return () => ipcRenderer.removeListener("pet:status-changed", listener);
  },
  onOpenPetPicker: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("pet:open-picker", listener);
    return () => ipcRenderer.removeListener("pet:open-picker", listener);
  },
});
