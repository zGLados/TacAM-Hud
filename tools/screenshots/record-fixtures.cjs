// Records the three GSI fixtures from a running demo match: freezetime, and an early and a late
// state of the same live round (at least 3 kills apart). Start the demo first.
const fs = require('fs');
const path = require('path');
const { get, wait, phase } = require('./lib.cjs');

const save = (name, raw) => fs.writeFileSync(path.join(__dirname, 'fixtures', `${name}.json`), JSON.stringify(raw));
const deaths = (raw) => Object.values(raw.allplayers).reduce((sum, p) => sum + p.match_stats.deaths, 0);

(async () => {
  while ((await get('/stats')).rounds.length < 3) await wait(1000);
  while ((await phase()) !== 'over') await wait(300);
  while ((await phase()) !== 'freezetime') await wait(300);
  await wait(3000);
  save('freeze', await get('/live/raw'));
  while ((await phase()) !== 'live') await wait(200);
  await wait(1000);
  const early = await get('/live/raw');
  for (;;) {
    const late = await get('/live/raw');
    if (late.map.round !== early.map.round) throw new Error('Round ended before enough kills – run again');
    if (deaths(late) - deaths(early) >= 3) {
      save('live_early', early);
      save('live_late', late);
      console.log('recorded round', early.map.round + 1);
      return;
    }
    await wait(300);
  }
})();
