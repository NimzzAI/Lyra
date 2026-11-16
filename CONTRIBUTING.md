# Contributing to Lyra

Thank you for your interest in contributing to **Lyra**! Whether you want to fix bugs, add UI features, expand language translations, or improve documentation, your help is welcome.

---

## 📋 Table of Contents

1. [Code of Conduct & Etiquette](#-code-of-conduct--etiquette)
2. [How Can I Contribute?](#-how-can-i-contribute)
3. [Development & Build Guide](#-development--build-guide)
   * [Prerequisites](#prerequisites)
   * [Initial Setup](#initial-setup)
   * [Building for Android](#-building-for-android)
   * [Building for iOS](#-building-for-ios)
   * [Building for Desktop (Windows, Linux, macOS)](#-building-for-desktop-windows-linux-macos)
4. [Architecture & Scraper Engine](#-architecture--scraper-engine)
5. [Contributing Translations (i18n)](#-contributing-translations-i18n)
6. [CSS & Styling Architecture](#-css--styling-architecture-publiccss)
7. [Submitting a Pull Request](#-submitting-a-pull-request)

---

## 🤝 Code of Conduct & Etiquette

* **Be Respectful**: Treat everyone in the community with courtesy and respect.
* **Keep it Clean**: Lyra is a free, ad-free, and tracker-free application. We will strictly reject any PR that introduces telemetry, ads, trackers, or monetization schemes.
* **Respect Copyleft**: Lyra is licensed under **GPL-3.0**. All code contributions must honor this copyleft license.

---

## 💡 How Can I Contribute?

### 1. Reporting Bugs & Requesting Features
* Check existing [GitHub Issues](https://github.com/Nimzz/Lyra/issues) before opening a new one to prevent duplicates.
* Clearly specify your **Platform & OS version** (Android / macOS / Windows / iOS), **Lyra Version**, and the **Source URL** causing the error.

### 2. Translating & Localization (`public/js/i18n/`)
Lyra supports 9 languages (English, Indonesian, Japanese, Korean, Simplified Chinese, Arabic with RTL, Russian, Tagalog, and Hindi). If you want to refine translations or add a new locale, edit the dictionary files in `public/js/i18n/`.

### 3. Frontend & UI Enhancements
Feel free to refine the CSS design system, optimize LyraPlayer controls, enhance glassmorphism effects, or add responsive styling.

---

## 🛠️ Development & Build Guide

### Prerequisites

* **Node.js**: `v18.x` or higher (Node `v20+` recommended)
* **npm**: `v9.x` or higher
* **Git**: Installed and configured

#### Platform-Specific Requirements:
* **Android**: Android Studio, Android SDK (API 36 platform), JDK 21. No NDK is required.
* **iOS**: macOS with Xcode 15+ and CocoaPods (`gem install cocoapods`).
* **Desktop**: Node.js 20+. Windows installers are built on Windows, `.dmg` files on macOS, and `.AppImage`/`.deb` on Linux.

---

### Initial Setup

1. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Lyra.git
   cd Lyra
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

### 📱 Building for Android

Lyra uses **CapacitorJS** paired with a native **OkHttp** bridge (`MainActivity.java`) to handle network requests and bypass WebView CORS restrictions. The minimum supported version is Android 7.0 (API 24); Android 10 (API 29) is part of the supported range, so keep every new API call behind a `Build.VERSION.SDK_INT` check.

#### Single-Command Build

```bash
# Build Debug APK
npm run build:android

# Build Signed Release APK (uses the bundled android/app/lyra.jks)
npm run build:android:release
```

Output location: `android/app/build/outputs/apk/{debug|release}/Lyra v{VERSION}.apk`

To check Android 10 behaviour, create an emulator with a **Android 10 (API 29)** system image, install the debug APK, and launch it. CI repeats this on every build with `.github/scripts/android-smoke.sh`.

#### Manual Build Steps

```bash
# 1. Sync web assets to Android
npx cap sync android

# 2. Compile via Gradle
cd android
./gradlew assembleRelease
```

#### Signing

The repository ships a signing key at `android/app/lyra.jks` (alias `lyra`, password `android123`) and `android/app/build.gradle` uses it for both debug and release builds. Because the key is committed, no secrets are needed: every local or GitHub Actions build is signed with the same key and can update an earlier install.

The key is public by design, so anyone could sign an APK with it. If you distribute Lyra widely and want a private key, generate your own with `keytool -genkeypair -keystore android/app/lyra.jks -alias lyra -keyalg RSA -keysize 2048 -validity 36500`, update the passwords in `build.gradle`, and keep the new file out of the repository.

---

### 🍎 Building for iOS

#### Running on Simulator or Physical Device

```bash
# 1. Sync web assets & CocoaPods dependencies
npx cap sync ios

# 2. Open Xcode workspace
npx cap open ios

# 3. Select target device and press Run (Cmd + R)
```

#### Building Unsigned IPA (For Sideloading via AltStore / TrollStore)

```bash
# Single-command build
npm run build:ios:ipa
```

**Manual steps:**
```bash
# 1. Sync assets
npx cap sync ios

# 2. Compile archive without code signing
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -sdk iphoneos -archivePath build/Lyra.xcarchive archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""

# 3. Package into IPA
mkdir -p Payload && cp -r build/Lyra.xcarchive/Products/Applications/App.app Payload/
zip -r "Lyra.ipa" Payload && rm -rf Payload build
```

---

### 🖥️ Building for Desktop (Windows, Linux, macOS)

The desktop app is an Electron wrapper around the same `public/` web UI.

```bash
# Install desktop dependencies (once)
npm run desktop:install

# Run in development
npm run desktop:dev

# Build installers (run each on its own operating system)
npm run desktop:build:win     # NSIS installer + portable .exe
npm run desktop:build:linux   # AppImage + deb
npm run desktop:build:mac     # dmg + zip (Intel and Apple Silicon)
```

Installers are written to `desktop/dist/`.

How it works:
* `desktop/main.js` serves `public/` from a privileged `lyra://app/` origin and exposes IPC handlers; local media is streamed through `lyra://file/` with an extension allow-list.
* `desktop/preload.js` exposes a minimal `window.lyraDesktop` API with context isolation and sandboxing enabled.
* `public/js/platform/desktop.js` registers a Capacitor-compatible `window.Capacitor` (platform `electron`) so the app code can keep calling `Filesystem`, `CapacitorHttp`, `Clipboard`, `Share`, `App`, and `Network`. Cross-origin `fetch` calls are routed through the Node HTTP client, so no CORS workarounds are needed.
* `desktop/lib/paths.js` maps Android-style relative paths such as `Download/Lyra` to the user's real Downloads, Music, Pictures, and Videos folders; absolute paths chosen with the folder picker are used as-is.

Self-check: `LYRA_SMOKE_TEST=1 npx electron desktop --no-sandbox` loads the UI, performs a filesystem round-trip, and exits with code 0 on success. CI runs it under Xvfb before building installers.

When bumping the version, update `package.json`, `desktop/package.json`, `android/app/build.gradle`, `public/js/modules/core.js`, and the iOS `MARKETING_VERSION`.

---

## ⚙️ Architecture & Scraper Engine

* **Frontend**: Vanilla ES6 JavaScript + modern CSS design system located in `public/`.
* **Scraper Runtime**: The core scraping engine is compiled via esbuild into `public/js/scrapers/bundle.js` as an IIFE bundle containing all 16 platform engines.
* **HTTP Layer**: Cross-origin requests are routed through `public/js/scrapers/httpHelper.js`, utilizing native OkHttp on Android, the Capacitor HTTP plugin on iOS, and a Node.js HTTP client in the Electron main process on desktop to bypass CORS.

> [!NOTE]
> **Scraper Core Contributions**: Lyra ships the precompiled `public/js/scrapers/bundle.js` inherited from the upstream Mori project; the original scraper sources are not part of this repository. If an endpoint breaks, open an issue or a PR describing the fix and, where possible, patch the bundle or the wrappers in `public/js/scrapers/`.

---

## 🌐 Contributing Translations (i18n)

Lyra supports multiple languages out-of-the-box (`en`, `id`, `ja`, `ko`, `zh`, `ar`, `ru`, `tl`, `hi`). All language strings are modularized into individual locale files located in:

```
public/js/i18n/
├── locales/
│   ├── en.js        # English (Source of Truth / Fallback)
│   ├── id.js        # Bahasa Indonesia
│   ├── ja.js        # 日本語 (Japanese)
│   ├── ko.js        # 한국어 (Korean)
│   ├── zh.js        # 中文 (Simplified Chinese)
│   ├── ar.js        # العربية (Arabic with RTL)
│   ├── ru.js        # Русский (Russian)
│   ├── tl.js        # Tagalog (Filipino)
│   └── hi.js        # हिन्दी (Hindi)
└── index.js         # Translation registry & fallback helper
```

### Improving an Existing Language
1. Open the relevant file in `public/js/i18n/locales/<lang>.js`.
2. Update the translation value for the desired key.
3. Verify the changes by switching to that language in Lyra Settings.

### Adding a New Language
1. Create a new locale file in `public/js/i18n/locales/<new_code>.js` (e.g. `es.js` for Spanish).
2. Copy the key structure from `en.js` and translate the values.
3. Import and register the new locale in `public/js/i18n/index.js`:
   ```javascript
   import es from "./locales/es.js";
   export const translations = { ..., es };
   ```
4. Add the language name to `langNames` in `public/js/modules/settings/language.js` and the language option in `public/index.html`.

> [!TIP]
> **Safe Fallback**: If a key is not yet translated in your locale, Lyra automatically falls back to English (`en`), preventing blank text or broken UI.

---

## 🎨 CSS & Styling Architecture (`public/css/`)

Lyra's stylesheet is modularized into domain-focused files under `public/css/`:

```
public/css/
├── variables.css    # Design tokens, themes (dark/light), font, speed, glass, corner presets
├── base.css         # Reset, body typography, layout wrappers, bottom navigation
├── components.css   # Reusable buttons, custom toasts, floating progress toasts, badges
├── home.css         # Main URL input bar, batch input, skeleton loader, media cards
├── history.css      # History items, summary stats card, thumbnail overlay & spinners
├── settings.css     # Menu lists, subpage slide transitions, dropdowns, live BG controls
├── modals.css       # Universal modal backdrops, PIN keypad, guide, confirm, batch modal
├── rtl.css          # Right-to-Left (RTL) overrides for Arabic layout
└── style.css        # Master stylesheet entry point importing all modules
```

When modifying styles:
- Edit the specific component/page file instead of cluttering a single file.
- Design tokens and CSS custom properties live in `variables.css`.
- Ensure all interactive controls support both dark and light themes.

---

## 🚀 Submitting a Pull Request

1. Fork the repo and create a descriptive branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Keep your commits clean and follow conventional commit syntax (`feat: ...`, `fix: ...`, `docs: ...`).
3. Ensure the project builds cleanly without lint or syntax errors.
4. Push to your fork and submit a Pull Request to `main`.
5. Describe what your PR changes, why it is needed, and how it was verified.

---

Developed by Nimzz.  
GitHub: https://github.com/Nimzz  
Based on Mori by coflyn: https://github.com/coflyn/Mori
