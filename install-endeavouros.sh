#!/usr/bin/env bash
set -e

# Church Presenter — EndeavourOS / Arch Linux Installation Script
echo "=========================================================="
echo "    Church Presenter — EndeavourOS / Arch Linux Installer"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DEST="$HOME/.local/bin"
ICON_DEST="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DEST="$HOME/.local/share/applications"

# Ensure nvm or modern node is in PATH if present
if [ -d "$HOME/.nvm/versions/node/v24.21.0/bin" ]; then
    export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
fi

echo "1. Checking build prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Run: sudo pacman -S nodejs npm"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "❌ Rust/Cargo is required. Run: sudo pacman -S rust"; exit 1; }

echo "2. Building frontend production assets..."
cd "$APP_DIR"
npm run build

echo "3. Compiling native release binary with Cargo..."
cargo build --release --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

echo "4. Installing binary to $BIN_DEST..."
mkdir -p "$BIN_DEST"
cp "$APP_DIR/src-tauri/target/release/church-presenter" "$BIN_DEST/church-presenter"
chmod +x "$BIN_DEST/church-presenter"

echo "5. Installing application icon to $ICON_DEST..."
mkdir -p "$ICON_DEST"
if [ -f "$APP_DIR/src-tauri/icons/icon.png" ]; then
    cp "$APP_DIR/src-tauri/icons/icon.png" "$ICON_DEST/church-presenter.png"
fi

echo "6. Creating desktop launcher entry in $DESKTOP_DEST..."
mkdir -p "$DESKTOP_DEST"
cat << 'EOF' > "$DESKTOP_DEST/church-presenter.desktop"
[Desktop Entry]
Type=Application
Name=Church Presenter
GenericName=Presentation Software
Comment=Offline church presentation, worship lyrics, and live production software
Exec=church-presenter
Icon=church-presenter
Terminal=false
Categories=AudioVideo;Presentation;Video;
StartupWMClass=church-presenter
EOF

# Update desktop application database if utility exists
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DEST" >/dev/null 2>&1 || true
fi

echo ""
echo "=========================================================="
echo "✅ Church Presenter successfully installed!"
echo "   - Binary location:  $BIN_DEST/church-presenter"
echo "   - Desktop launcher: $DESKTOP_DEST/church-presenter.desktop"
echo "   - You can launch it directly from your application launcher"
echo "     (Rofi / Wofi / KDE Application Launcher / GNOME App Grid)"
echo "     or by typing 'church-presenter' in your terminal."
echo "=========================================================="
