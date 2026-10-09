import type { KillFeedEntry } from '@tacam/shared';
import { useHud } from '../state/store';
import { Headshot, Suicide, WeaponIcon } from '../lib/assets';

function Kill({ kill }: { kill: KillFeedEntry }) {
  const selfKill = kill.killer?.steamid === kill.victim.steamid;
  return (
    <div className="kill-feed__entry">
      <div className="kill-feed__row">
        {kill.killer && !selfKill && (
          <div className="kill-feed__name" data-side={kill.killer.side}>
            {kill.killer.name}
          </div>
        )}
        {kill.assister && (
          <>
            <div className="kill-feed__plus">+</div>
            <div className="kill-feed__name is-assist" data-side={kill.assister.side}>
              {kill.assister.name}
            </div>
          </>
        )}
        <div className="kill-feed__weapon">
          {selfKill || !kill.killer ? <Suicide /> : <WeaponIcon weapon={kill.weapon} />}
          {kill.headshot && <Headshot className="kill-feed__headshot" />}
        </div>
        <div className="kill-feed__name" data-side={kill.victim.side}>
          {kill.victim.name}
        </div>
      </div>
    </div>
  );
}

/**
 * Kills are inferred by the server from GSI counter changes (CS2 does not send
 * kill events), so flash assists, wallbangs and no-scopes are not available.
 */
export function KillFeed() {
  const kills = useHud((s) => s.killfeed);
  return (
    <div className="kill-feed">
      {kills.map((kill) => (
        <Kill key={kill.id} kill={kill} />
      ))}
    </div>
  );
}
