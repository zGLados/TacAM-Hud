// Runs the demo match past halftime (~12 min): freezetime, halftime, match end, the three overlays,
// stats, director, Integrations → Signals with example rules, captain veto on a phone.
// Restores signals and the current match afterwards.
const path = require('path');
const { BASE, API, OUT, req, get, wait, scene, config, phase, launch, shotHud } = require('./lib.cjs');

(async () => {
  await scene('live');
  await config({ overlay: 'none' });
  await req(API + '/stats/reset', {});
  await req(API + '/demo/start', {});
  while ((await get('/stats')).rounds.length < 14) await wait(2000);
  while ((await phase()) !== 'over') await wait(300);
  while ((await phase()) !== 'freezetime') await wait(300);
  await req(API + '/demo/stop', {});
  const b = await launch();
  const hud = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await shotHud(hud, 'hud-freezetime');
  for (const s of ['halftime', 'matchEnd']) {
    await scene(s);
    await shotHud(hud, 'scene-' + s);
  }
  await scene('live');

  const stats = await get('/stats');
  const live = (await get('/live')).summary;
  const best = (side) => stats.players.filter((p) => p.side === side).sort((a, b) => b.rating - a.rating)[0]?.steamid ?? null;
  await config({ comparison: { left: best(live.left.side), right: best(live.right.side) } });
  for (const overlay of ['scoreboard', 'economy', 'comparison']) {
    await config({ overlay });
    await shotHud(hud, 'overlay-' + overlay);
  }
  await config({ overlay: 'none' });

  const ctl = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  for (const page of ['stats', 'director']) {
    await ctl.goto(`${BASE}/control/${page}`);
    await ctl.waitForTimeout(2500);
    await ctl.screenshot({ path: path.join(OUT, `control-${page}.png`) });
  }

  const before = (await get('/settings')).signals;
  await req(
    API + '/settings/signals',
    [
      { id: 'ex1', enabled: true, event: 'roundEnd', filter: null, output: { kind: 'action', action: 'overlay-scoreboard' }, delay: 2 },
      { id: 'ex2', enabled: true, event: 'roundLive', filter: null, output: { kind: 'action', action: 'overlay-off' }, delay: 0 },
      { id: 'ex3', enabled: true, event: 'ace', filter: 'left', output: { kind: 'http', method: 'POST', url: 'http://192.168.1.20:8000/api/location/1/0/3/press' }, delay: 0 },
    ],
    'PUT'
  );
  await ctl.goto(`${BASE}/control/integrations/signals`);
  await ctl.waitForTimeout(1500);
  await ctl.screenshot({ path: path.join(OUT, 'control-integrations.png') });
  await req(API + '/settings/signals', before, 'PUT');

  const match = (await get('/matches')).find((m) => m.current);
  const started = await (
    await req(`${API}/matches/${match.id}/captain-veto`, { first: 'left', sideChoice: true, pool: ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_overpass'] })
  ).json();
  const { left, right } = started.captainVeto.tokens;
  const act = (t, body) => req(`${API}/captain/${t}`, body);
  await act(left, { action: 'ban', map: 'de_nuke' });
  await act(right, { action: 'ban', map: 'de_overpass' });
  await act(left, { action: 'pick', map: 'de_mirage' });
  const phone = await b.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/control/veto.html?t=${right}`);
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: path.join(OUT, 'veto-phone.png') });
  await req(`${API}/matches/${match.id}/captain-veto`, undefined, 'DELETE');
  await req(`${API}/matches/${match.id}`, match, 'PUT');
  await b.close();
  console.log('done →', OUT, (await get('/stats')).rounds.length, 'rounds');
})();
