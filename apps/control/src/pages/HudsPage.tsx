import { useRef, useState } from 'react';
import { api, useData, type HudPanelData, type HudPanelInput, type HudPanelValues, type ImportedHud } from '../api';
import { Card, ConfirmButton, CopyField, Field, Group, ImageUpload, Modal, PageHeader, Toggle, useRun } from '../components/ui';
import { TransferButtons } from '../components/Transfer';

/** One input of an imported HUD's panel.json, rendered as a form control. */
function PanelInputField({
  input,
  value,
  onChange,
  onAction,
}: {
  input: HudPanelInput;
  value: string | boolean | number | null | undefined;
  onChange: (value: string | boolean | null) => void;
  onAction: (data: string) => void;
}) {
  const { data: teams } = useData(api.teams.list, []);
  const { data: matches } = useData(api.matches.list, []);
  const { data: players } = useData(api.players.list, []);
  const label = input.label || input.name;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '?';
  switch (input.type) {
    case 'text':
      return (
        <Field label={label}>
          <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'checkbox':
      return <Toggle checked={!!value} onChange={onChange} label={label} />;
    case 'select':
      return (
        <Field label={label}>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {input.values?.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'image':
      return (
        <Group label={label}>
          <ImageUpload value={typeof value === 'string' ? value : null} onChange={(file) => onChange(file)} label="Choose image" />
        </Group>
      );
    case 'team':
      return (
        <Field label={label}>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'match':
      return (
        <Field label={label}>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {teamName(m.left.id)} vs {teamName(m.right.id)} {m.title && `· ${m.title}`}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'player':
      return (
        <Field label={label}>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {[...players]
              .sort((a, b) => a.username.localeCompare(b.username))
              .map((p) => (
                <option key={p.id} value={p.steamid}>
                  {p.username}
                </option>
              ))}
          </select>
        </Field>
      );
    case 'action':
      return (
        <Group label={label}>
          <div className="row wrap">
            {(input.values?.length ? input.values : [{ name: '', label: 'Run' }]).map((v) => (
              <button key={v.name} className="button small" onClick={() => onAction(v.name)}>
                {v.label}
              </button>
            ))}
          </div>
        </Group>
      );
    default:
      return <p className="muted small">Unsupported input type “{input.type}” ({label})</p>;
  }
}

/** Settings panel (panel.json) and keybinds (keybinds.json) of an imported HUD. */
function HudSettingsModal({ hud, onClose }: { hud: ImportedHud; onClose: () => void }) {
  const run = useRun();
  const { data } = useData<HudPanelData | null>(() => api.huds.panel(hud.dir), null);
  const [values, setValues] = useState<HudPanelValues | null>(null);
  const current = values ?? data?.values ?? {};
  const set = (section: string, name: string, value: string | boolean | null) =>
    setValues({ ...current, [section]: { ...(current[section] ?? {}), [name]: value } });
  const save = () => run(() => api.huds.savePanel(hud.dir, current), 'Sent to the HUD');
  return (
    <Modal
      title={`${hud.name} · settings`}
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Close
          </button>
          <button className="button primary" onClick={save}>
            Save & send
          </button>
        </>
      }
    >
      {!data ? null : (
        <div className="stack">
          {data.panel.map((section) => (
            <div key={section.name} className="hud_panel_section">
              <h3>{section.label || section.name}</h3>
              <div className="grid two">
                {section.inputs.map((input) => (
                  <PanelInputField
                    key={input.name}
                    input={input}
                    value={current[section.name]?.[input.name]}
                    onChange={(v) => set(section.name, input.name, v)}
                    onAction={(value) => run(() => api.huds.action(hud.dir, input.name, value), 'Sent')}
                  />
                ))}
              </div>
            </div>
          ))}
          {data.keybinds.length > 0 && (
            <div className="hud_panel_section">
              <h3>HUD actions (keybinds)</h3>
              <div className="row wrap">
                {data.keybinds.map((k) => (
                  <button key={k.action} className="button small" title={k.bind} onClick={() => run(() => api.huds.keybind(hud.dir, k.action), 'Sent')}>
                    {k.label || k.action}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!data.panel.length && !data.keybinds.length && <p className="muted">This HUD has no settings.</p>}
        </div>
      )}
    </Modal>
  );
}

export function HudsPage() {
  const run = useRun();
  const { data: huds, reload } = useData(api.huds.list, []);
  const [editing, setEditing] = useState<ImportedHud | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const origin = window.location.origin;

  return (
    <>
      <PageHeader
        title="HUDs"
        description="The TacAM HUD is built in. Other HUDs in the LHM / JTs-Hud format (zip with hud.json) can be imported and used as their own OBS browser source."
        actions={
          <>
            <TransferButtons sections={['huds']} />
            <button className="button primary" onClick={() => fileInput.current?.click()}>
              Import HUD (.zip)
            </button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const hud = await run(() => api.huds.import(file), 'HUD imported');
          if (hud) reload();
        }}
      />
      <div className="hud_grid">
        <Card title="TacAM HUD (built in)">
          <CopyField label="OBS browser source (1920×1080)" value={`${origin}/hud/`} />
          <p className="muted small">Settings in Director and Theme.</p>
        </Card>
        {huds.map((hud) => (
          <Card key={hud.dir} title={hud.name}>
            <div className="hud_card_head">
              {hud.thumb && <img src={`/huds/${hud.dir}/${hud.thumb}`} alt="" />}
              <div className="muted small">
                {hud.version && `v${hud.version}`} {hud.author && `· ${hud.author}`}
              </div>
            </div>
            <CopyField label="OBS browser source (1920×1080)" value={`${origin}/huds/${hud.dir}/?isProd=true`} />
            <div className="row">
              {(hud.hasPanel || hud.hasKeybinds) && (
                <button className="button small" onClick={() => setEditing(hud)}>
                  Settings & actions
                </button>
              )}
              <ConfirmButton className="small danger" onConfirm={() => run(() => api.huds.remove(hud.dir), 'HUD removed').then(reload)}>
                Remove
              </ConfirmButton>
            </div>
          </Card>
        ))}
      </div>
      <p className="muted small">
        Imported HUDs get the same data as with LHM: live game, match, teams, players, radar maps. Overlays, scenes and signals of the TacAM HUD do
        not apply to them. An imported HUD runs its own code in OBS and can use this server’s API – only import HUDs from sources you trust.
      </p>
      {editing && <HudSettingsModal hud={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
