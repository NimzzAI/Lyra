// storage.js — file system downloading, retries, and persistence
import { Filesystem, CapacitorHttp } from "../utils/index.js";
import { translations } from "../i18n/index.js";
import { currentLang } from "../modules/core.js";

/**
 * Removes temporary .tmp files across all search directories
 */
export async function cleanupTempFiles(fullPath, targetName, directoriesToTry) {
  if (!Filesystem || !targetName) return;
  const tempName = targetName.endsWith(".tmp") ? targetName : `${targetName}.tmp`;
  for (const dir of directoriesToTry) {
    await Filesystem.deleteFile({
      path: fullPath + "/" + tempName,
      directory: dir,
    }).catch(() => {});
  }
}

/**
 * Deletes saved file across directories (e.g. after cancellation)
 */
export async function deleteSavedFile(savedFile, directoriesToTry) {
  if (!Filesystem || !savedFile?.path) return;
  for (const dir of directoriesToTry) {
    await Filesystem.deleteFile({
      path: savedFile.path,
      directory: dir,
    }).catch(() => {});
  }
}

/**
 * Executes file download using Capacitor Filesystem or CapacitorHttp fallback
 */
export async function saveToStorage({
  actualDownloadUrl,
  fileName,
  fullPath,
  targetFolder,
  downloadHeaders,
  directoriesToTry,
  checkCancelled,
  onSaving,
}) {
  let savedFile = null;
  let successfulDir = "EXTERNAL_STORAGE";
  let attempts = 0;

  const isAutoRetry = localStorage.getItem("lyra_auto_retry") !== "false";
  const customMaxRetry = parseInt(
    localStorage.getItem("lyra_max_retry") || "3",
    10,
  );
  const maxAttempts = isAutoRetry ? customMaxRetry : 1;

  // 1. Mobile / Capacitor Filesystem Download
  const tempFileName = `${fileName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`;

  if (!savedFile && Filesystem) {
    for (const dir of directoriesToTry) {
      if (savedFile) break;
      attempts = 0;
      while (attempts < maxAttempts && !savedFile) {
        if (checkCancelled()) {
          await cleanupTempFiles(fullPath, tempFileName, directoriesToTry);
          return { savedFile: null, successfulDir, cancelled: true };
        }
        attempts++;
        try {
          if (attempts > 1) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          const isBypassSsl =
            localStorage.getItem("lyra_bypass_ssl") === "true";
          const isForceIpv4 =
            localStorage.getItem("lyra_force_ipv4") === "true";

          const dlOpts = {
            url: actualDownloadUrl,
            path: fullPath + "/" + tempFileName,
            directory: dir,
            progress: true,
            headers: downloadHeaders,
          };
          if (isBypassSsl) dlOpts.disableSSLValidation = true;
          if (isForceIpv4) dlOpts.ipv4Only = true;

          const tempSaved = await Filesystem.downloadFile(dlOpts);
          if (tempSaved) {
            // Guard against saving 200-byte HTML 403 error pages as video files
            const stat = await Filesystem.stat({
              path: fullPath + "/" + tempFileName,
              directory: dir,
            }).catch(() => null);
            if (stat && typeof stat.size === "number" && stat.size > 0 && stat.size < 500) {
              await Filesystem.deleteFile({
                path: fullPath + "/" + tempFileName,
                directory: dir,
              }).catch(() => {});
              throw new Error(`Downloaded file too small (${stat.size} bytes), CDN access denied`);
            }

            onSaving?.();
            // Rename .tmp to actual file name atomically on completion
            try {
              await Filesystem.rename({
                from: fullPath + "/" + tempFileName,
                to: fullPath + "/" + fileName,
                directory: dir,
              });
              savedFile = { path: fullPath + "/" + fileName };
            } catch (_) {
              // Fallback copy if rename unsupported
              await Filesystem.copy({
                from: fullPath + "/" + tempFileName,
                to: fullPath + "/" + fileName,
                directory: dir,
              });
              await Filesystem.deleteFile({
                path: fullPath + "/" + tempFileName,
                directory: dir,
              }).catch(() => {});
              savedFile = { path: fullPath + "/" + fileName };
            }
            successfulDir = dir;
          }
        } catch (dlErr) {
          console.warn(
            `Download attempt ${attempts} on ${dir} failed:`,
            dlErr,
          );
          // Clean up leftover .tmp file on error
          await Filesystem.deleteFile({
            path: fullPath + "/" + tempFileName,
            directory: dir,
          }).catch(() => {});

          // Fallback to CapacitorHttp blob download if retries exhausted
          if (attempts >= maxAttempts && CapacitorHttp) {
            try {
              const httpRes = await CapacitorHttp.get({
                url: actualDownloadUrl,
                responseType: "blob",
                headers: downloadHeaders,
                connectTimeout: 20000,
                readTimeout: 30000,
              });
              let blobData = httpRes?.data;
              if (typeof Blob !== "undefined" && blobData instanceof Blob) {
                blobData = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () =>
                    resolve(String(reader.result).split(",")[1] || "");
                  reader.onerror = () => resolve("");
                  reader.readAsDataURL(blobData);
                });
              }
              if (
                httpRes &&
                (httpRes.status === 200 || httpRes.status === 206) &&
                blobData &&
                typeof blobData === "string" &&
                !blobData.startsWith("<!") &&
                !blobData.startsWith("<html")
              ) {
                onSaving?.();
                await Filesystem.writeFile({
                  path: fullPath + "/" + fileName,
                  data: blobData,
                  directory: dir,
                });
                savedFile = { path: fullPath + "/" + fileName };
                successfulDir = dir;
              }
            } catch (fallbackErr) {
              console.warn(
                `Http blob fallback on ${dir} failed:`,
                fallbackErr,
              );
            }
          }
        }
      }
    }
  }

  if (!savedFile) {
    if (checkCancelled()) {
      await cleanupTempFiles(fullPath, tempFileName, directoriesToTry);
      return { savedFile: null, successfulDir, cancelled: true };
    }
    await cleanupTempFiles(fullPath, tempFileName, directoriesToTry);
    throw new Error(
      translations[currentLang]?.["toast-download-failed"] || "Download failed",
    );
  }

  if (checkCancelled()) {
    await deleteSavedFile(savedFile, directoriesToTry);
    return { savedFile: null, successfulDir, cancelled: true };
  }

  return { savedFile, successfulDir, cancelled: false };
}
