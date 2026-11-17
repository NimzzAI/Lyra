import { showToast } from "../../utils/index.js";
import { ys, applyStaticStrings } from "./strings.js";
import {
  ytdlpAvailable,
  ytdlpVersion,
  ytdlpUpdate,
  ytdlpSaveCookies,
  ytdlpHasCookies,
  ytdlpAbi,
  getPrefs,
  setPref,
} from "./bridge.js";

function $(id) {
  return document.getElementById(id);
}

function bindToggle(id, key) {
  const el = $(id);
  if (!el) return;
  el.checked = !!getPrefs()[key];
  el.addEventListener("change", function () {
    setPref(key, el.checked);
  });
}

function bindText(id, key) {
  const el = $(id);
  if (!el) return;
  el.value = getPrefs()[key] || "";
  el.addEventListener("change", function () {
    setPref(key, el.value.trim());
  });
}

function bindChips(boxId, key, attr) {
  const box = $(boxId);
  if (!box) return;
  const sync = function () {
    const cur = getPrefs()[key];
    box.querySelectorAll("[" + attr + "]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute(attr) === cur);
    });
  };
  sync();
  box.addEventListener("click", function (e) {
    const b = e.target.closest("[" + attr + "]");
    if (!b) return;
    setPref(key, b.getAttribute(attr));
    sync();
  });
}

async function refreshVersion() {
  const el = $("ytdlpVersionVal");
  if (!el) return;
  if (!ytdlpAvailable()) {
    el.textContent = "—";
    return;
  }
  el.textContent = ys("checking");
  const r = await ytdlpVersion();
  el.textContent = r.ok && r.version ? r.version : "—";
}

export function initYtdlpSettings() {
  const item = $("ytdlpSettingsEntry");
  if (!$("settingsYtdlp")) return;
  applyStaticStrings(document);
  if (item && !ytdlpAvailable()) item.classList.add("hidden");

  bindToggle("ytdlpEmbedMeta", "embedMetadata");
  bindToggle("ytdlpEmbedThumb", "embedThumbnail");
  bindToggle("ytdlpSubs", "subtitles");
  bindToggle("ytdlpSponsor", "sponsorblock");
  bindToggle("ytdlpAria2", "aria2c");
  bindToggle("ytdlpIpv4", "ipv4");
  bindToggle("ytdlpUseCookies", "useCookies");
  bindToggle("ytdlpRestrict", "restrictNames");
  bindText("ytdlpSubLangs", "subLangs");
  bindText("ytdlpProxy", "proxy");
  bindChips("ytdlpAudioChips", "audioFormat", "data-af");
  bindChips("ytdlpChannelChips", "channel", "data-ch");

  const abi = $("ytdlpAbiVal");
  if (abi) abi.textContent = ytdlpAbi() || "—";

  const updateBtn = $("ytdlpUpdateBtn");
  if (updateBtn) {
    updateBtn.addEventListener("click", async function () {
      updateBtn.disabled = true;
      const label = updateBtn.textContent;
      updateBtn.textContent = ys("updating");
      const r = await ytdlpUpdate(getPrefs().channel);
      updateBtn.disabled = false;
      updateBtn.textContent = label;
      if (!r.ok) showToast(ys("updateFailed") + ": " + (r.error || ""));
      else showToast(r.status === "ALREADY_UP_TO_DATE" ? ys("upToDate") : ys("updated"));
      refreshVersion();
    });
  }

  const area = $("ytdlpCookiesText");
  const saveBtn = $("ytdlpCookiesSave");
  const clearBtn = $("ytdlpCookiesClear");
  const status = $("ytdlpCookiesState");
  const showState = function () {
    if (status) status.textContent = ytdlpHasCookies() ? "cookies.txt ✓" : "—";
  };
  showState();
  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      if (ytdlpSaveCookies(area.value || "")) {
        showToast(ys("cookiesSaved"));
        area.value = "";
      }
      showState();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      ytdlpSaveCookies("");
      showToast(ys("cookiesCleared"));
      showState();
    });
  }

  const menu = document.querySelector('.settings-menu-item[data-target="settingsYtdlp"]');
  if (menu) menu.addEventListener("click", refreshVersion);
}
