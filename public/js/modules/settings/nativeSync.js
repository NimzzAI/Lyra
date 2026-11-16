// nativeSync.js — native SharedPreferences bridge & platform inspection
import { platformVal } from "../core.js";

/**
 * Synchronizes a single Lyra setting to Android SharedPreferences for background & share activities
 */
export function syncSettingToNative(key, val) {
  if (window.LyraMainBridge?.saveSetting) {
    try {
      window.LyraMainBridge.saveSetting(key, String(val));
    } catch (e) {
      console.error("syncSettingToNative error", e);
    }
  }
}

/**
 * Iterates through all core setting keys and syncs them to native SharedPreferences
 */
export function syncAllSettingsToNative() {
  const keys = [
    "lyra_lang",
    "lyra_theme",
    "lyra_font",
    "lyra_prefer_server",
    "lyra_download_path",
    "lyra_auto_folder",
    "lyra_filename",
    "lyra_filename_custom",
    "lyra_incognito",
    "lyra_auto_download",
    "lyra_wifi_only",
  ];
  keys.forEach((key) => {
    const val = localStorage.getItem(key);
    if (val !== null) {
      syncSettingToNative(key, val);
    }
  });
}

/**
 * Inspects device environment and updates the platform display label in settings
 */
export function initPlatformDisplay() {
  if (!platformVal) return;

  const capPlatform = window.Capacitor?.getPlatform?.();
  if (capPlatform === "ios") {
    platformVal.textContent = "iOS";
  } else if (capPlatform === "android") {
    platformVal.textContent = "Android";
  } else if (capPlatform === "electron") {
    const os = window.lyraDesktop?.platform;
    platformVal.textContent =
      os === "win32" ? "Windows" : os === "darwin" ? "macOS" : "Linux";
  } else {
    platformVal.textContent = "Web Browser";
  }
}
