# TacAM HUD for CS2

A professional custom HUD for Counter-Strike 2, built for **[JTs Hud Manager](https://github.com/JohnTimmermann/JTs-Hud-Manager)** (formerly OpenHud).

> **Standalone Version** - This HUD is pre-compiled and ready to use with JTs Hud Manager.  
> No build process or npm installation required! 🎉

## 🎮 Features

- 💪 **Health & Armor** display with effects
- 🔫 **Ammo display** (clip + reserve)
- 💰 **Money** with real-time updates
- ⏱️ **Round timer & bomb timer**
- 🏆 **Team scores** with customizable logos
- 💣 **Utility/grenades display**
- 📊 **Player statistics** (K/D/A)
- 🗺️ **Radar** with all 10 CS2 maps (Mirage, Cache, Dust2, Inferno, Train, Overpass, Nuke, Vertigo, Ancient, Anubis)
- ☠️ **Killfeed** with weapon icons
- 🎨 **TacAM branding** with customizable sponsor logos
- ⚙️ **Configurable** via HUD Panel
- ⌨️ **Keybinds** support (Alt+V/B for radar size, Alt+C for camera toggle)
- 📱 **Responsive design** for different streaming layouts

## 📋 Requirements

- **JTs Hud Manager** Desktop App ([Download](https://github.com/JohnTimmermann/JTs-Hud-Manager/releases))
- **Counter-Strike 2**

**That's it!** No build tools, no Node.js, no dependencies required.

## 🚀 Installation

### Method 1: Import as ZIP (Recommended)

1. **Download JTs Hud Manager** from the [releases page](https://github.com/JohnTimmermann/JTs-Hud-Manager/releases/latest)
2. **Create a ZIP file** of the entire TacAM-Hud folder
   - The ZIP should contain all files at the root level:
     - `hud.json`
     - `index.html`
     - `assets/` folder
     - `panel.json`
     - `keybinds.json`
     - `thumb.png`
3. **Open JTs Hud Manager** → Go to the **HUDs** tab
4. **Click "Import HUD"**
5. **Select your TacAM-Hud.zip file**
6. **Done!** The HUD will appear in your HUDs list

### Method 2: Manual Installation (Advanced)

For direct installation into the JTs Hud Manager directory:

1. **Open JTs Hud Manager** → Settings → Find the HUDs directory path
2. **Copy the entire `TacAM-Hud` folder** into the HUDs directory
3. **Restart JTs Hud Manager**
4. The HUD will appear in your HUDs list

## ⌨️ Keybinds

The following keyboard shortcuts are available when the HUD is active:

| Keybind | Action | Scope |
|---------|--------|-------|
| `Alt+V` | Increase radar size | HUD-specific |
| `Alt+B` | Decrease radar size | HUD-specific |
| `Alt+C` | Toggle camera feed | HUD-specific |
| `Alt+R` | Toggle reverse sides | Global (JTs Hud Manager) |
| `Alt+F` | Force-refresh all HUD overlays | Global (JTs Hud Manager) |

## 🎨 Customization

### Panel Settings

Access the HUD Panel from JTs Hud Manager to customize:

**Trivia Section:**
- Title & content for trivia displays
- Show/hide trivia overlay

**Display Settings:**
- Left/right team box titles and subtitles
- Team logos (uploadable images)
- Avatar replacement options
- Show/hide boxes
- Toggle radar view

**Player & Match Overview:**
- Display upcoming matches
- Show player preview
- Tournament information display

### Sponsor Logos

Your sponsor logos are located in the [assets/sponsors/](assets/sponsors/) folder:

- `sponsor1.png` - First rotating sponsor
- `sponsor2.png` - Second rotating sponsor  
- `tacam_logo.png` - TacAM static branding (shown in grayscale)

**To customize:**
1. Replace the PNG files with your own logos
2. Recommended size: 512x512px with transparent background
3. The sponsors rotate every 10 seconds
4. Edit [assets/sponsors/sponsors.js](assets/sponsors/sponsors.js) to add more sponsors

### Colors & Styling

All styling is in [assets/hud.css](assets/hud.css), which is formatted and readable.

**Key CSS variables (in `:root`):**
```css
--primary: #c13a3a;                     /* Primary red color */
--color-new-ct: rgba(26, 58, 92, 1);   /* CT blue */
--color-new-t: rgba(193, 58, 58, 1);   /* T red */
--sub-panel-color: rgba(47, 51, 56, 0.83); /* Background gray */
```

You can directly edit the CSS file to change colors, sizes, and positions.

## 📁 Project Structure

```
TacAM-Hud/
├── index.html              # Main HTML entry point
├── hud.json                # HUD metadata (name, version, author)
├── panel.json              # Panel configuration schema
├── keybinds.json           # Keybinds configuration
├── thumb.png               # HUD thumbnail (shown in JTs Hud Manager)
├── assets/                 # All asset files
│   ├── hud.js              # Main HUD logic (~20,000 lines, beautified)
│   ├── hud.css             # Styles (formatted for readability)
│   ├── Montserrat-*.ttf    # Montserrat font family (13 variants)
│   ├── Louis_George_Cafe.ttf  # Louis George Cafe font
│   ├── Rounded_Elegance.ttf   # Rounded Elegance font
│   ├── radar-*.png         # Radar images for all 10 maps
│   ├── bomb.png            # Bomb icon
│   ├── flash_assist.png    # Flash assist icon
│   ├── logo_*.png          # Default team logos (CT/T)
│   ├── player_*.png        # Default player avatars (CT/T)
│   └── sponsors/           # Sponsor logo system
│       ├── sponsors.js     # Sponsor rotation logic
│       ├── sponsor1.png    # First sponsor logo
│       ├── sponsor2.png    # Second sponsor logo
│       ├── tacam_logo.png  # TacAM branding
│       └── README.md       # Sponsor folder documentation
├── README.md               # This file
├── CHANGELOG.md            # Version history
├── QUICKSTART.md           # Quick setup guide
└── RELEASE_NOTES.md        # Release notes
```

## 🗺️ Supported Maps

The HUD includes radar overlays for all 10 active CS2 competitive maps:

- ✅ Mirage
- ✅ Cache
- ✅ Dust2
- ✅ Inferno
- ✅ Train (updated to latest version)
- ✅ Overpass
- ✅ Nuke (dual-level support)
- ✅ Vertigo (dual-level support)
- ✅ Ancient
- ✅ Anubis

All radar configurations imported from OpenHud with correct coordinates and scaling.

## 🔧 Technical Details

### Built With
- **React 18.2.0** - UI framework
- **Socket.io** - Real-time GSI data connection
- **Vite** - Build tool (for development)
- **CS2 GSI** - Game State Integration for live data

### Code Quality
- ✅ Beautified and formatted with Prettier
- ✅ Descriptive variable names (no minified code)
- ✅ ~20,000 lines of readable JavaScript
- ✅ Organized CSS with clear class names
- ✅ No build errors or warnings

### Compatibility
- ✅ Compatible with [cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) template spec
- ✅ Works with JTs Hud Manager v5.2.26+
- ✅ Backward compatible with OpenHud (legacy)
- ✅ Supports signed HUD verification

## 📝 Changelog

### Version 1.1.0 (Latest)
- 🎨 Code modernization and beautification
- 📝 Renamed all variables from minified to descriptive names
- 🗂️ Renamed 31 asset files from hash-based to descriptive names
- 🔧 Fixed sponsor box background color consistency
- 🐛 Fixed variable collision bugs
- 📁 Reorganized sponsor files into dedicated folder
- ✅ Fully compatible with JTs Hud Manager

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## 🤝 Contributing

Contributions are welcome! If you'd like to improve the HUD:

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the GPL-3.0 License - see the LICENSE file for details.

## 🙏 Credits

- **JTs Hud Manager** by [John Timmermann](https://github.com/JohnTimmermann)
- **Lexogrine** for the [cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) template
- **OpenHud** community for radar coordinates and testing
- **TacAM** for the original HUD design and branding

## 🔗 Links

- [JTs Hud Manager](https://github.com/JohnTimmermann/JTs-Hud-Manager)
- [JTs Hud Manager Discord](https://discord.gg/HApB9HyaWM)
- [cs2-react-hud Template](https://github.com/lexogrine/cs2-react-hud)

## 💬 Support

Having issues? Join the [JTs Hud Manager Discord](https://discord.gg/HApB9HyaWM) for help!

---

**Made with ❤️ by TacAM**
