(function () {
  var bridge = window.lyraDesktop;
  if (!bridge || (window.Capacitor && window.Capacitor.__lyraDesktop)) return;

  var registry = {};
  var recentLaunch = { url: null, at: 0 };

  function listen(scope, name, handler) {
    var key = scope + ":" + name;
    if (!registry[key]) registry[key] = new Set();
    registry[key].add(handler);
    return Promise.resolve({
      remove: function () {
        if (registry[key]) registry[key].delete(handler);
        return Promise.resolve();
      },
    });
  }

  function emit(scope, name, payload) {
    var set = registry[scope + ":" + name];
    if (!set) return;
    set.forEach(function (fn) {
      try {
        fn(payload);
      } catch (_) {}
    });
  }

  function bytesToBase64(bytes) {
    var chunk = 0x8000;
    var out = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  function base64ToBytes(b64) {
    var bin = atob(b64 || "");
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () {
        resolve(String(reader.result).split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function prepareWrite(opts) {
    var args = Object.assign({}, opts);
    var data = args.data;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return blobToBase64(data).then(function (b64) {
        args.data = b64;
        delete args.encoding;
        return args;
      });
    }
    if (data instanceof ArrayBuffer) {
      args.data = bytesToBase64(new Uint8Array(data));
      delete args.encoding;
    } else if (ArrayBuffer.isView(data)) {
      args.data = bytesToBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      delete args.encoding;
    }
    return Promise.resolve(args);
  }

  var Filesystem = {
    readFile: function (o) {
      return bridge.fs("readFile", o);
    },
    writeFile: function (o) {
      return prepareWrite(o).then(function (args) {
        return bridge.fs("writeFile", args);
      });
    },
    appendFile: function (o) {
      return prepareWrite(o).then(function (args) {
        return bridge.fs("appendFile", args);
      });
    },
    deleteFile: function (o) {
      return bridge.fs("deleteFile", o);
    },
    mkdir: function (o) {
      return bridge.fs("mkdir", o);
    },
    rmdir: function (o) {
      return bridge.fs("rmdir", o);
    },
    readdir: function (o) {
      return bridge.fs("readdir", o);
    },
    stat: function (o) {
      return bridge.fs("stat", o);
    },
    getUri: function (o) {
      return bridge.fs("getUri", o);
    },
    rename: function (o) {
      return bridge.fs("rename", o);
    },
    copy: function (o) {
      return bridge.fs("copy", o);
    },
    downloadFile: function (o) {
      return bridge.download(o);
    },
    checkPermissions: function () {
      return Promise.resolve({ publicStorage: "granted" });
    },
    requestPermissions: function () {
      return Promise.resolve({ publicStorage: "granted" });
    },
    addListener: function (name, fn) {
      return listen("fs", name, fn);
    },
    removeAllListeners: function () {
      Object.keys(registry).forEach(function (k) {
        if (k.indexOf("fs:") === 0) delete registry[k];
      });
      return Promise.resolve();
    },
  };

  bridge.onProgress(function (payload) {
    emit("fs", "progress", payload);
  });

  function shapeResponse(res, type) {
    if (!res || res.data === undefined || res.data === null) return res;
    if (type === "blob") {
      var contentType = (res.headers && (res.headers["content-type"] || res.headers["Content-Type"])) || "";
      res.data = new Blob([base64ToBytes(res.data)], { type: contentType });
    } else if (type === "arraybuffer") {
      res.data = base64ToBytes(res.data).buffer;
    }
    return res;
  }

  function send(method, o) {
    var opts = Object.assign({}, o || {});
    opts.method = String(method || opts.method || "GET").toUpperCase();
    if (typeof FormData !== "undefined" && opts.data instanceof FormData) {
      var form = new URLSearchParams();
      opts.data.forEach(function (v, k) {
        form.append(k, String(v));
      });
      opts.data = form.toString();
      opts.headers = Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, opts.headers);
    }
    var type = String(opts.responseType || "").toLowerCase();
    return bridge.http(opts).then(function (res) {
      return shapeResponse(res, type);
    });
  }

  var CapacitorHttp = {
    request: function (o) {
      return send(o && o.method, o);
    },
    get: function (o) {
      return send("GET", o);
    },
    post: function (o) {
      return send("POST", o);
    },
    put: function (o) {
      return send("PUT", o);
    },
    patch: function (o) {
      return send("PATCH", o);
    },
    delete: function (o) {
      return send("DELETE", o);
    },
  };

  var Clipboard = {
    read: function () {
      return bridge.clipboardRead();
    },
    write: function (o) {
      var text = o && (o.string || o.url || "");
      return bridge.clipboardWrite(text || "");
    },
  };

  var Share = {
    share: function (o) {
      var parts = [o && o.text, o && o.url].filter(Boolean).join("\n");
      return bridge.clipboardWrite(parts).then(function () {
        return { activityType: "clipboard" };
      });
    },
    canShare: function () {
      return Promise.resolve({ value: true });
    },
  };

  var App = {
    addListener: function (name, fn) {
      return listen("app", name, fn);
    },
    getLaunchUrl: function () {
      return bridge.getLaunchUrl().then(function (url) {
        if (!url) return undefined;
        recentLaunch = { url: url, at: Date.now() };
        return { url: url };
      });
    },
    exitApp: function () {
      return bridge.quit();
    },
    minimizeApp: function () {
      return Promise.resolve();
    },
    removeAllListeners: function () {
      Object.keys(registry).forEach(function (k) {
        if (k.indexOf("app:") === 0) delete registry[k];
      });
      return Promise.resolve();
    },
  };

  bridge.onOpenUrl(function (url) {
    if (!url) return;
    if (recentLaunch.url === url && Date.now() - recentLaunch.at < 4000) return;
    emit("app", "appUrlOpen", { url: url });
  });

  document.addEventListener("visibilitychange", function () {
    emit("app", "appStateChange", { isActive: document.visibilityState === "visible" });
  });

  function idle() {
    return Promise.resolve();
  }

  var Haptics = {
    impact: idle,
    vibrate: idle,
    notification: idle,
    selectionStart: idle,
    selectionChanged: idle,
    selectionEnd: idle,
  };

  function networkStatus() {
    var online = navigator.onLine !== false;
    return { connected: online, connectionType: online ? "wifi" : "none" };
  }

  var Network = {
    getStatus: function () {
      return Promise.resolve(networkStatus());
    },
    addListener: function (name, fn) {
      return listen("network", name, fn);
    },
  };

  window.addEventListener("online", function () {
    emit("network", "networkStatusChange", networkStatus());
  });
  window.addEventListener("offline", function () {
    emit("network", "networkStatusChange", networkStatus());
  });

  function convertFileSrc(value) {
    var src = String(value === undefined || value === null ? "" : value);
    if (!src) return src;
    if (/^(https?:|data:|blob:|lyra:)/i.test(src)) return src;
    return "lyra://file/?p=" + encodeURIComponent(src);
  }

  var Plugins = {
    Filesystem: Filesystem,
    CapacitorHttp: CapacitorHttp,
    Clipboard: Clipboard,
    Share: Share,
    App: App,
    Haptics: Haptics,
    Network: Network,
  };

  window.Capacitor = {
    __lyraDesktop: true,
    Plugins: Plugins,
    isNativePlatform: function () {
      return true;
    },
    getPlatform: function () {
      return "electron";
    },
    isPluginAvailable: function (name) {
      return Boolean(Plugins[name]);
    },
    convertFileSrc: convertFileSrc,
  };

  var nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || String(input);
    var opts = init || {};
    if (!/^https?:\/\//i.test(url)) return nativeFetch(input, init);
    if (opts.body !== undefined && opts.body !== null && typeof opts.body !== "string") {
      return nativeFetch(input, init);
    }
    if (opts.signal && opts.signal.aborted) {
      return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
    }
    var headers = {};
    try {
      new Headers(opts.headers || (typeof input !== "string" && input.headers) || {}).forEach(function (v, k) {
        headers[k] = v;
      });
    } catch (_) {}
    var method = opts.method || (typeof input !== "string" && input.method) || "GET";
    var request = bridge
      .http({
        url: url,
        method: String(method).toUpperCase(),
        headers: headers,
        data: opts.body === null ? undefined : opts.body,
        responseType: "arraybuffer",
      })
      .then(function (res) {
        var bytes = base64ToBytes(res.data);
        var empty = res.status === 204 || res.status === 205 || res.status === 304;
        var out = new Headers();
        Object.keys(res.headers || {}).forEach(function (k) {
          if (k.toLowerCase() === "set-cookie") return;
          try {
            out.set(k, res.headers[k]);
          } catch (_) {}
        });
        var response = new Response(empty ? null : bytes, { status: res.status, headers: out });
        try {
          Object.defineProperty(response, "url", { value: res.url || url });
        } catch (_) {}
        return response;
      });
    if (!opts.signal) return request;
    return new Promise(function (resolve, reject) {
      opts.signal.addEventListener("abort", function () {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
      request.then(resolve, reject);
    });
  };

  document.documentElement.classList.add("platform-electron", "os-" + bridge.platform);
})();
