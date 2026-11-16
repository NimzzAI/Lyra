const http = require("http");
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { resolvePath, assertWritable } = require("./paths");

const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT = 30000;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function getHeader(headers, name) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

function setHeader(headers, name, value) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  if (key !== undefined) delete headers[key];
  headers[name] = value;
}

function dropHeader(headers, name) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  if (key !== undefined) delete headers[key];
}

function withParams(url, params) {
  if (!params || typeof params !== "object") return url;
  const target = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((item) => target.searchParams.append(k, String(item)));
    else if (v !== undefined && v !== null) target.searchParams.append(k, String(v));
  }
  return target.href;
}

function buildBody(data, headers) {
  if (data === undefined || data === null) return null;
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  const type = String(getHeader(headers, "content-type") || "");
  if (type.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) form.append(k, String(v));
    return Buffer.from(form.toString(), "utf8");
  }
  if (!type) setHeader(headers, "content-type", "application/json");
  return Buffer.from(JSON.stringify(data), "utf8");
}

function parseSetCookie(list) {
  const jar = {};
  for (const line of list || []) {
    const pair = String(line).split(";")[0].trim();
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function mergeCookies(existing, jar) {
  const merged = {};
  for (const part of String(existing || "").split(";")) {
    const piece = part.trim();
    const eq = piece.indexOf("=");
    if (eq > 0) merged[piece.slice(0, eq)] = piece.slice(eq + 1);
  }
  Object.assign(merged, jar);
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("; ");
}

function dispatch(target, method, headers, body, opts) {
  return new Promise((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http;
    const requestHeaders = { ...headers };
    if (body) requestHeaders["content-length"] = String(body.length);
    const options = { method, headers: requestHeaders };
    if (opts.ipv4Only) options.family = 4;
    if (target.protocol === "https:" && opts.disableSSLValidation) options.rejectUnauthorized = false;
    const req = lib.request(target, options, resolve);
    const timeout = opts.timeout || DEFAULT_TIMEOUT;
    req.setTimeout(timeout, () => req.destroy(new Error(`Request timed out after ${Math.round(timeout / 1000)}s`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function decodeStream(res) {
  const encoding = String(res.headers["content-encoding"] || "").toLowerCase().trim();
  if (encoding === "gzip" || encoding === "x-gzip") return { stream: res.pipe(zlib.createGunzip()), encoded: true };
  if (encoding === "deflate") return { stream: res.pipe(zlib.createInflate()), encoded: true };
  if (encoding === "br") return { stream: res.pipe(zlib.createBrotliDecompress()), encoded: true };
  return { stream: res, encoded: false };
}

function flattenHeaders(res) {
  const out = {};
  const cookies = [];
  const raw = res.rawHeaders || [];
  for (let i = 0; i < raw.length; i += 2) {
    const name = raw[i];
    const value = raw[i + 1];
    const lower = name.toLowerCase();
    if (lower === "set-cookie") {
      cookies.push(value);
      continue;
    }
    if (out[lower] !== undefined) {
      out[lower] += `, ${value}`;
      out[name] = out[lower];
    } else {
      out[lower] = value;
      if (name !== lower) out[name] = value;
    }
  }
  if (cookies.length) {
    const joined = cookies.join(",\n");
    out["set-cookie"] = joined;
    out["Set-Cookie"] = joined;
  }
  return out;
}

async function open(opts) {
  let url = withParams(String(opts.url), opts.params);
  let method = String(opts.method || "GET").toUpperCase();
  const headers = { ...(opts.headers || {}) };
  if (!getHeader(headers, "accept-encoding")) {
    setHeader(headers, "accept-encoding", opts.identity ? "identity" : "gzip, deflate, br");
  }
  let body = buildBody(opts.data, headers);
  let jar = {};
  let hops = 0;

  for (;;) {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${target.protocol}`);
    }
    const sendHeaders = { ...headers };
    if (Object.keys(jar).length) {
      setHeader(sendHeaders, "cookie", mergeCookies(getHeader(sendHeaders, "cookie"), jar));
    }
    if (!getHeader(sendHeaders, "host")) setHeader(sendHeaders, "host", target.host);
    const res = await dispatch(target, method, sendHeaders, body, opts);
    const location = res.headers.location;
    if (REDIRECT_CODES.has(res.statusCode) && location && hops < MAX_REDIRECTS) {
      res.resume();
      hops++;
      Object.assign(jar, parseSetCookie([].concat(res.headers["set-cookie"] || [])));
      const next = new URL(location, target);
      if (next.host !== target.host) {
        dropHeader(headers, "authorization");
        dropHeader(headers, "cookie");
        dropHeader(headers, "host");
        jar = {};
      } else {
        setHeader(headers, "host", next.host);
      }
      if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === "POST")) {
        method = "GET";
        body = null;
        dropHeader(headers, "content-type");
        dropHeader(headers, "content-length");
      }
      url = next.href;
      continue;
    }
    return { res, url };
  }
}

function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function decodeText(buffer, contentType) {
  const match = /charset=([^;\s]+)/i.exec(contentType || "");
  const label = match ? match[1].replace(/["']/g, "").toLowerCase() : "utf-8";
  if (label === "utf-8" || label === "utf8") return buffer.toString("utf8");
  try {
    return new TextDecoder(label).decode(buffer);
  } catch (_) {
    return buffer.toString("utf8");
  }
}

async function request(opts) {
  const timeout = Math.max(Number(opts.readTimeout) || 0, Number(opts.connectTimeout) || 0) || DEFAULT_TIMEOUT;
  const { res, url } = await open({ ...opts, timeout });
  const { stream } = decodeStream(res);
  const buffer = await collect(stream);
  const headers = flattenHeaders(res);
  const contentType = String(headers["content-type"] || "");
  const type = String(opts.responseType || "").toLowerCase();
  let data;
  if (type === "blob" || type === "arraybuffer") {
    data = buffer.toString("base64");
  } else {
    const text = decodeText(buffer, contentType);
    if (type === "json" || (!type && /json/i.test(contentType))) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    } else {
      data = text;
    }
  }
  return { status: res.statusCode, headers, data, url };
}

async function download(opts, onProgress) {
  const abs = assertWritable(resolvePath(opts.path, opts.directory));
  const timeout = Math.max(Number(opts.readTimeout) || 0, Number(opts.connectTimeout) || 0) || DEFAULT_TIMEOUT;
  const { res, url } = await open({ ...opts, method: "GET", data: undefined, timeout, identity: true });
  if (res.statusCode >= 400) {
    res.resume();
    throw new Error(`Download failed: HTTP ${res.statusCode}`);
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const { stream, encoded } = decodeStream(res);
  const contentLength = encoded ? 0 : Number(res.headers["content-length"]) || 0;
  let bytes = 0;
  let lastEmit = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      const now = Date.now();
      if (opts.progress && onProgress && now - lastEmit >= 150) {
        lastEmit = now;
        onProgress({ url: opts.url, bytes, contentLength });
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(stream, meter, fs.createWriteStream(abs));
  } catch (err) {
    await fsp.unlink(abs).catch(() => {});
    throw err;
  }
  if (opts.progress && onProgress) onProgress({ url: opts.url, bytes, contentLength: contentLength || bytes });
  return { path: abs, finalUrl: url };
}

module.exports = { request, download };
