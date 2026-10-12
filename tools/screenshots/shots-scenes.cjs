// "Upcoming matches" and "player to watch" scenes; start the demo first (needs a few rounds of stats).
const { req, get, wait, scene, launch, shotHud, API } = require('./lib.cjs');

(async () => {
  while ((await get('/stats')).rounds.length < 4) await wait(1000);
  await req(API + '/demo/stop', {});
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const s of ['upcoming', 'playerToWatch']) {
    await scene(s);
    await shotHud(page, 'scene-' + s);
  }
  await scene('live');
  await b.close();
})();
