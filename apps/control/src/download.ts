/** Saves text as a file (browser download; the desktop app shows a save dialog). */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** e.g. tacam-players-2026-10-11.csv */
export const datedFileName = (name: string, extension: string) => `tacam-${name}-${new Date().toISOString().slice(0, 10)}.${extension}`;
