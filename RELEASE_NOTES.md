# 🎮 TacAM HUD v1.0.1 - Documentation Update

Critical documentation fix for proper OpenHud installation.

## ⚠️ IMPORTANT - Installation Change

This release fixes the installation instructions. The HUD folder **must be named `build`** to work with OpenHud.

### What Changed
- ✅ **Corrected installation instructions** - folder must be renamed to `build`
- ✅ **Updated README.md** with proper OpenHud integration steps
- ✅ **Updated QUICKSTART.md** with 4-step installation process
- ✅ **Enhanced troubleshooting** section with common issues

## 🚀 Correct Installation (Updated)

1. **Download and install OpenHud**
2. **Open OpenHud** → Settings → **"Open Directory"**  
   This opens the `OpenHud-Huds` folder
3. **Copy the `TacAM-Hud` folder** into this directory
4. **Rename it to `build`** ⚠️ (Critical!)
5. **Restart OpenHud**

### Why This Matters
OpenHud looks for a custom HUD in a folder named exactly `build` within the `OpenHud-Huds` directory. Previous documentation suggested incorrect folder names.

## 📋 What's Fixed in v1.0.1

### Documentation Updates
- Fixed installation method 1 (now uses "Open Directory" button)
- Fixed installation method 2 (correct path structure)
- Removed method 3 (incorrect approach)
- Added prominent warning about folder naming requirement
- Enhanced troubleshooting with folder name validation
- Referenced official OpenHud Issue #49

### No Code Changes
This is a documentation-only release. All HUD functionality remains the same as v1.0.0.

## 📖 Documentation

- [README.md](README.md) - Updated full documentation
- [QUICKSTART.md](QUICKSTART.md) - Updated quick installation guide
- [CHANGELOG.md](CHANGELOG.md) - Complete version history

## 🔄 Upgrading from v1.0.0

If you already have v1.0.0 installed:
1. Simply rename your HUD folder to `build`
2. Make sure it's in the `OpenHud-Huds` directory
3. Restart OpenHud

No need to re-download if you already have v1.0.0!

---

**Previous Release Notes: [v1.0.0](#-tacam-hud-v100---initial-release)**

---

# 🎮 TacAM HUD v1.0.0 - Initial Release

Professional Counter-Strike 2 HUD designed for **OpenHud** with TacAM branding.

## ✨ What's Included

### Core Features
- 🎯 **Professional HUD Interface** - Clean, modern design optimized for broadcasts and streaming
- 📡 **Real-time Integration** - Live game state updates via Socket.io
- 🗺️ **Integrated Radar** - Support for 9 official CS2 maps
- 🎨 **TacAM Branding** - Custom colors and logo integration
- 🖼️ **Sponsor System** - Rotating sponsor logo display with 3 slots

### Maps Supported
- Dust2, Mirage, Inferno, Nuke, Overpass, Vertigo, Ancient, Anubis, Train

### Keyboard Shortcuts
- `Alt+C` - Toggle camera view
- `Alt+V` - Enlarge radar
- `Alt+B` - Shrink radar

## 🚀 Quick Start

1. **Download** the latest release
2. **Extract** to your OpenHud HUD directory:
   - Windows: `%APPDATA%\OpenHud\HUDs\TacAM-Hud`
   - Linux: `~/.config/OpenHud/HUDs/TacAM-Hud`
3. **Select** "TacAM HUD" in OpenHud
4. **Launch** CS2 and start playing!

No build process required - just extract and use! ✅

## 📋 Requirements

- **OpenHud** v1.3.0 or higher
- **Counter-Strike 2** with Game State Integration enabled
- **Browser** (runs on localhost:1349)

## 🎨 Customization

- **Sponsor Logos**: Replace images in `assets/sponsors/`
- **Panel Settings**: Configure via OpenHud admin panel
- **Keybinds**: Edit `keybinds.json`

## 📦 What's New in v1.0.0

This is the initial release featuring:
- Complete HUD system with all assets
- Pre-compiled and optimized code
- Comprehensive documentation (README + QUICKSTART)
- Ready-to-use configuration files
- 15 font variants for perfect typography
- Professional radar integration

## 🛠️ Technical Details

- **React** 18.2.0 (pre-compiled)
- **Socket.io** for real-time communication
- **csgogsi** for game state integration
- Optimized CSS (2374 lines, formatted)
- Minified JavaScript (645KB)

## 📖 Documentation

- [README.md](README.md) - Full documentation
- [QUICKSTART.md](QUICKSTART.md) - Quick installation guide
- [CHANGELOG.md](CHANGELOG.md) - Version history

## 🙏 Credits

- **Based on**: Lexogrine HUD framework
- **OpenHud**: JohnTimmermann
- **Created for**: TacAM community

## 📝 Installation Notes

This HUD is **plug-and-play ready**:
- ✅ No Node.js required
- ✅ No build process needed
- ✅ No dependencies to install
- ✅ Just extract and go!

## 🐛 Troubleshooting

If you encounter issues:
1. Ensure OpenHud is running
2. Check that CS2 Game State Integration is enabled
3. Verify the HUD folder name is exactly `TacAM-Hud`
4. See the [README troubleshooting section](README.md#-troubleshooting) for more help

---

**Enjoy the HUD! 🎉**

For questions or support, please open an issue on GitHub.
