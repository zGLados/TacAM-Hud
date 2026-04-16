# TacAM HUD for CS2 (OpenHud)

A professional custom HUD for Counter-Strike 2, built for **[OpenHud](https://github.com/JohnTimmermann/OpenHud)**.

> **Standalone Version** - This HUD is pre-compiled and ready to use with OpenHud.  
> No build process or npm installation required! 🎉

## 🎮 Features

- 💪 **Health & Armor** display with effects
- 🔫 **Ammo display** (clip + reserve)
- 💰 **Money** with real-time updates
- ⏱️ **Round timer & bomb timer**
- 🏆 **Team scores** with customizable logos
- 💣 **Utility/grenades display**
- 📊 **Player statistics** (K/D/A)
- 🗺️ **Radar** with all CS2 maps
- ☠️ **Killfeed** with weapon icons
- 🎨 **TacAM branding** with customizable sponsor logos
- ⚙️ **Configurable** via OpenHud Admin Panel
- ⌨️ **Keybinds** support

## 📋 Requirements

- **OpenHud** Desktop App ([Download](https://github.com/JohnTimmermann/OpenHud/releases))
- **Counter-Strike 2**

**That's it!** No build tools, no Node.js, no dependencies required.

## 🚀 Installation

### Method 1: Use Complete Folder (Recommended)

1. **Download and install OpenHud**
2. **Copy the entire `TacAM-Hud` folder** to any location
3. **Open OpenHud** and go to HUD settings
4. **Select the TacAM-Hud folder** as custom HUD
5. **Done!** The HUD will load automatically

### Method 2: Copy to OpenHud Resources

1. Copy the complete `TacAM-Hud` folder to:
   ```
   OpenHud/resources/huds/TacAM-Hud/
   ```
2. Restart OpenHud
3. The HUD will appear in the HUD selection

### Method 3: As ZIP for Distribution

1. Pack the complete folder as ZIP
2. Distribute the ZIP file
3. Users can extract and use Method 1 or 2

## ⚙️ Configuration

The HUD can be configured via the **OpenHud Admin Panel**.

### Available Settings ([panel.json](panel.json)):

**Trivia:**
- Title & content for trivia displays
- Show/hide via action

**Display Settings:**
- Team names (left/right)
- Team logos
- Replace avatars with team logos
- Show/hide boxes
- Toggle radar view

**Player & Match Overview:**
- Show upcoming matches
- Player preview
- Tournament display

### Customize Sponsor Logos

Your sponsor logos are located in the [assets/sponsors/](assets/sponsors/) folder:

- `sponsor1.png` - First sponsor
- `sponsor2.png` - Second sponsor  
- `tacam_logo.png` - TacAM branding

Simply replace the PNG files with your own logos (recommended size: 512x512px).

The sponsor display is controlled by [assets/sponsors.js](assets/sponsors.js).

## ⌨️ Keybinds

The following keybinds are active by default (see [keybinds.json](keybinds.json)):

- **Alt + C** - Toggle camera feed
- **Alt + V** - Make radar bigger
- **Alt + B** - Make radar smaller

## 📁 Project Structure

```
TacAM-Hud/
├── index.html              # Main HTML file
├── hud.json                # HUD metadata
├── panel.json              # Admin panel configuration
├── keybinds.json           # Keybinds
├── thumb.png               # HUD thumbnail
├── assets/                 # All assets
│   ├── hud.js              # Compiled JavaScript code
│   ├── hud.css             # Styles (formatted)
│   ├── sponsors.js         # Sponsor logo system
│   ├── *.ttf               # Fonts (Montserrat, Louis George Cafe)
│   ├── *.png               # Icons, logos, radar maps
│   └── sponsors/           # Sponsor logos
│       ├── sponsor1.png
│       ├── sponsor2.png
│       └── tacam_logo.png
└── README.md               # This file
```

## 🎨 Customization

### Colors & Styling

The styling is in the [assets/hud.css](assets/hud.css) file, which is now formatted for easy editing. 

**For major style customizations:**
1. Clone the [OpenHud-TacAM Fork](https://github.com/zGLados/OpenHud-TacAM)
2. Edit the source files
3. Rebuild the HUD with `npm run build`
4. Copy the compiled files here

### Sponsor Logos

Simply replace the files in the `assets/sponsors/` folder:

```bash
# Replace with your own logos
cp my_sponsor1.png assets/sponsors/sponsor1.png
cp my_sponsor2.png assets/sponsors/sponsor2.png
cp my_logo.png assets/sponsors/tacam_logo.png
```

## 🔌 Using with OpenHud

1. **Start OpenHud**
2. **Open the Admin Panel** (browser opens automatically)
3. **Create teams & players** in the respective sections
4. **Create a match** and select the teams
5. **Start CS2** and join as **Spectator**
6. **Open the HUD view** in OpenHud
7. The HUD will automatically display all live data

### For OBS/Streaming:

Add a **Browser Source** in OBS with the URL:
```
http://localhost:1349/api/hud
```

Delete all Custom CSS from the browser source.

## 🐛 Troubleshooting

**Problem:** HUD is not displayed
- ✅ Make sure OpenHud is running
- ✅ Check if the HUD path is correct
- ✅ Restart OpenHud

**Problem:** No live data
- ✅ CS2 must be running and you must be a spectator
- ✅ Game State Integration is automatically set up by OpenHud
- ✅ Check the OpenHud console for errors

**Problem:** Sponsor logos not showing
- ✅ Make sure the PNG files exist
- ✅ Filenames must match exactly: `sponsor1.png`, `sponsor2.png`, `tacam_logo.png`
- ✅ Clear browser cache (Ctrl+F5)

## 📝 Credits

- **Developed by:** TacAM / zGLados
- **Based on:** [Lexogrine CS2 React HUD](https://github.com/lexogrine/cs2-react-hud)
- **For:** [OpenHud by JohnTimmermann](https://github.com/JohnTimmermann/OpenHud)
- **Source Code:** [OpenHud-TacAM Fork](https://github.com/zGLados/OpenHud-TacAM)

## 📄 License

Free to use for private and commercial purposes (streams, videos, etc.).  
Please give credits when redistributing.

## 🔗 Links

- **OpenHud:** https://github.com/JohnTimmermann/OpenHud
- **OpenHud Discord:** https://discord.gg/HApB9HyaWM
- **TacAM Fork:** https://github.com/zGLados/OpenHud-TacAM

---

**Have fun streaming! 🎮✨**
