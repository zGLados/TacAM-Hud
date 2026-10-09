import { useEffect } from 'react';
import { THEME_COLOR_KEYS } from '@tacam/shared';
import { useHud } from './state/store';
import { Layout } from './components/Layout';
import { SceneOverlay } from './scenes/Scenes';

/** Applies the theme from the control panel as CSS custom properties. */
function useTheme() {
  const theme = useHud((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement.style;
    for (const key of THEME_COLOR_KEYS) root.setProperty(`--color-${key}`, theme.colors[key]);
    root.setProperty('--radius', `${theme.borderRadius}px`);
    root.setProperty('--hud-font', theme.fontFamily);
  }, [theme]);
}

export function App() {
  useTheme();
  const scene = useHud((s) => s.scene.active);
  return (
    <>
      <div className={`hud ${scene === 'live' ? '' : 'is-scene-active'}`}>
        <Layout />
      </div>
      <SceneOverlay />
    </>
  );
}
