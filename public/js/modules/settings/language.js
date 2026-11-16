// language.js — localization, dropdown select engine, navigation, reset, and support
import { translations } from "../../i18n/index.js";
import { showToast, previewSound, setUtilsState } from "../../utils/index.js";
import { setUIState, renderHistory } from "../../ui.js";
import { showConfirm } from "../modals.js";
import { onHistoryItemClick, onHistoryDeleteClick } from "../history.js";
import {
  APP_VERSION,
  REPO_URL,
  currentLang,
  setCurrentLang,
  currentLangDisplay,
  openExternalUrl,
  reportBugBtn,
  platformVal,
} from "../core.js";
import { syncSettingToNative } from "./nativeSync.js";
import {
  applyColorAccent,
  applyFont,
  applyAnimSpeed,
  applyTextSize,
  applyGlassmorphism,
  applyUiCorner,
} from "./appearance.js";
import { updateDlStatsDisplay } from "./storage.js";

/**
 * Custom Select Dropdown Engine
 */
export function setupCustomSelect(selectId, storageKey, textId, menuId) {
  const select = document.getElementById(selectId);
  const text = document.getElementById(textId);
  const menu = document.getElementById(menuId);
  if (!select || !text || !menu) return;

  const defaultFallback =
    storageKey === "lyra_prefer_server"
      ? "ask"
      : storageKey === "lyra_font"
        ? "display"
        : storageKey === "lyra_anim_speed"
          ? "normal"
          : storageKey === "lyra_text_size"
            ? "small"
            : storageKey === "lyra_glassmorphism"
              ? "subtle"
              : storageKey === "lyra_ui_corner"
                ? "sharp"
                : storageKey === "lyra_sound_pack"
                  ? "chime"
                  : storageKey === "lyra_concurrent"
                    ? "1"
                    : storageKey === "lyra_overwrite"
                      ? "rename"
                      : storageKey === "lyra_max_retry"
                        ? "3"
                        : storageKey === "lyra_doh"
                          ? "off"
                          : storageKey === "lyra_toast_dur"
                            ? "3"
                            : storageKey === "lyra_batch_format"
                              ? "video"
                              : storageKey === "lyra_lang"
                                ? currentLang
                                : "default";
  const currentVal = localStorage.getItem(storageKey) || defaultFallback;

  // Update display on load
  const item =
    menu.querySelector(`[data-value="${currentVal}"]`) ||
    menu.querySelector(".dropdown-item");
  if (item) {
    text.textContent = item.textContent;
  }

  select.addEventListener("click", (e) => {
    e.stopPropagation();

    // Close other dropdowns
    document.querySelectorAll(".dropdown-menu").forEach((m) => {
      if (m !== menu) m.classList.add("hidden");
    });
    document.querySelectorAll(".settings-item").forEach((s) => {
      s.classList.remove("active-dropdown");
    });

    menu.classList.toggle("hidden");

    if (!menu.classList.contains("hidden")) {
      select.closest(".settings-item")?.classList.add("active-dropdown");
      menu.classList.remove("open-up");

      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Flip upward if overflowing bottom
      if (rect.bottom > viewportHeight - 20) {
        menu.classList.add("open-up");
      }
    } else {
      select.closest(".settings-item")?.classList.remove("active-dropdown");
      menu.classList.remove("open-up");
    }
  });

  menu.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = item.getAttribute("data-value");
      localStorage.setItem(storageKey, val);
      syncSettingToNative(storageKey, val);
      text.textContent = item.textContent;
      menu.classList.add("hidden");
      menu.classList.remove("open-up");
      select.closest(".settings-item")?.classList.remove("active-dropdown");

      if (storageKey === "lyra_accent") applyColorAccent();
      if (storageKey === "lyra_font") applyFont();
      if (storageKey === "lyra_lang") switchLanguage(val);
      if (storageKey === "lyra_anim_speed") applyAnimSpeed();
      if (storageKey === "lyra_text_size") applyTextSize();
      if (storageKey === "lyra_glassmorphism") applyGlassmorphism();
      if (storageKey === "lyra_ui_corner") applyUiCorner();
      if (storageKey === "lyra_sound_pack") previewSound(val);

      if (storageKey === "lyra_filename") {
        const customFilenameBox = document.getElementById("customFilenameBox");
        const customFilenameInput = document.getElementById("customFilenameInput");
        if (val === "custom") {
          customFilenameBox?.classList.remove("hidden");
          if (customFilenameInput) {
            customFilenameInput.value =
              localStorage.getItem("lyra_filename_custom") ||
              "{platform}_{date}_{num}";
            customFilenameInput.focus();
          }
        } else {
          customFilenameBox?.classList.add("hidden");
        }
      }

      const labelText =
        select.closest(".settings-item")?.querySelector(".settings-title span")
          ?.textContent || "Setting";
      showToast(`${labelText}: ${item.textContent.trim()}`);
    });
  });
}

