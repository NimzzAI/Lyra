const path = require("path");
const os = require("os");
const { app } = require("electron");
const fs = require("fs");

const FOLDER_ALIASES = {
  download: "downloads",
  downloads: "downloads",
  music: "music",
  pictures: "pictures",
  dcim: "pictures",
  movies: "videos",
  videos: "videos",
  documents: "documents",
  desktop: "desktop",
};

const BLOCKED = process.platform === "win32"
  ? [/^[a-z]:\\windows(\\|$)/i, /^[a-z]:\\program files( \(x86\))?(\\|$)/i, /^[a-z]:\\programdata(\\|$)/i]
  : [/^\/(etc|usr|bin|sbin|lib|lib64|boot|dev|proc|sys|System|Library|Applications|private\/etc)(\/|$)/];

function looksAbsolute(p) {
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\")) return true;
  if (!p.startsWith("/")) return false;
  const first = p.split("/").filter(Boolean)[0] || "";
  if (FOLDER_ALIASES[first.toLowerCase()]) {
    try {
      return fs.existsSync(p);
    } catch (_) {
      return false;
    }
  }
  return true;
}

function fromFileUrl(raw) {
  let rest = String(raw).replace(/^file:\/\//i, "");
  if (/^\/[A-Za-z]:[\\/]/.test(rest)) rest = rest.slice(1);
  const candidates = [rest];
  try {
    candidates.push(decodeURIComponent(rest));
  } catch (_) {}
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  return candidates[candidates.length - 1];
}

function baseFor(directory) {
  switch (directory) {
    case "CACHE":
    case "EXTERNAL_CACHE":
    case "TEMPORARY":
      return path.join(app.getPath("temp"), "Lyra");
    case "DATA":
    case "LIBRARY":
    case "LIBRARY_NO_CLOUD":
      return app.getPath("userData");
    default:
      return null;
  }
}

function storageResolve(rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return os.homedir();
  const alias = FOLDER_ALIASES[parts[0].toLowerCase()];
  if (alias) return path.join(app.getPath(alias), ...parts.slice(1));
  return path.join(os.homedir(), ...parts);
}

function resolvePath(p, directory) {
  let raw = String(p === undefined || p === null ? "" : p);
  if (/^file:/i.test(raw)) raw = fromFileUrl(raw);
  if (process.platform === "win32" && /^[\\/][A-Za-z]:[\\/]/.test(raw)) raw = raw.slice(1);
  raw = raw.replace(/^\/storage\/emulated\/0\/?/, "");
  let out;
  if (looksAbsolute(raw)) {
    out = path.normalize(raw);
  } else {
    const rel = raw.replace(/^[\\/]+/, "");
    if (rel.split(/[\\/]+/).includes("..")) throw new Error("Invalid path");
    const base = baseFor(directory);
    out = base ? path.join(base, rel) : storageResolve(rel);
  }
  return out;
}

function assertWritable(abs) {
  const norm = path.normalize(abs);
  if (BLOCKED.some((rx) => rx.test(norm))) throw new Error("Path is not allowed");
  return norm;
}

module.exports = { resolvePath, assertWritable, looksAbsolute, fromFileUrl };
