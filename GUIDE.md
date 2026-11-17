# Lyra Installation & User Guide

This guide covers everything you need to know about installing, sideloading, troubleshooting, and getting the most out of Lyra on Android, iOS, and desktop (Windows, Linux, macOS).

---

## 📥 Download Official Releases

Always download official Lyra release binaries directly from the **[GitHub Releases](https://github.com/NimzzAI/Lyra/releases)** page.

| Platform | Recommended Asset | Installation Method |
| :--- | :--- | :--- |
| **Android** | `Lyra-v{VERSION}-arm64-v8a.apk` (or `armeabi-v7a` / `x86_64` / `universal`) | Direct sideload / install |
| **iOS** | `Lyra-v{VERSION}-iOS-Unsigned.ipa` | Sideload (AltStore / TrollStore / Scarlet) |
| **Windows** | `Lyra-v{VERSION}-Windows-x64-Setup.exe` or `...-Portable.exe` | Run the installer, or run the portable file directly |
| **Linux** | `Lyra-v{VERSION}-Linux-x64.AppImage` or `.deb` | Make the AppImage executable, or install the package |
| **macOS** | `Lyra-v{VERSION}-macOS-arm64.dmg` (Apple Silicon) or `...-x64.dmg` (Intel) | Drag Lyra into Applications |

---

## 📱 Android Installation & Troubleshooting

### Standard Installation
1. Download `Lyra-v{VERSION}-arm64-v8a.apk` (or `armeabi-v7a` / `x86_64` / `universal`) on your phone.
2. Open the downloaded APK and tap **Install**.
3. Grant storage permissions when prompted so Lyra can save media to your device.

### Android 10 and older devices
Lyra supports Android 7.0 and newer, including Android 10.
* Lyra needs **Android System WebView** (Chrome 85 or newer). Android 10 phones normally update it through Google Play. If Lyra shows an "Update Android System WebView" notice, open Google Play, update **Android System WebView** and **Google Chrome**, then reopen Lyra.
* When asked for storage access, choose **Allow**. Android 10 saves to `Download/Lyra` by default.
* If the install is blocked, enable **Install unknown apps** for your browser or file manager in system settings.

### "Blocked by Play Protect" Warning
Because Lyra is an open-source application distributed outside the Google Play Store without commercial certificates, Google Play Protect may display an advisory prompt:
1. Tap **"More Details"**.
2. Tap **"Install Anyway"**.
3. *(Optional)* Scan the `.apk` on **[VirusTotal](https://www.virustotal.com/)** for complete peace of mind.

---

## 💻 Desktop (Windows, Linux, macOS)

Desktop builds are unsigned, so each system shows a one-time warning on first launch.

### Windows
1. Download `Lyra-v{VERSION}-Windows-x64-Setup.exe` (installer) or `...-Portable.exe` (no installation).
2. If SmartScreen shows "Windows protected your PC", click **More info** then **Run anyway**.

### Linux
* **AppImage**:
  ```bash
  chmod +x Lyra-v{VERSION}-Linux-x64.AppImage
  ./Lyra-v{VERSION}-Linux-x64.AppImage
  ```
  If it fails with a sandbox error on a distribution that restricts user namespaces (for example Ubuntu 24.04), start it with `--no-sandbox`.
* **Debian / Ubuntu**:
  ```bash
  sudo apt install ./Lyra-v{VERSION}-Linux-x64.deb
  ```

### macOS
1. Open the `.dmg` and drag **Lyra** into **Applications**.
2. On first launch, right-click Lyra and choose **Open**. If macOS says the app is damaged, run:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Lyra.app
   ```

### Using Lyra on desktop
* Files are saved to `Downloads/Lyra` (videos, photos) and `Music/Lyra` (audio) in your home folder. Change this in **Settings** → **Storage & Download** with the **Browse Folder** button.
* Paste a link, or start Lyra with a link: `Lyra https://...`, or open a `lyra://open?url=<link>` URL.
* Not available on desktop: Share-sheet Quick Save, background service notifications, biometric lock (PIN lock works), haptics, and the live Media Sniffer browser.

---

## 📲 iOS Sideloading Guide

Since Lyra is not distributed on the Apple App Store, iOS users can install `Lyra-v{VERSION}-iOS-Unsigned.ipa` using any of the following sideloading tools:

### Option 1: AltStore / Sideloadly (Recommended for all iOS versions)
* **Best for:** Devices running any modern iOS version without jailbreak.
* **Requirements:** A PC or Mac for initial installation.
* **Steps:**
  1. Install [AltStore](https://altstore.io/) or [Sideloadly](https://sideloadly.io/) on your computer.
  2. Download `Lyra-v{VERSION}-iOS-Unsigned.ipa`.
  3. Connect your iPhone via USB and select the IPA to install with your free Apple ID.
  4. *Note:* App signatures refresh every 7 days automatically when on the same Wi-Fi.

### Option 2: TrollStore (Permanent - No Expire)
* **Best for:** Compatible iOS versions (iOS 14.0 – 16.6.1 / 17.0).
* **Steps:**
  1. Open the downloaded `Lyra-v{VERSION}-iOS-Unsigned.ipa` directly in TrollStore.
  2. Tap **Install**. It installs permanently without 7-day expiration or computer refresh.

### Option 3: Scarlet / Esign (On-Device Direct Install)
* **Best for:** Direct installation without a PC using enterprise developer certificates.
* **Steps:**
  1. Open Scarlet or Esign on your iPhone.
  2. Import `Lyra-v{VERSION}-iOS-Unsigned.ipa` and tap **Sign & Install**.

---

## 💡 How to Use Lyra

1. **One-Tap Download**:
   - Copy a video/photo/music link from any of the 16 supported platforms.
   - Open Lyra (or tap the **Paste** button). Lyra auto-detects copied links.
   - Tap **Analyze** → Choose format/quality → Tap **Download**.
2. **Quick Save via Share Menu (Android)**:
   - In TikTok, Instagram, or YouTube, tap **Share** → Select **Lyra**.
   - Lyra opens a quick overlay to download the media without leaving your current app.
3. **Multi-Link Batch Mode**:
   - Paste several URLs (separated by newlines or spaces) in the input box.
   - Lyra queues and analyzes them automatically.
4. **Download Entire Playlists / Albums**:
   - Paste a Spotify, Apple Music, or YouTube playlist link.
   - Tap **Download All** to download all tracks in sequence with automatic retry for failed items.
5. **Photo-to-PDF Gallery Export**:
   - When viewing a multi-photo post (Instagram, TikTok Slides, RedNote), select **Combine into Single PDF** to export the entire album into a single PDF document.
6. **Privacy PIN & Biometric Lock**:
   - Go to **Settings** → **General** → **App Lock**.
   - Set a 4-digit PIN or enable Fingerprint / Face ID to keep your downloads private.

---

## 🔒 Safety & Privacy Verification

Lyra is **100% ad-free, open-source, and contains zero trackers or telemetry**.
* All parsing, HTTP requests, and file saving execute **directly on your device**.
* No data is sent to external servers or third parties.
* You can scan any binary on **[VirusTotal](https://www.virustotal.com/)** before installation.

---

Developed by Nimzz.  
GitHub: https://github.com/NimzzAI  
Based on Mori by coflyn: https://github.com/coflyn/Mori


## yt-dlp (Android)

Open **Tools > yt-dlp Downloader**, paste a link, tap **Fetch info**, choose video or audio and a quality, then **Download**. Files land in `Download/Lyra`. If a site stops working, open **Settings > yt-dlp** and tap **Update**. Sites that need a login can use a `cookies.txt` exported from your browser (Settings > yt-dlp > Accounts). Not sure which APK to install? Pick `universal`; it is larger but works everywhere.
