// Live HUD, freezetime, scenes and control pages from the recorded fixtures (fast, repeatable).
const path = require('path');
const { BASE, API, OUT, req, scene, feed, launch, shotHud } = require('./lib.cjs');

(async () => {
  await req(API + '/demo/stop', {});
  await scene('live');
  const b = await launch();
  const hud = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await feed('freeze');
  await feed('live_early');
  await feed('live_late');
  await shotHud(hud, 'hud-live');
  await feed('freeze');
  await shotHud(hud, 'hud-freezetime');
  await feed('live_early');
  await feed('live_late');
  for (const s of ['halftime', 'matchEnd', 'veto']) {
    await scene(s);
    await shotHud(hud, 'scene-' + s);
  }
  await scene('starting', Date.now() + 9 * 60_000 + 42_000);
  await shotHud(hud, 'scene-starting');
  await scene('live');

  const ctl = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  for (const page of ['live', 'director', 'stats', 'theme']) {
    await ctl.goto(`${BASE}/control/${page}`);
    await feed('live_early');
    await ctl.waitForTimeout(1000);
    await feed('live_late');
    await ctl.waitForTimeout(1500);
    await ctl.screenshot({ path: path.join(OUT, `control-${page}.png`) });
  }
  await b.close();
  console.log('done →', OUT);
})();
