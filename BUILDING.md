# Building Church Presenter

This guide details the prerequisites, platform dependencies, build steps, and packaging configurations for **Church Presenter** on Linux and Windows.

---

## 1. System Requirements & Architecture

- **Desktop Framework**: Tauri 2 (Rust native core + system webview)
- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Rust (Edition 2021)
- **Database**: SQLite 3 via `rusqlite` (bundled, WAL mode, foreign keys enabled)
- **Target Platforms**:
  - **Linux**: Arch Linux / EndeavourOS, Ubuntu 22.04+, Debian 12+, Fedora 38+
  - **Windows**: Windows 10 (64-bit) & Windows 11 (64-bit)

---

## 2. Prerequisites (Cross-Platform)

1. **Node.js**: Version 20 LTS or higher (`node -v`, `npm -v`)
2. **Rust Toolchain**: Stable channel (`rustup default stable`, `cargo --version`)

---

## 3. Platform Native Dependencies

### Linux (Arch Linux & EndeavourOS)

Run the following command to install required compilation tools and GTK/WebKit libraries:

```bash
sudo pacman -S --needed \
  base-devel \
  webkit2gtk-4.1 \
  openssl \
  libxdo \
  libappindicator-gtk3 \
  librsvg
```

### Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Windows (Windows 10 / 11)

1. **Microsoft C++ Build Tools**:
   - Download Visual Studio 2022 Build Tools from [Visual Studio Downloads](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   - Select the workload: **"Desktop development with C++"**.
2. **WebView2 Runtime**:
   - Pre-installed by default on modern Windows 10 and Windows 11.
   - If missing, download the Evergreen Bootstrapper from Microsoft.
3. **Packaging Bundlers**:
   - Tauri 2 bundles Windows installers using **NSIS** (`.exe`) and **WiX Toolset** (`.msi`).
   - NSIS is automatically downloaded by the Tauri CLI during `npm run tauri build`.
   - For MSI builds, install WiX Toolset v3.11 from [wixtoolset.org](https://wixtoolset.org/).

---

## 4. Development Workflow

### Install Dependencies
```bash
npm install
```

### Run Automated Tests
```bash
# Frontend test suite (Vitest)
npm test -- --run

# Rust backend tests
cargo test --manifest-path src-tauri/Cargo.toml
```

### Run Live Desktop App in Development Mode
```bash
npm run tauri dev
```
This spins up the Vite development server with HMR and opens the desktop operator window.

---

## 5. Production Release Packaging

### Building the Release Bundle

Run:
```bash
npm run tauri build
```

This performs:
1. `npm run build` (`tsc && vite build`) to generate optimized web assets in `dist/`.
2. Cargo compilation in release mode (`--release`) with Link-Time Optimization (LTO).
3. Creation of native OS installer bundles with application metadata, icons, and capability permissions.

### Output Locations

#### Linux
- **AppImage**: `src-tauri/target/release/bundle/appimage/church-presenter_1.0.0_amd64.AppImage`
- **Debian Package**: `src-tauri/target/release/bundle/deb/church-presenter_1.0.0_amd64.deb`

#### Windows
- **NSIS Executable**: `src-tauri/target/release/bundle/nsis/church-presenter_1.0.0_x64-setup.exe`
- **MSI Installer**: `src-tauri/target/release/bundle/msi/church-presenter_1.0.0_x64_en-US.msi`

---

## 6. Icon Assets & Visual Packaging

Tauri requires multi-resolution icon assets for taskbars, docks, and system trays:
- `src-tauri/icons/32x32.png` — 32×32 window icon
- `src-tauri/icons/128x128.png` — 128×128 standard icon
- `src-tauri/icons/128x128@2x.png` — 256×256 high-DPI icon
- `src-tauri/icons/icon.png` — 512×512 Linux desktop entry icon
- `src-tauri/icons/icon.ico` — Valid multi-resolution Windows icon (embedded resolutions: 256, 128, 64, 48, 32, 16)

---

## 7. Continuous Integration

Automated builds and tests run on every commit across both Ubuntu and Windows via GitHub Actions:
- Configuration: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Steps executed:
  1. `npm ci`
  2. `npm test -- --run`
  3. `npm run build`
  4. `cargo check --manifest-path src-tauri/Cargo.toml`
  5. `cargo test --manifest-path src-tauri/Cargo.toml`
