const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { pathToFileURL } = require("url");
const { resolvePath, assertWritable } = require("./paths");

function uriOf(abs) {
  return pathToFileURL(abs).href;
}

function toStat(st, abs) {
  return {
    type: st.isDirectory() ? "directory" : "file",
    size: st.size,
    mtime: Math.floor(st.mtimeMs),
    ctime: Math.floor(st.ctimeMs || st.birthtimeMs || st.mtimeMs),
    uri: uriOf(abs),
  };
}

function bufferFrom(data, encoding) {
  const text = typeof data === "string" ? data : String(data ?? "");
  if (encoding) return Buffer.from(text, encoding === "utf8" ? "utf8" : encoding);
  return Buffer.from(text.replace(/^data:[^,]*,/, ""), "base64");
}

const ops = {
  async readFile({ path: p, directory, encoding }) {
    const abs = resolvePath(p, directory);
    const buf = await fsp.readFile(abs);
    return { data: encoding ? buf.toString(encoding === "utf8" ? "utf8" : encoding) : buf.toString("base64") };
  },

  async writeFile({ path: p, directory, data, encoding, recursive }) {
    const abs = assertWritable(resolvePath(p, directory));
    if (recursive !== false) await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, bufferFrom(data, encoding));
    return { uri: uriOf(abs) };
  },

  async appendFile({ path: p, directory, data, encoding }) {
    const abs = assertWritable(resolvePath(p, directory));
    await fsp.appendFile(abs, bufferFrom(data, encoding));
  },

  async deleteFile({ path: p, directory }) {
    const abs = assertWritable(resolvePath(p, directory));
    await fsp.unlink(abs);
  },

  async mkdir({ path: p, directory, recursive }) {
    const abs = assertWritable(resolvePath(p, directory));
    await fsp.mkdir(abs, { recursive: recursive !== false });
  },

  async rmdir({ path: p, directory, recursive }) {
    const abs = assertWritable(resolvePath(p, directory));
    await fsp.rm(abs, { recursive: Boolean(recursive), force: false });
  },

  async readdir({ path: p, directory }) {
    const abs = resolvePath(p, directory);
    const names = await fsp.readdir(abs);
    const files = [];
    for (const name of names) {
      const full = path.join(abs, name);
      try {
        const st = await fsp.stat(full);
        files.push({ name, ...toStat(st, full) });
      } catch (_) {}
    }
    return { files };
  },

  async stat({ path: p, directory }) {
    const abs = resolvePath(p, directory);
    const st = await fsp.stat(abs);
    return toStat(st, abs);
  },

  async getUri({ path: p, directory }) {
    return { uri: uriOf(resolvePath(p, directory)) };
  },

  async rename({ from, to, directory, toDirectory }) {
    const src = assertWritable(resolvePath(from, directory));
    const dst = assertWritable(resolvePath(to, toDirectory || directory));
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(src, dst);
  },

  async copy({ from, to, directory, toDirectory }) {
    const src = resolvePath(from, directory);
    const dst = assertWritable(resolvePath(to, toDirectory || directory));
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.copyFile(src, dst);
    return { uri: uriOf(dst) };
  },
};

async function run(op, args) {
  const fn = ops[op];
  if (!fn) throw new Error(`Unsupported filesystem operation: ${op}`);
  return fn(args || {});
}

module.exports = { run };
