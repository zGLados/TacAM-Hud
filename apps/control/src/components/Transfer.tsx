import { useEffect, useRef, useState } from 'react';
import {
  TRANSFER_SECTION_LABELS,
  TRANSFER_SECTIONS,
  type TransferMode,
  type TransferPreview,
  type TransferResult,
  type TransferSection,
  type TransferSectionPreview,
} from '@tacam/shared';
import { api } from '../api';
import { downloadBlob } from '../download';
import { Modal, useRun, useToast } from './ui';

const labels = (sections: readonly TransferSection[]) => sections.map((s) => TRANSFER_SECTION_LABELS[s].toLowerCase()).join(', ');

/** Saves the given sections as a zip (JSON + images). */
export function useExport() {
  const run = useRun();
  return (sections: TransferSection[], videos = false) =>
    run(async () => {
      const { name, blob } = await api.transfer.export(sections, videos);
      downloadBlob(name, blob);
    });
}

/**
 * Export / Import buttons for a page header: the page's own sections, with
 * images, as a zip. Import shows what would change before anything is written.
 */
export function TransferButtons({ sections }: { sections: TransferSection[] }) {
  const exportZip = useExport();
  return (
    <>
      <button className="button ghost" title={`Save ${labels(sections)} with images as a zip – for another PC or as a backup`} onClick={() => exportZip(sections)}>
        Export
      </button>
      <ImportButton sections={sections} />
    </>
  );
}

export function ImportButton({ sections, children = 'Import', className = 'button ghost' }: { sections: readonly TransferSection[]; children?: string; className?: string }) {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className={className} disabled={busy} title={`Load ${labels(sections)} from a TacAM HUD export (zip)`} onClick={() => input.current?.click()}>
        {busy ? 'Reading…' : children}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          const result = await run(() => api.transfer.preview(file));
          setBusy(false);
          if (result) setPreview(result);
        }}
      />
      {preview && <ImportDialog preview={preview} allowed={sections} onClose={() => setPreview(null)} />}
    </>
  );
}

function ImportDialog({ preview, allowed, onClose }: { preview: TransferPreview; allowed: readonly TransferSection[]; onClose: () => void }) {
  const run = useRun();
  const toast = useToast();
  const available = preview.sections.filter((s) => allowed.includes(s.section));
  const [chosen, setChosen] = useState<TransferSection[]>(available.map((s) => s.section));
  const [mode, setMode] = useState<TransferMode>('merge');
  const [check, setCheck] = useState<TransferResult>({ sections: available, skipped: [] });
  const [done, setDone] = useState<TransferResult | null>(null);

  // What the import would do with the current choice (replace shows different numbers).
  useEffect(() => {
    if (!chosen.length) return;
    let current = true;
    api.transfer
      .check(preview.id, chosen, mode)
      .then((result) => current && setCheck(result))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [preview.id, chosen, mode]);

  const summary = (section: TransferSection) => check.sections.find((s) => s.section === section)?.summary ?? available.find((s) => s.section === section)?.summary;
  const from = [preview.appVersion && `TacAM HUD v${preview.appVersion}`, preview.createdAt && new Date(preview.createdAt).toLocaleString()].filter(Boolean).join(' · ');

  if (done) {
    return (
      <Modal
        title="Import finished"
        onClose={() => location.reload()}
        footer={
          <button className="button primary" onClick={() => location.reload()}>
            Close
          </button>
        }
      >
        <SectionList sections={done.sections} />
        <Skipped skipped={done.skipped} />
      </Modal>
    );
  }

  return (
    <Modal
      title="Import settings"
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`button ${mode === 'replace' ? 'danger' : 'primary'}`}
            disabled={!chosen.length}
            onClick={async () => {
              const result = await run(() => api.transfer.import(preview.id, chosen, mode));
              if (!result) return;
              if (result.skipped.length) setDone(result);
              else {
                toast('Import finished');
                setTimeout(() => location.reload(), 600);
              }
            }}
          >
            {mode === 'replace' ? 'Replace and import' : 'Import'}
          </button>
        </>
      }
    >
      {from && <p className="muted small">From {from}</p>}
      {!available.length ? (
        <p>
          This file contains no {labels(allowed)}. It contains: {labels(preview.sections.map((s) => s.section))} – import it under Settings → Backup.
        </p>
      ) : (
        <div className="stack">
          <div className="transfer_list">
            {available.map(({ section }) => (
              <label key={section} className="transfer_item">
                <input
                  type="checkbox"
                  checked={chosen.includes(section)}
                  onChange={(e) => setChosen((list) => TRANSFER_SECTIONS.filter((s) => (s === section ? e.target.checked : list.includes(s))))}
                />
                <span>
                  <b>{TRANSFER_SECTION_LABELS[section]}</b>
                  <span className="muted small">{summary(section)}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="transfer_modes" role="radiogroup" aria-label="Import mode">
            <label className={`transfer_mode ${mode === 'merge' ? 'is-active' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <b>Merge</b>
                <span className="muted small">Add new entries, update existing ones (same team name, SteamID or id). Nothing is deleted.</span>
              </span>
            </label>
            <label className={`transfer_mode ${mode === 'replace' ? 'is-active' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <b>Replace</b>
                <span className="muted small">Delete what is here in the chosen areas first, then import.</span>
              </span>
            </label>
          </div>
          <Skipped skipped={check.skipped} />
          <p className="muted small">Passwords, the LAN PIN and Stream Deck keys are never part of an export and stay as they are.</p>
        </div>
      )}
    </Modal>
  );
}

function SectionList({ sections }: { sections: TransferSectionPreview[] }) {
  return (
    <ul className="transfer_result">
      {sections.map((s) => (
        <li key={s.section}>
          <b>{TRANSFER_SECTION_LABELS[s.section]}:</b> {s.summary}
        </li>
      ))}
    </ul>
  );
}

function Skipped({ skipped }: { skipped: string[] }) {
  if (!skipped.length) return null;
  return (
    <details className="transfer_skipped">
      <summary>{skipped.length} invalid entries are left out</summary>
      <ul>
        {skipped.map((line, i) => (
          <li key={i} className="small">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Settings → Backup: every section in one file. */
export function BackupCard() {
  const exportZip = useExport();
  const [sections, setSections] = useState<TransferSection[]>([...TRANSFER_SECTIONS]);
  const [videos, setVideos] = useState(false);
  return (
    <div className="stack">
      <p className="muted small">
        One zip with the chosen areas and their images – to move TacAM HUD to another PC, share a setup or keep a backup before a broadcast. Each page (Teams,
        Theme, Camera …) also has its own Export / Import.
      </p>
      <div className="transfer_list">
        {TRANSFER_SECTIONS.map((section) => (
          <label key={section} className="transfer_item">
            <input
              type="checkbox"
              checked={sections.includes(section)}
              onChange={(e) => setSections((list) => TRANSFER_SECTIONS.filter((s) => (s === section ? e.target.checked : list.includes(s))))}
            />
            <b>{TRANSFER_SECTION_LABELS[section]}</b>
          </label>
        ))}
        <label className="transfer_item">
          <input type="checkbox" checked={videos} disabled={!sections.includes('hud')} onChange={(e) => setVideos(e.target.checked)} />
          <span>
            <b>Include background videos</b>
            <span className="muted small">Starting soon / BRB videos – can make the file very large</span>
          </span>
        </label>
      </div>
      <div className="row">
        <button className="button primary" disabled={!sections.length} onClick={() => exportZip(sections, videos)}>
          Export
        </button>
        <ImportButton sections={TRANSFER_SECTIONS}>Import…</ImportButton>
      </div>
    </div>
  );
}