export function updateCustomSelectsUI() {
  const lang = translations[currentLang] || translations.en;

  const currentFilename = localStorage.getItem("lyra_filename") || "title";
  const filenameText = document.getElementById("filenameText");
  if (filenameText)
    filenameText.textContent =
      lang[`filename-${currentFilename}`] || currentFilename;

  const customFilenameBox = document.getElementById("customFilenameBox");
  const customFilenameInput = document.getElementById("customFilenameInput");
  if (customFilenameBox && customFilenameInput) {
    if (currentFilename === "custom") {
      customFilenameBox.classList.remove("hidden");
      customFilenameInput.value =
        localStorage.getItem("lyra_filename_custom") ||
        "{platform}_{date}_{num}";
    } else {
      customFilenameBox.classList.add("hidden");
    }
  }

  const currentUA = localStorage.getItem("lyra_user_agent") || "default";
  const userAgentText = document.getElementById("userAgentText");
  if (userAgentText)
    userAgentText.textContent = lang[`ua-${currentUA}`] || currentUA;

  const currentTimeout = localStorage.getItem("lyra_request_timeout") || "30";
  const requestTimeoutText = document.getElementById("requestTimeoutText");
  if (requestTimeoutText)
    requestTimeoutText.textContent =
      lang[`timeout-${currentTimeout}`] || `${currentTimeout}s`;

  const currentServer = localStorage.getItem("lyra_prefer_server") || "ask";
  const preferServerText = document.getElementById("preferServerText");
  if (preferServerText)
    preferServerText.textContent =
      lang[`server-${currentServer}`] || currentServer;

  const currentFont = localStorage.getItem("lyra_font") || "display";
  const fontText = document.getElementById("fontText");
  if (fontText)
    fontText.textContent =
      lang[`font-${currentFont}`] ||
      (currentFont === "default"
        ? lang["font-default"] || "Default"
        : currentFont);

  const currentLimit =
    localStorage.getItem("lyra_history_limit") || "unlimited";
  const historyLimitText = document.getElementById("historyLimitText");
  if (historyLimitText)
    historyLimitText.textContent =
      lang[`history-${currentLimit}`] || currentLimit;

  const currentClearDays =
    localStorage.getItem("lyra_auto_clear_days") || "off";
  const autoClearDaysText = document.getElementById("autoClearDaysText");
  if (autoClearDaysText)
    autoClearDaysText.textContent =
      lang[`days-${currentClearDays}`] || currentClearDays;

  const currentCacheDays =
    localStorage.getItem("lyra_auto_clear_cache_days") || "off";
  const autoClearCacheDaysText = document.getElementById(
    "autoClearCacheDaysText",
  );
  if (autoClearCacheDaysText)
    autoClearCacheDaysText.textContent =
      lang[`days-${currentCacheDays}`] || currentCacheDays;

  const currentLock = localStorage.getItem("lyra_lock_type") || "none";
  const lockTypeText = document.getElementById("lockTypeText");
  if (lockTypeText)
    lockTypeText.textContent = lang[`lock-type-${currentLock}`] || currentLock;

  const currentBatchPhoto =
    localStorage.getItem("lyra_batch_photo_mode") || "all";
  const batchPhotoModeText = document.getElementById("batchPhotoModeText");
  if (batchPhotoModeText)
    batchPhotoModeText.textContent =
      lang[`batch-photo-${currentBatchPhoto}`] || currentBatchPhoto;

  const currentBatchFormat =
    localStorage.getItem("lyra_batch_format") || "video";
  const batchFormatText = document.getElementById("batchFormatText");
  if (batchFormatText)
    batchFormatText.textContent =
      lang[`batch-format-${currentBatchFormat}`] || currentBatchFormat;

  const currentBackup = localStorage.getItem("lyra_auto_backup") || "off";
  const autoBackupText = document.getElementById("autoBackupText");
  if (autoBackupText) {
    if (currentBackup === "off")
      autoBackupText.textContent = lang["backup-off"] || "Off";
    else if (currentBackup === "7")
      autoBackupText.textContent = lang["backup-weekly"] || "Weekly (7 Days)";
    else if (currentBackup === "30")
      autoBackupText.textContent =
        lang["backup-monthly"] || "Monthly (30 Days)";
  }

  const currentAnimSpeed = localStorage.getItem("lyra_anim_speed") || "normal";
  const animSpeedText = document.getElementById("animSpeedText");
  if (animSpeedText)
    animSpeedText.textContent =
      lang[`anim-${currentAnimSpeed}`] || currentAnimSpeed;

  const currentTextSize = localStorage.getItem("lyra_text_size") || "small";
  const textSizeText = document.getElementById("textSizeText");
  if (textSizeText)
    textSizeText.textContent =
      lang[`text-${currentTextSize}`] || currentTextSize;

  const currentConcurrent = localStorage.getItem("lyra_concurrent") || "1";
  const concurrentText = document.getElementById("concurrentText");
  if (concurrentText)
    concurrentText.textContent =
      lang[`concurrent-${currentConcurrent}`] || currentConcurrent;

  const currentOverwrite = localStorage.getItem("lyra_overwrite") || "rename";
  const overwriteText = document.getElementById("overwriteText");
  if (overwriteText)
    overwriteText.textContent =
      lang[`overwrite-${currentOverwrite}`] || currentOverwrite;

  const currentMaxRetry = localStorage.getItem("lyra_max_retry") || "3";
  const maxRetryText = document.getElementById("maxRetryText");
  if (maxRetryText)
    maxRetryText.textContent =
      lang[`retry-${currentMaxRetry}`] || `${currentMaxRetry} Attempts`;

  const currentDoh = localStorage.getItem("lyra_doh") || "off";
  const dohText = document.getElementById("dohText");
  if (dohText) dohText.textContent = lang[`doh-${currentDoh}`] || currentDoh;

  const currentToastDur = localStorage.getItem("lyra_toast_dur") || "3";
  const toastDurText = document.getElementById("toastDurText");
  if (toastDurText)
    toastDurText.textContent =
      lang[`toast-dur-${currentToastDur}`] || `${currentToastDur}s`;

  const currentGlass = localStorage.getItem("lyra_glassmorphism") || "subtle";
  const glassText = document.getElementById("glassText");
  if (glassText)
    glassText.textContent = lang[`glass-${currentGlass}`] || currentGlass;

  const currentCorner = localStorage.getItem("lyra_ui_corner") || "sharp";
  const cornerText = document.getElementById("cornerText");
  if (cornerText)
    cornerText.textContent = lang[`corner-${currentCorner}`] || currentCorner;

  const currentSoundPack = localStorage.getItem("lyra_sound_pack") || "chime";
  const soundPackText = document.getElementById("soundPackText");
  if (soundPackText)
    soundPackText.textContent =
      lang[`sound-${currentSoundPack}`] || currentSoundPack;

  updateDlStatsDisplay();
}

