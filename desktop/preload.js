const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, ...args) {
  const reply = await ipcRenderer.invoke(channel, ...args);
  if (!reply || reply.ok !== true) {
    throw new Error((reply && reply.error) || "Desktop bridge call failed");
  }
  return reply.value;
}

const progressListeners = new Set();
const urlListeners = new Set();

ipcRenderer.on("lyra:progress", (_event, payload) => {
  progressListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (_) {}
  });
});

ipcRenderer.on("lyra:open-url", (_event, url) => {
  urlListeners.forEach((fn) => {
    try {
      fn(url);
    } catch (_) {}
  });
});

contextBridge.exposeInMainWorld("lyraDesktop", {
  platform: process.platform,
  arch: process.arch,
  info: () => call("lyra:info"),
  fs: (op, args) => call("lyra:fs", op, args),
  http: (opts) => call("lyra:http", opts),
  download: (opts) => call("lyra:download", opts),
  clipboardRead: () => call("lyra:clipboard-read"),
  clipboardWrite: (text) => call("lyra:clipboard-write", text),
  openExternal: (url) => call("lyra:open-external", url),
  openPath: (target) => call("lyra:open-path", target),
  showItemInFolder: (target) => call("lyra:show-item", target),
  pickFolder: () => call("lyra:pick-folder"),
  getLaunchUrl: () => call("lyra:launch-url"),
  quit: () => call("lyra:quit"),
  onProgress: (fn) => {
    progressListeners.add(fn);
    return () => progressListeners.delete(fn);
  },
  onOpenUrl: (fn) => {
    urlListeners.add(fn);
    return () => urlListeners.delete(fn);
  },
});
