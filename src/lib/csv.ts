/** CSV sederhana (RFC 4180): pemisah koma, kutip ganda bila perlu. */
export function toCSV<T extends Record<string, unknown>>(rows: readonly T[], columns?: (keyof T & string)[]): string {
  const cols = columns ?? (rows[0] ? (Object.keys(rows[0]) as (keyof T & string)[]) : []);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

/** Unduh teks sebagai file (browser). BOM agar Excel membaca UTF-8. */
export function unduh(namaFile: string, isi: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', isi], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