export function updateLanguageUI() {
  const lang = translations[currentLang] || translations["en"];
  const fallback = translations["en"] || {};
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = lang?.[key] ?? fallback[key];
    if (val !== undefined) el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const val = lang?.[key] ?? fallback[key];
    if (val !== undefined) el.placeholder = val;
  });

  if (currentLangDisplay) {
    const langNames = {
      en: "English",
      id: "Indonesia",
      ja: "日本語",
      ko: "한국어",
      zh: "中文 (简体)",
      ar: "العربية",
      ru: "Русский",
      tl: "Tagalog",
      hi: "हिन्दी",
    };
    currentLangDisplay.textContent = langNames[currentLang] || "English";
  }

  document.documentElement.lang = currentLang;
  document.documentElement.setAttribute(
    "dir",
    currentLang === "ar" ? "rtl" : "ltr",
  );

  updateCustomSelectsUI();
  updateGreeting();
  setUtilsState({ currentLang });
}

export function updateGreeting() {}

export function switchLanguage(lang) {
  setCurrentLang(lang);
  localStorage.setItem("lyra_lang", lang);
  syncSettingToNative("lyra_lang", lang);
  setUIState({ currentLang });
  setUtilsState({ currentLang });
  updateLanguageUI();
  updateGreeting();
  renderHistory(onHistoryItemClick, onHistoryDeleteClick);
  window.dispatchEvent(
    new CustomEvent("lyra_language_changed", { detail: { lang } }),
  );

  let msg = "Language updated";
  if (currentLang === "id") msg = "Bahasa diperbarui";
  else if (currentLang === "ja") msg = "言語を更新しました";
  else if (currentLang === "ko") msg = "언어가 변경되었습니다";
  else if (currentLang === "zh") msg = "语言已更新";
  else if (currentLang === "ar") msg = "تم تحديث اللغة";
  else if (currentLang === "ru") msg = "Язык обновлен";
  else if (currentLang === "tl") msg = "Na-update ang wika";
  else if (currentLang === "hi") msg = "भाषा अपडेट हो गई";
  showToast(msg);
}

