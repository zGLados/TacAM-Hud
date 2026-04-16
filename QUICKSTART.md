# TacAM HUD - Quick Start

> **Standalone HUD** - No build process needed! Just use it directly. 🚀

## ⚡ Quick Start (3 Steps)

1. **Install OpenHud**
   - Download [OpenHud](https://github.com/JohnTimmermann/OpenHud/releases)
   - Install and start the app

2. **Add HUD**
   - Open OpenHud → HUD Settings
   - Select the `TacAM-Hud` folder
   - Done!

3. **Start CS2**
   - Start CS2
   - Join as **Spectator** in a match/demo
   - The HUD will automatically display all data

## 📁 Files Overview

| File | Description |
|------|-------------|
| `index.html` | Main HTML file (loaded by OpenHud) |
| `hud.json` | HUD metadata (name, version, author) |
| `panel.json` | Admin panel configuration |
| `keybinds.json` | Keybinds |
| `thumb.png` | HUD thumbnail (preview image) |
| `assets/` | All assets (JS, CSS, fonts, images) |

## 🎨 Customization

### Change Sponsor Logos

Replace the files in `assets/sponsors/`:
```bash
# Use your own logos
cp my_logo1.png assets/sponsors/sponsor1.png
cp my_logo2.png assets/sponsors/sponsor2.png
cp my_brand.png assets/sponsors/tacam_logo.png
```

### Configuration via OpenHud

All settings can be configured directly in the **OpenHud Admin Panel**:
- Team names & logos
- Player statistics
- Trivia displays
- Match overviews

## 🖥️ For OBS/Streaming

Add Browser Source in OBS:
```
URL: http://localhost:1349/api/hud
Width: 1920
Height: 1080
Custom CSS: (leave empty!)
```

## ⌨️ Keybinds

- **Alt + C** → Toggle camera feed
- **Alt + V** → Make radar bigger
- **Alt + B** → Make radar smaller

## 🆘 Problems?

**HUD not showing:**
- Restart OpenHud
- Correct HUD folder selected?
- Clear browser cache (Ctrl+F5)

**No live data:**
- Join CS2 as spectator
- Check OpenHud console for errors

## 🔗 Help & Support

- **OpenHud GitHub:** https://github.com/JohnTimmermann/OpenHud
- **OpenHud Discord:** https://discord.gg/HApB9HyaWM
- **TacAM Fork:** https://github.com/zGLados/OpenHud-TacAM

---

**Done! Custom HUDs can be this easy. 🎉**
