const listeners = new Set();
let seq = 0;

function native() {
  return window.LyraMainBridge || null;
}

export function ytdlpAvailable() {
  const n = native();
  return !!(n && typeof n.ytdlpInfo === "function");
}

window.__lyraYtdlpEvent = function (evt) {
  listeners.forEach(function (fn) {
    try {
      fn(evt);
    } catch (_) {}
  });
};

export function onYtdlpEvent(fn) {
  listeners.add(fn);
  return function () {
    listeners.delete(fn);
  };
}

function call(method, args) {
  return new Promise(function (resolve) {
    const n = native();
    if (!n || typeof n[method] !== "function") {
      resolve({ ok: false, error: "unavailable" });
      return;
    }
    const id = "yt" + Date.now() + "_" + ++seq;
    if (!window.__lyraNativeCallbacks) window.__lyraNativeCallbacks = {};
    window.__lyraNativeCallbacks[id] = function (raw) {
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        resolve({ ok: false, error: "Invalid response" });
      }
    };
    try {
      n[method].apply(n, args.concat([id]));
    } catch (e) {
      delete window.__lyraNativeCallbacks[id];
      resolve({ ok: false, error: String((e && e.message) || e) });
    }
  });
}

export function ytdlpInfo(opts) {
  return call("ytdlpInfo", [JSON.stringify(opts)]);
}

export function ytdlpDownload(opts) {
  return call("ytdlpDownload", [JSON.stringify(opts)]);
}

export function ytdlpVersion() {
  return call("ytdlpVersion", []);
}

export function ytdlpUpdate(channel) {
  return call("ytdlpUpdate", [channel]);
}

export function ytdlpCancel(taskId) {
  const n = native();
  if (n && typeof n.ytdlpCancel === "function") n.ytdlpCancel(taskId);
}

export function ytdlpSaveCookies(text) {
  const n = native();
  return !!(n && typeof n.ytdlpSaveCookies === "function" && n.ytdlpSaveCookies(text));
}

export function ytdlpHasCookies() {
  const n = native();
  return !!(n && typeof n.ytdlpHasCookies === "function" && n.ytdlpHasCookies());
}

export function ytdlpAbi() {
  const n = native();
  return n && typeof n.ytdlpAbi === "function" ? n.ytdlpAbi() : "";
}

const KEY = "lyra_ytdlp_prefs";
const DEFAULTS = {
  audioFormat: "m4a",
  channel: "stable",
  embedMetadata: true,
  embedThumbnail: true,
  subtitles: false,
  subLangs: "en.*",
  sponsorblock: false,
  aria2c: false,
  ipv4: false,
  restrictNames: false,
  useCookies: false,
  proxy: "",
};

export function getPrefs() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (_) {
    return Object.assign({}, DEFAULTS);
  }
}

export function setPref(key, value) {
  try {
    const cur = getPrefs();
    cur[key] = value;
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch (_) {}
}