/**
 * Initializes dropdowns, navigation slide handlers, reset button, and bug reporting
 */
export function initLanguageAndNavigation() {
  // 1. Initialize Dropdowns
  setupCustomSelect("languageSelect", "lyra_lang", "currentLangDisplay", "languageMenu");
  setupCustomSelect("filenameSelect", "lyra_filename", "filenameText", "filenameMenu");
  setupCustomSelect("fontSelect", "lyra_font", "fontText", "fontMenu");
  setupCustomSelect("historyLimitSelect", "lyra_history_limit", "historyLimitText", "historyLimitMenu");
  setupCustomSelect("autoClearDaysSelect", "lyra_auto_clear_days", "autoClearDaysText", "autoClearDaysMenu");
  setupCustomSelect("autoClearCacheDaysSelect", "lyra_auto_clear_cache_days", "autoClearCacheDaysText", "autoClearCacheDaysMenu");
  setupCustomSelect("preferServerSelect", "lyra_prefer_server", "preferServerText", "preferServerMenu");
  setupCustomSelect("batchPhotoModeSelect", "lyra_batch_photo_mode", "batchPhotoModeText", "batchPhotoModeMenu");
  setupCustomSelect("batchFormatSelect", "lyra_batch_format", "batchFormatText", "batchFormatMenu");
  setupCustomSelect("userAgentSelect", "lyra_user_agent", "userAgentText", "userAgentMenu");
  setupCustomSelect("requestTimeoutSelect", "lyra_request_timeout", "requestTimeoutText", "requestTimeoutMenu");
  setupCustomSelect("animSpeedSelect", "lyra_anim_speed", "animSpeedText", "animSpeedMenu");
  setupCustomSelect("textSizeSelect", "lyra_text_size", "textSizeText", "textSizeMenu");
  setupCustomSelect("glassSelect", "lyra_glassmorphism", "glassText", "glassMenu");
  setupCustomSelect("cornerSelect", "lyra_ui_corner", "cornerText", "cornerMenu");
  setupCustomSelect("soundPackSelect", "lyra_sound_pack", "soundPackText", "soundPackMenu");
  setupCustomSelect("concurrentSelect", "lyra_concurrent", "concurrentText", "concurrentMenu");
  setupCustomSelect("overwriteSelect", "lyra_overwrite", "overwriteText", "overwriteMenu");
  setupCustomSelect("maxRetrySelect", "lyra_max_retry", "maxRetryText", "maxRetryMenu");
  setupCustomSelect("dohSelect", "lyra_doh", "dohText", "dohMenu");
  setupCustomSelect("toastDurSelect", "lyra_toast_dur", "toastDurText", "toastDurMenu");

  const customFilenameInput = document.getElementById("customFilenameInput");
  if (customFilenameInput) {
    customFilenameInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      localStorage.setItem("lyra_filename_custom", val);
      syncSettingToNative("lyra_filename_custom", val);
    });
  }

  // 2. Sub-page Navigation
  document.addEventListener("click", (e) => {
    const menuItem = e.target.closest(".settings-menu-item, [data-target]");
    if (menuItem) {
      const targetId = menuItem.getAttribute("data-target");
      if (targetId) {
        document
          .querySelectorAll(".settings-sub-page")
          .forEach((p) => p.classList.add("hidden"));
        const mainMenu = document.getElementById("settingsMainMenu");
        if (mainMenu) mainMenu.classList.add("hidden");
        const targetPage = document.getElementById(targetId);
        if (targetPage) targetPage.classList.remove("hidden");
      }
      return;
    }

    const backBtn = e.target.closest(".back-btn-settings");
    if (backBtn) {
      const backTarget = backBtn.getAttribute("data-back-target");
      document
        .querySelectorAll(".settings-sub-page")
        .forEach((p) => p.classList.add("hidden"));
      if (backTarget) {
        const targetPage = document.getElementById(backTarget);
        if (targetPage) targetPage.classList.remove("hidden");
      } else {
        const mainMenu = document.getElementById("settingsMainMenu");
        if (mainMenu) mainMenu.classList.remove("hidden");
      }
    }
  });

  // 3. Reset Settings Button
  const resetSettingsBtn = document.getElementById("resetSettingsBtn");
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", () => {
      const lang = translations[currentLang] || translations.en;
      showConfirm(
        lang["label-reset-settings"] || "Reset Settings",
        lang["confirm-reset-settings"] ||
          "Reset all settings to their defaults? This will not delete your history or downloaded files.",
        () => {
          const preserve = ["lyra_history", "lyra_dl_count", "lyra_incognito"];
          const preserved = {};
          preserve.forEach((k) => {
            const v = localStorage.getItem(k);
            if (v !== null) preserved[k] = v;
          });
          Object.keys(localStorage)
            .filter(
              (k) => k.startsWith("lyra_") && !k.startsWith("lyra_counter_"),
            )
            .forEach((k) => localStorage.removeItem(k));
          Object.entries(preserved).forEach(([k, v]) =>
            localStorage.setItem(k, v),
          );
          showToast(lang["toast-reset-settings"] || "Settings reset to default");
          setTimeout(() => location.reload(), 800);
        },
      );
    });
  }

  // 4. Report Bug Button
  reportBugBtn?.addEventListener("click", () => {
    const deviceInfo = `Model: ${navigator.userAgent}\nPlatform: ${platformVal?.textContent || "Unknown"}\nVersion: ${APP_VERSION}`;
    const body = encodeURIComponent(
      `**Bug description**\n\n[BUG DESCRIPTION HERE]\n\n---\nDevice Info:\n${deviceInfo}`,
    );
    const issueUrl = `${REPO_URL}/issues/new?title=${encodeURIComponent("Bug: ")}&body=${body}`;
    const lang = translations[currentLang] || translations.en;
    showToast(lang["label-opening-github"] || "Opening GitHub...");
    openExternalUrl(issueUrl);
  });

  // 6. Close dropdowns when clicking outside
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".dropdown-menu")
      .forEach((m) => m.classList.add("hidden"));
    document
      .querySelectorAll(".settings-item.active-dropdown")
      .forEach((s) => s.classList.remove("active-dropdown"));
  });
}
