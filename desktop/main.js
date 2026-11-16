const { app, BrowserWindow, ipcMain, protocol, net, shell, clipboard, dialog, Menu, session } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const fsops = require("./lib/fsops");
const httpClient = require("./lib/http");
const { resolvePath, assertWritable } = require("./lib/paths");

const APP_ORIGIN = "lyra://app/";
const MEDIA_EXTENSIONS = new Set([
  ".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".flv", ".ts", ".3gp",
  ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac",
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".heic", ".svg",
  ".pdf", ".zip", ".srt", ".vtt",
]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lyra",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const publicDir = app.isPackaged
  ? path.join(process.resourcesPath, "public")
  : path.join(__dirname, "..", "public");

let mainWindow = null;
let launchUrl = null;

function extractUrl(argv) {
  for (const arg of argv) {
    if (typeof arg !== "string") continue;
    if (/^lyra:\/\/open/i.test(arg)) {
      try {
        const inner = new URL(arg).searchParams.get("url");
        if (inner && /^https?:\/\//i.test(inner)) return inner;
      } catch (_) {}
    }
    if (/^https?:\/\//i.test(arg)) return arg;
  }
  return null;
}

function deliverUrl(url) {
  if (!url) return;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("lyra:open-url", url);
  } else {
    launchUrl = url;
  }
}

function isTrusted(event) {
  const frame = event.senderFrame;
  return Boolean(frame && typeof frame.url === "string" && frame.url.startsWith(APP_ORIGIN));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrusted(event)) throw new Error("Untrusted sender");
      return { ok: true, value: await fn(event, ...args) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });
}

function safeExternal(url) {
  try {
    const parsed = new URL(String(url));
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return parsed.href;
  } catch (_) {}
  return null;
}

function registerIpc() {
  handle("lyra:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
  }));
  handle("lyra:fs", (_e, op, args) => fsops.run(op, args));
  handle("lyra:http", (_e, opts) => httpClient.request(opts || {}));
  handle("lyra:download", (event, opts) =>
    httpClient.download(opts || {}, (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("lyra:progress", payload);
    }),
  );
  handle("lyra:clipboard-read", () => ({ value: clipboard.readText(), type: "text/plain" }));
  handle("lyra:clipboard-write", (_e, text) => {
    clipboard.writeText(String(text ?? ""));
  });
  handle("lyra:open-external", async (_e, url) => {
    const safe = safeExternal(url);
    if (!safe) throw new Error("Blocked URL");
    await shell.openExternal(safe);
  });
  handle("lyra:open-path", async (_e, target) => {
    const abs = resolvePath(target);
    const failure = await shell.openPath(abs);
    if (failure) throw new Error(failure);
  });
  handle("lyra:show-item", (_e, target) => {
    shell.showItemInFolder(resolvePath(target));
  });
  handle("lyra:pick-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return assertWritable(result.filePaths[0]);
  });
  handle("lyra:launch-url", () => {
    const url = launchUrl;
    launchUrl = null;
    return url;
  });
  handle("lyra:quit", () => {
    app.quit();
  });
}

function registerProtocol() {
  protocol.handle("lyra", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === "file") {
        const abs = resolvePath(url.searchParams.get("p") || "");
        if (!MEDIA_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
          return new Response("Forbidden", { status: 403 });
        }
        return await net.fetch(pathToFileURL(abs).href, { headers: request.headers });
      }
      if (url.hostname === "app") {
        let rel = decodeURIComponent(url.pathname);
        if (rel === "/" || rel === "") rel = "/index.html";
        const abs = path.normalize(path.join(publicDir, rel));
        if (!abs.startsWith(publicDir + path.sep)) {
          return new Response("Forbidden", { status: 403 });
        }
        const upstream = await net.fetch(pathToFileURL(abs).href);
        const headers = new Headers(upstream.headers);
        const mime = MIME_TYPES[path.extname(abs).toLowerCase()];
        if (mime) headers.set("content-type", mime);
        return new Response(upstream.body, { status: upstream.status, headers });
      }
      return new Response("Not found", { status: 404 });
    } catch (_) {
      return new Response("Not found", { status: 404 });
    }
  });
}

function buildMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function runSmokeTest(win) {
  const finish = (code, message) => {
    console.log(message);
    app.exit(code);
  };
  setTimeout(() => finish(1, "SMOKE FAIL: timeout"), 45000);
  win.webContents.on("did-fail-load", (_event, code, description) => {
    finish(1, `SMOKE FAIL: load ${code} ${description}`);
  });
  win.webContents.on("did-finish-load", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const state = await win.webContents.executeJavaScript(`(async () => {
        const fsApi = window.Capacitor.Plugins.Filesystem;
        const probe = "Lyra-smoke-" + Date.now() + ".txt";
        await fsApi.writeFile({ path: probe, directory: "CACHE", data: "ok", encoding: "utf8" });
        const read = await fsApi.readFile({ path: probe, directory: "CACHE", encoding: "utf8" });
        await fsApi.deleteFile({ path: probe, directory: "CACHE" });
        return {
          platform: window.Capacitor.getPlatform(),
          input: !!document.getElementById("urlInput"),
          fs: read.data,
        };
      })()`);
      if (state.platform === "electron" && state.input && state.fs === "ok") {
        finish(0, `SMOKE OK ${JSON.stringify(state)}`);
      } else {
        finish(1, `SMOKE FAIL ${JSON.stringify(state)}`);
      }
    } catch (err) {
      finish(1, `SMOKE FAIL: ${err.message}`);
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, "build", "icon.png");
  mainWindow = new BrowserWindow({
    width: 520,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    show: false,
    backgroundColor: "#000000",
    title: "Lyra",
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternal(url);
    if (safe) shell.openExternal(safe);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      const safe = safeExternal(url);
      if (safe) shell.openExternal(safe);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (launchUrl) {
      const pending = launchUrl;
      launchUrl = null;
      mainWindow.webContents.send("lyra:open-url", pending);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.LYRA_SMOKE_TEST === "1") runSmokeTest(mainWindow);

  mainWindow.loadURL(`${APP_ORIGIN}index.html`);
}

function configureSession() {
  const allowed = new Set(["clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  launchUrl = extractUrl(process.argv.slice(1));

  app.on("second-instance", (_event, argv) => {
    const url = extractUrl(argv);
    if (url) {
      deliverUrl(url);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverUrl(extractUrl([url]));
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("com.nimzz.lyra");
    if (app.isPackaged) app.setAsDefaultProtocolClient("lyra");
    registerProtocol();
    registerIpc();
    configureSession();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
