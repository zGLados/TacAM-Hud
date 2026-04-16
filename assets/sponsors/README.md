# Sponsor-Logos Setup

## So fügst du Sponsor-Logos hinzu:

### 1. TACAM Logo (statisch, links)
- Speichere dein TACAM Logo als: `tacam_logo.png` in diesem Ordner
- Wird in Graustufen angezeigt

### 2. Rotierende Sponsor-Logos (rechts)
- Speichere deine Sponsor-Logos als: 
  - `sponsor1.png`
  - `sponsor2.png`
  - `sponsor3.png`
  - `sponsor4.png`
  - usw.

### 3. Logos in sponsors.js registrieren
Öffne die Datei `../sponsors.js` und bearbeite diese Zeilen:

```javascript
const sponsorLogos = [
    './sponsors/sponsor1.png',
    './sponsors/sponsor2.png',
    './sponsors/sponsor3.png',
    './sponsors/sponsor4.png'
    // Füge hier weitere hinzu!
];
```

### Ein zusätzliches Logo hinzufügen?
1. Speichere z.B. `sponsor5.png` in diesem Ordner
2. Füge in `sponsors.js` eine neue Zeile hinzu:
   ```javascript
   './sponsors/sponsor5.png',
   ```

### Die Logos rotieren alle 10 Sekunden automatisch! 🎯

## Empfohlene Bildgrößen:
- **Breite**: 300-400px
- **Höhe**: 200-250px
- **Format**: PNG (mit transparentem Hintergrund)
