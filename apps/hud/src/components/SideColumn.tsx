import type { Player, Team } from 'csgogsi';
import { classifyBuy, type BuyType, type SideBoxConfig } from '@tacam/shared';
import { WeaponIcon } from '../lib/assets';

const BUY_LABEL: Record<BuyType, string> = {
  pistol: 'Pistol',
  eco: 'Eco',
  semi: 'Semi-Eco',
  force: 'Force Buy',
  full: 'Full Buy',
};

const GRENADES = [
  { icon: 'smokegrenade', names: ['smokegrenade'] },
  { icon: 'molotov', iconCT: 'incgrenade', names: ['incgrenade', 'molotov'] },
  { icon: 'flashbang', names: ['flashbang'] },
  { icon: 'hegrenade', names: ['hegrenade'] },
];

function grenadeCount(players: Player[], names: string[]) {
  return players
    .flatMap((p) => p.weapons)
    .filter((w) => w.type === 'Grenade' && names.includes(w.name.replace('weapon_', '')))
    .reduce((sum, w) => sum + (w.ammo_reserve || 0), 0);
}

function UtilityBox({ team, players, visible }: { team: Team; players: Player[]; visible: boolean }) {
  return (
    <div className={`utility-box ${visible ? 'is-visible' : ''}`} data-side={team.side}>
      <div className="utility-box__list">
        {GRENADES.map((g) => (
          <div key={g.icon} className="utility-box__item">
            {/* wrapper keeps the icon from shrinking as a flex item */}
            <div>
              <WeaponIcon weapon={team.side === 'CT' && g.iconCT ? g.iconCT : g.icon} isGrenade />
            </div>
            <div>x{grenadeCount(players, g.names)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoBox({ align, config, hidden }: { align: 'left' | 'right'; config: SideBoxConfig; hidden: boolean }) {
  if (!config.title) return null;
  return (
    <div className={`info-box ${hidden ? '' : 'is-visible'}`} data-align={align}>
      <div className="info-box__text">
        <div className="info-box__title">{config.title}</div>
        <div className="info-box__subtitle">{config.subtitle}</div>
      </div>
      <div className="info-box__image">{config.image && <img src={`/uploads/${config.image}`} alt="" />}</div>
    </div>
  );
}

function MoneyBox({ team, players, align, visible }: { team: Team; players: Player[]; align: 'left' | 'right'; visible: boolean }) {
  const lossBonus = Math.min(team.consecutive_round_losses * 500 + 1400, 3400);
  const money = players.reduce((sum, p) => sum + p.state.money, 0);
  return (
    <div className={`money-box ${visible ? 'is-visible' : ''}`} data-align={align} data-side={team.side}>
      <div className="money-box__figure">
        <div className="money-box__label">Team Money</div>
        <div className="money-box__value">${money}</div>
      </div>
      <div className="money-box__figure">
        <div className="money-box__label">Loss Bonus</div>
        <div className="money-box__value">${lossBonus}</div>
      </div>
      <div className="money-box__losses">
        {[1, 2, 3, 4].map((level) => (
          <div key={level} className={`money-box__loss ${(lossBonus - 1400) / 500 >= level ? 'is-active' : ''}`} />
        ))}
      </div>
    </div>
  );
}

/** Current equipment value and buy classification of the team. */
function EconomyBox({ players, round, visible }: { players: Player[]; round: number; visible: boolean }) {
  const equipment = players.reduce((sum, p) => sum + p.state.equip_value, 0);
  const buy = classifyBuy(equipment, round);
  return (
    <div className={`economy-box ${visible ? 'is-visible' : ''}`}>
      <div className="economy-box__figure">
        <div className="economy-box__label">Equipment</div>
        <div className="economy-box__value">${equipment}</div>
      </div>
      <div className="buy-badge" data-buy={buy}>
        {BUY_LABEL[buy]}
      </div>
    </div>
  );
}

interface SideColumnProps {
  align: 'left' | 'right';
  team: Team;
  players: Player[];
  infoBox: SideBoxConfig;
  infoBoxHidden: boolean;
  /** Utility, money and economy are shown in freezetime only. */
  visible: boolean;
  showEconomy: boolean;
  round: number;
}

export function SideColumn({ align, team, players, infoBox, infoBoxHidden, visible, showEconomy, round }: SideColumnProps) {
  return (
    <div className="side-column" data-align={align}>
      <UtilityBox team={team} players={players} visible={visible} />
      <InfoBox align={align} config={infoBox} hidden={infoBoxHidden} />
      <MoneyBox team={team} players={players} align={align} visible={visible} />
      {showEconomy && <EconomyBox players={players} round={round} visible={visible} />}
    </div>
  );
}

export { BUY_LABEL };
