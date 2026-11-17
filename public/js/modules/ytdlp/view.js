import { showToast, triggerHaptic, Clipboard } from "../../utils/index.js";
import { saveToHistory } from "../history.js";
import { ys, applyStaticStrings } from "./strings.js";
import {
  ytdlpAvailable,
  ytdlpInfo,
  ytdlpDownload,
  ytdlpCancel,
  onYtdlpEvent,
  getPrefs,
} from "./bridge.js";

const state = {
  url: "",
  info: null,
  mode: "video",
  height: 0,
  formatId: "",
  audioFmt: "m4a",
  selected: new Set(),
};
const tasks = [];
let running = false;
let counter = 0;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function fmtDuration(sec) {
  if (!sec || !isFinite(sec)) return "";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

function fmtSize(bytes) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + " " + u[i];
}

function looksLikePlaylist(url) {
  try {
    const u = new URL(url);
    if (/\/playlist\b/.test(u.pathname)) return true;
    if (u.searchParams.has("list") && !u.searchParams.has("v")) return true;
    if (/\/sets\//.test(u.pathname) || /\/album\//.test(u.pathname)) return true;
  } catch (_) {}
  return false;
}

function setView(name) {
  ["ytdlpLoader", "ytdlpInfoCard", "ytdlpPlaylistCard"].forEach(function (id) {
    const el = $(id);
    if (el) el.classList.toggle("hidden", id !== name);
  });
}

function chip(label, active, attrs) {
  return (
    '<button type="button" class="tool-chip' +
    (active ? " active" : "") +
    '" ' +
    attrs +
    ">" +
    esc(label) +
    "</button>"
  );
}

function availableHeights(info) {
  const set = new Set();
  (info.formats || []).forEach(function (f) {
    if (f.height && f.vcodec && f.vcodec !== "none") set.add(f.height);
  });
  return Array.from(set)
    .sort(function (a, b) {
      return b - a;
    })
    .slice(0, 6);
}

function renderChips() {
  const info = state.info;
  const modeBox = $("ytdlpModeChips");
  const qualBox = $("ytdlpQualityChips");
  const qualLabel = $("ytdlpQualityLabel");
  modeBox.innerHTML =
    chip(ys("video"), state.mode === "video", 'data-mode="video"') +
    chip(ys("audio"), state.mode === "audio", 'data-mode="audio"');
  if (state.mode === "video") {
    qualLabel.textContent = ys("quality");
    const hs = availableHeights(info);
    let html = chip(ys("best"), !state.height && !state.formatId, 'data-h="0"');
    hs.forEach(function (h) {
      html += chip(h + "p", state.height === h && !state.formatId, 'data-h="' + h + '"');
    });
    qualBox.innerHTML = html;
  } else {
    qualLabel.textContent = ys("format");
    qualBox.innerHTML = ["best", "m4a", "mp3", "opus"]
      .map(function (f) {
        return chip(f === "best" ? ys("best") : f.toUpperCase(), state.audioFmt === f && !state.formatId, 'data-a="' + f + '"');
      })
      .join("");
  }
}

function renderFormats() {
  const list = $("ytdlpFormatList");
  const fmts = (state.info.formats || []).filter(function (f) {
    return f.format_id && f.protocol !== "mhtml";
  });
  list.innerHTML = fmts
    .slice()
    .reverse()
    .map(function (f) {
      const hasV = f.vcodec && f.vcodec !== "none";
      const hasA = f.acodec && f.acodec !== "none";
      const kind = hasV && hasA ? "A/V" : hasV ? "V" : "A";
      const res = hasV ? (f.height ? f.height + "p" : "") + (f.fps ? " " + Math.round(f.fps) + "fps" : "") : f.abr ? Math.round(f.abr) + "k" : "";
      const size = fmtSize(f.filesize || f.filesize_approx);
      return (
        '<button type="button" class="ytdlp-format-row' +
        (state.formatId === f.format_id ? " active" : "") +
        '" data-fid="' +
        esc(f.format_id) +
        '" data-kind="' +
        kind +
        '"><span class="fmt-kind">' +
        kind +
        '</span><span class="fmt-main">' +
        esc((f.ext || "").toUpperCase() + (res ? " · " + res : "")) +
        '</span><span class="fmt-size">' +
        esc(size) +
        "</span></button>"
      );
    })
    .join("");
}

function renderInfo() {
  const info = state.info;
  const thumb = $("ytdlpThumb");
  if (info.thumbnail) {
    thumb.src = info.thumbnail;
    thumb.classList.remove("hidden");
  } else {
    thumb.classList.add("hidden");
  }
  $("ytdlpTitle").textContent = info.title || "Media";
  const meta = [info.uploader || info.channel, fmtDuration(info.duration), info.extractor_key || info.extractor]
    .filter(Boolean)
    .join(" · ");
  $("ytdlpMeta").textContent = meta;
  renderChips();
  renderFormats();
  setView("ytdlpInfoCard");
}

function renderPlaylist() {
  const info = state.info;
  const entries = info.entries || [];
  state.selected = new Set(
    entries.map(function (_, i) {
      return i;
    }),
  );
  $("ytdlpPlaylistTitle").textContent = info.title || ys("playlist");
  $("ytdlpPlaylistCount").textContent = entries.length + " " + ys("items");
  $("ytdlpPlaylistList").innerHTML = entries
    .map(function (e, i) {
      return (
        '<label class="ytdlp-entry"><input type="checkbox" data-idx="' +
        i +
        '" checked /><span class="ytdlp-entry-title">' +
        esc(e.title || e.id || "Item " + (i + 1)) +
        '</span><span class="ytdlp-entry-dur">' +
        esc(fmtDuration(e.duration)) +
        "</span></label>"
      );
    })
    .join("");
  const modeBox = $("ytdlpPlModeChips");
  modeBox.innerHTML =
    chip(ys("video"), state.mode === "video", 'data-mode="video"') +
    chip(ys("audio"), state.mode === "audio", 'data-mode="audio"');
  setView("ytdlpPlaylistCard");
}

async function fetchInfo() {
  const input = $("ytdlpUrlInput");
  const url = (input.value || "").trim();
  if (!url) {
    showToast(ys("noLink"));
    return;
  }
  const match = url.match(/https?:\/\/[^\s]+/);
  state.url = match ? match[0] : url;
  state.formatId = "";
  state.height = 0;
  state.audioFmt = getPrefs().audioFormat;
  setView("ytdlpLoader");
  $("ytdlpFetchBtn").disabled = true;
  const prefs = getPrefs();
  const res = await ytdlpInfo({
    url: state.url,
    playlist: looksLikePlaylist(state.url),
    ipv4: prefs.ipv4,
    proxy: prefs.proxy,
    cookies: prefs.useCookies,
  });
  $("ytdlpFetchBtn").disabled = false;
  if (!res.ok) {
    setView("");
    showToast(res.error || ys("failed"));
    return;
  }
  state.info = res.info;
  if (res.info.entries && res.info.entries.length) renderPlaylist();
  else renderInfo();
}

function buildOpts(url, extra) {
  const p = getPrefs();
  return Object.assign(
    {
      url: url,
      mode: state.mode,
      height: state.height,
      formatId: state.formatId,
      audioFormat: state.audioFmt,
      embedMetadata: p.embedMetadata,
      embedThumbnail: p.embedThumbnail,
      subtitles: p.subtitles,
      subLangs: p.subLangs,
      sponsorblock: p.sponsorblock,
      aria2c: p.aria2c,
      ipv4: p.ipv4,
      proxy: p.proxy,
      cookies: p.useCookies,
      restrictNames: p.restrictNames,
      subDir: "Lyra",
    },
    extra || {},
  );
}

function enqueue(title, thumb, url, extra) {
  counter++;
  const task = {
    id: "ytdlp_" + Date.now() + "_" + counter,
    title: title,
    thumb: thumb,
    url: url,
    opts: buildOpts(url, extra),
    status: "queued",
    progress: 0,
    note: "",
  };
  task.opts.taskId = task.id;
  tasks.unshift(task);
  renderTasks();
  runQueue();
}

function statusLabel(t) {
  if (t.status === "queued") return ys("queued");
  if (t.status === "preparing") return ys("preparing");
  if (t.status === "downloading") return ys("downloading") + " " + Math.round(t.progress) + "%";
  if (t.status === "saving") return ys("saving");
  if (t.status === "done") return ys("done");
  if (t.status === "cancelled") return ys("cancelled");
  return ys("failed") + (t.note ? ": " + t.note : "");
}

function renderTasks() {
  const box = $("ytdlpTasks");
  if (!box) return;
  if (!tasks.length) {
    box.innerHTML = '<div class="ytdlp-empty">' + esc(ys("emptyTasks")) + "</div>";
    return;
  }
  box.innerHTML = tasks
    .map(function (t) {
      const active = t.status === "queued" || t.status === "preparing" || t.status === "downloading";
      return (
        '<div class="ytdlp-task ' +
        t.status +
        '" data-task="' +
        t.id +
        '"><div class="ytdlp-task-top"><div class="ytdlp-task-info"><div class="ytdlp-task-title">' +
        esc(t.title) +
        '</div><div class="ytdlp-task-status">' +
        esc(statusLabel(t)) +
        "</div></div>" +
        (active
          ? '<button type="button" class="ytdlp-task-cancel" data-cancel="' + t.id + '" aria-label="' + esc(ys("cancel")) + '">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>'
          : "") +
        '</div><div class="ytdlp-bar"><div class="ytdlp-bar-fill" style="width:' +
        (t.status === "done" ? 100 : t.progress) +
        '%"></div></div></div>'
      );
    })
    .join("");
}

function patchTask(t) {
  const row = document.querySelector('[data-task="' + t.id + '"]');
  if (!row) return renderTasks();
  const fill = row.querySelector(".ytdlp-bar-fill");
  const st = row.querySelector(".ytdlp-task-status");
  if (fill) fill.style.width = t.progress + "%";
  if (st) st.textContent = statusLabel(t);
}

function serviceStart(text) {
  try {
    if (window.LyraMainBridge && window.LyraMainBridge.startDownloadService) window.LyraMainBridge.startDownloadService(text);
  } catch (_) {}
}

function serviceStop() {
  try {
    if (window.LyraMainBridge && window.LyraMainBridge.stopDownloadService) window.LyraMainBridge.stopDownloadService();
  } catch (_) {}
}

async function runQueue() {
  if (running) return;
  running = true;
  serviceStart("yt-dlp");
  while (true) {
    const next = tasks
      .slice()
      .reverse()
      .find(function (t) {
        return t.status === "queued";
      });
    if (!next) break;
    next.status = "preparing";
    renderTasks();
    const res = await ytdlpDownload(next.opts);
    if (res.ok) {
      next.status = "done";
      next.progress = 100;
      try {
        saveToHistory({ title: next.title, thumbnail: next.thumb || null }, next.url);
      } catch (_) {}
      showToast(ys("done"));
      triggerHaptic("success");
    } else if (res.cancelled) {
      next.status = "cancelled";
    } else {
      next.status = "failed";
      next.note = res.error || "";
    }
    renderTasks();
  }
  running = false;
  serviceStop();
}

onYtdlpEvent(function (e) {
  const t = tasks.find(function (x) {
    return x.id === e.taskId;
  });
  if (!t) return;
  if (e.type === "progress") {
    t.status = "downloading";
    t.progress = Math.max(0, Math.min(100, e.progress || 0));
    patchTask(t);
  } else if (e.type === "saving") {
    t.status = "saving";
    t.progress = 100;
    patchTask(t);
  }
});

export function openYtdlpWithUrl(url) {
  const card = document.querySelector('.tool-card[data-tool="ytdlp"]');
  const toolsNav = document.querySelector('.nav-item[data-page="tools"]');
  if (toolsNav) toolsNav.click();
  if (card) card.click();
  const input = $("ytdlpUrlInput");
  if (input && url) input.value = url;
  showToast(ys("copied"));
  if (input && url) fetchInfo();
}

export function initYtdlpView() {
  const view = $("toolYtdlpView");
  if (!view) return;
  applyStaticStrings(document);

  const card = document.querySelector('.tool-card[data-tool="ytdlp"]');
  const home = $("ytdlpHomeLink");
  const available = ytdlpAvailable();
  $("ytdlpUnavailable").classList.toggle("hidden", available);
  $("ytdlpControls").classList.toggle("hidden", !available);
  if (home) {
    home.classList.toggle("hidden", !available);
    home.addEventListener("click", function () {
      const v = ($("urlInput").value || "").trim();
      openYtdlpWithUrl(v);
    });
  }
  if (!available && card) card.classList.add("is-soft-disabled");

  $("ytdlpFetchBtn").addEventListener("click", function () {
    triggerHaptic("light");
    fetchInfo();
  });
  $("ytdlpUrlInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") fetchInfo();
  });
  $("ytdlpPasteBtn").addEventListener("click", async function () {
    try {
      const r = Clipboard ? await Clipboard.read() : null;
      const txt = r && r.value ? r.value : await navigator.clipboard.readText();
      if (txt) $("ytdlpUrlInput").value = txt;
    } catch (_) {}
  });

  view.addEventListener("click", function (e) {
    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn) {
      state.mode = modeBtn.getAttribute("data-mode");
      state.formatId = "";
      if (state.info && state.info.entries && state.info.entries.length) renderPlaylist();
      else if (state.info) renderChips();
      return;
    }
    const h = e.target.closest("[data-h]");
    if (h) {
      state.height = parseInt(h.getAttribute("data-h"), 10) || 0;
      state.formatId = "";
      renderChips();
      renderFormats();
      return;
    }
    const a = e.target.closest("[data-a]");
    if (a) {
      state.audioFmt = a.getAttribute("data-a");
      state.formatId = "";
      renderChips();
      renderFormats();
      return;
    }
    const row = e.target.closest("[data-fid]");
    if (row) {
      const fid = row.getAttribute("data-fid");
      state.formatId = state.formatId === fid ? "" : fid;
      if (state.formatId) state.mode = row.getAttribute("data-kind") === "A" ? "audio" : "video";
      renderChips();
      renderFormats();
      return;
    }
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) {
      const id = cancel.getAttribute("data-cancel");
      const t = tasks.find(function (x) {
        return x.id === id;
      });
      if (t) {
        if (t.status === "queued") {
          t.status = "cancelled";
          renderTasks();
        } else {
          ytdlpCancel(id);
        }
      }
    }
  });

  $("ytdlpDownloadBtn").addEventListener("click", function () {
    if (!state.info) return;
    triggerHaptic("medium");
    enqueue(state.info.title || "Media", state.info.thumbnail, state.info.webpage_url || state.url);
    showToast(ys("queued"));
  });

  $("ytdlpPlaylistList").addEventListener("change", function (e) {
    const idx = parseInt(e.target.getAttribute("data-idx"), 10);
    if (isNaN(idx)) return;
    if (e.target.checked) state.selected.add(idx);
    else state.selected.delete(idx);
  });

  $("ytdlpSelectAll").addEventListener("click", function () {
    const boxes = $("ytdlpPlaylistList").querySelectorAll("input[type=checkbox]");
    const all = Array.from(boxes).every(function (b) {
      return b.checked;
    });
    state.selected.clear();
    boxes.forEach(function (b, i) {
      b.checked = !all;
      if (!all) state.selected.add(i);
    });
  });

  $("ytdlpPlaylistDownloadBtn").addEventListener("click", function () {
    if (!state.selected.size) {
      showToast(ys("nothingSelected"));
      return;
    }
    const entries = state.info.entries || [];
    Array.from(state.selected)
      .sort(function (a, b) {
        return a - b;
      })
      .forEach(function (i) {
        const e = entries[i];
        const u = e.url || e.webpage_url;
        if (!u) return;
        enqueue(e.title || e.id || "Item", e.thumbnail, u, { playlist: false });
      });
    showToast(ys("queued"));
  });

  renderTasks();
  initSites();
}

function initSites() {
  const box = $("ytdlpSitesList");
  const search = $("ytdlpSitesSearch");
  const count = $("ytdlpSitesCount");
  const det = box && box.closest("details");
  if (!box || !det) return;
  let sites = null;
  const draw = function () {
    const q = (search.value || "").trim().toLowerCase();
    const hits = q
      ? sites.filter(function (n) {
          return n.toLowerCase().indexOf(q) !== -1;
        })
      : sites;
    box.innerHTML = hits.length
      ? hits
          .slice(0, 400)
          .map(function (n) {
            return '<span class="ytdlp-site">' + esc(n) + "</span>";
          })
          .join("")
      : '<div class="ytdlp-empty">' + esc(ys("sitesEmpty")) + "</div>";
  };
  det.addEventListener("toggle", async function () {
    if (!det.open || sites) return;
    try {
      const res = await fetch("ytdlp-sites.json");
      sites = await res.json();
    } catch (_) {
      sites = [];
    }
    count.textContent = "(" + sites.length + ")";
    draw();
  });
  search.addEventListener("input", function () {
    if (sites) draw();
  });
}
