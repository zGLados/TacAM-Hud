import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, connectLive, useLive } from './api';
import { ToastProvider } from './components/ui';
import { LivePage } from './pages/LivePage';
import { DirectorPage } from './pages/DirectorPage';
import { PlayersPage } from './pages/PlayersPage';
import { TeamsPage } from './pages/TeamsPage';
import { MatchesPage } from './pages/MatchesPage';
import { StatsPage } from './pages/StatsPage';
import { ThemePage } from './pages/ThemePage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV: { group: string; items: { to: string; label: string }[] }[] = [
  {
    group: 'Broadcast',
    items: [
      { to: '/live', label: 'Live' },
      { to: '/director', label: 'Director' },
      { to: '/stats', label: 'Stats' },
    ],
  },
  {
    group: 'Data',
    items: [
      { to: '/matches', label: 'Matches' },
      { to: '/teams', label: 'Teams' },
      { to: '/players', label: 'Players' },
    ],
  },
  {
    group: 'Setup',
    items: [
      { to: '/theme', label: 'Theme' },
      { to: '/integrations', label: 'Integrations' },
      { to: '/settings', label: 'Settings' },
    ],
  },
];

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="login">
      <form
        className="card login_card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.auth.login(pin);
            onSuccess();
          } catch {
            setError('Wrong PIN or LAN access disabled');
          }
        }}
      >
        <div className="brand big">
          TacAM <span>HUD</span>
        </div>
        <p className="muted">Access from another device – please enter the PIN.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="PIN" autoFocus />
        {error && <p className="error">{error}</p>}
        <button className="button primary" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}

function Shell() {
  const connected = useLive((s) => s.connected);
  const gsi = useLive((s) => s.status?.connected ?? false);
  const scene = useLive((s) => s.scene?.active);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          TacAM <span>HUD</span>
        </div>
        <nav>
          {NAV.map(({ group, items }) => (
            <div key={group} className="nav_group">
              <div className="nav_group_title">{group}</div>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav_link ${isActive ? 'active' : ''}`}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar_footer">
          <div className={`dot ${connected ? 'ok' : 'off'}`}>Server</div>
          <div className={`dot ${gsi ? 'ok' : 'off'}`}>CS2 / GSI</div>
          {scene && scene !== 'live' && <div className="dot warn">Scene: {scene}</div>}
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/live" element={<LivePage />} />
          <Route path="/director" element={<DirectorPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/theme" element={<ThemePage />} />
          <Route path="/integrations" element={<Navigate to="/integrations/obs" replace />} />
          <Route path="/integrations/:tab" element={<IntegrationsPage />} />
          <Route path="/signals" element={<Navigate to="/integrations/signals" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<'checking' | 'ok' | 'login'>('checking');
  const check = () =>
    api.auth
      .status()
      .then((s) => setAuth(s.authorized ? 'ok' : 'login'))
      .catch(() => setAuth('login'));
  useEffect(() => {
    check();
  }, []);
  useEffect(() => {
    if (auth === 'ok') connectLive();
  }, [auth]);

  if (auth === 'checking') return null;
  return (
    <ToastProvider>
      {auth === 'login' ? (
        <Login onSuccess={check} />
      ) : (
        <BrowserRouter basename="/control">
          <Shell />
        </BrowserRouter>
      )}
    </ToastProvider>
  );
}
