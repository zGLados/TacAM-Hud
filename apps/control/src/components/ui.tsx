import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { api, uploadUrl } from '../api';

// --- toasts -------------------------------------------------------------------

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Runs an async action and reports success/failure as a toast. */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async <T,>(action: () => Promise<T>, success?: string) => {
      try {
        const result = await action();
        if (success) toast(success);
        return result;
      } catch (error) {
        toast((error as Error).message, 'error');
        return undefined;
      }
    },
    [toast]
  );
}

// --- layout helpers ---------------------------------------------------------

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card_header">
          {title && <h2>{title}</h2>}
          {actions && <div className="card_actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page_header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page_actions">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field_label">{label}</span>
      {children}
      {hint && <span className="field_hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle_track" />
      <span>{label}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal_backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal_header">
          <h2>{title}</h2>
          <button className="icon_button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal_body">{children}</div>
        {footer && <footer className="modal_footer">{footer}</footer>}
      </div>
    </div>
  );
}

/** Button that asks for a second click before running a destructive action. */
export function ConfirmButton({ onConfirm, children, className = 'danger' }: { onConfirm: () => void; children: ReactNode; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={`button ${className} ${armed ? 'armed' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? 'Sure?' : children}
    </button>
  );
}

// --- images -------------------------------------------------------------------

export function ImageUpload({ value, onChange, label = 'Choose image' }: { value: string | null; onChange: (file: string | null) => void; label?: string }) {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  const url = uploadUrl(value);
  return (
    <div className="image_upload">
      <div className="image_preview" onClick={() => input.current?.click()}>
        {url ? <img src={url} alt={label} /> : <span className="muted">{label}</span>}
      </div>
      <div className="image_upload_actions">
        <button type="button" className="button small" onClick={() => input.current?.click()}>
          Upload
        </button>
        {value && (
          <button type="button" className="button small ghost" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const result = await run(() => api.upload(file));
          if (result) onChange(result.file);
        }}
      />
    </div>
  );
}

// --- colors -------------------------------------------------------------------

function parseColor(value: string): { hex: string; alpha: number } {
  const rgba = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/i);
  if (rgba) {
    const [r, g, b] = rgba.slice(1, 4).map(Number);
    const a = rgba[4] === undefined ? 1 : rgba[4].endsWith('%') ? parseFloat(rgba[4]) / 100 : parseFloat(rgba[4]);
    return { hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`, alpha: a };
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return { hex: `#${[...value.slice(1)].map((c) => c + c).join('')}`, alpha: 1 };
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    return { hex: value.slice(0, 7), alpha: parseInt(value.slice(7, 9), 16) / 255 };
  }
  return { hex: /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000', alpha: 1 };
}

function toRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha * 100) / 100})`;
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { hex, alpha } = parseColor(value);
  return (
    <div className="color_input">
      <span className="color_swatch" style={{ background: value }}>
        <input type="color" value={hex} onChange={(e) => onChange(toRgba(e.target.value, alpha))} aria-label="Color" />
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={alpha}
        onChange={(e) => onChange(toRgba(hex, Number(e.target.value)))}
        aria-label="Opacity"
      />
      <span className="color_value">{Math.round(alpha * 100)}%</span>
    </div>
  );
}

// --- misc -----------------------------------------------------------------------

export const COUNTRIES: [string, string][] = [
  ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Belgium'], ['BA', 'Bosnia'],
  ['BR', 'Brazil'], ['BG', 'Bulgaria'], ['CA', 'Canada'], ['CN', 'China'], ['HR', 'Croatia'],
  ['CZ', 'Czechia'], ['DK', 'Denmark'], ['EE', 'Estonia'], ['EU', 'Europe'], ['FI', 'Finland'],
  ['FR', 'France'], ['DE', 'Germany'], ['HU', 'Hungary'], ['IL', 'Israel'], ['IT', 'Italy'],
  ['KZ', 'Kazakhstan'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['MN', 'Mongolia'], ['NL', 'Netherlands'],
  ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'], ['RU', 'Russia'],
  ['RS', 'Serbia'], ['SK', 'Slovakia'], ['ES', 'Spain'], ['SE', 'Sweden'], ['CH', 'Switzerland'],
  ['TR', 'Turkey'], ['UA', 'Ukraine'], ['GB', 'United Kingdom'], ['US', 'USA'],
];

export function CountrySelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {COUNTRIES.map(([code, name]) => (
        <option key={code} value={code}>
          {name} ({code})
        </option>
      ))}
    </select>
  );
}

/** navigator.clipboard only exists in secure contexts (not on http://<lan-ip>). */
export async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const run = useRun();
  return (
    <Field label={label}>
      <div className="row">
        <input value={value} readOnly onFocus={(e) => e.target.select()} />
        <button className="button small" onClick={() => run(() => copyText(value), 'Copied')}>
          Copy
        </button>
      </div>
    </Field>
  );
}
