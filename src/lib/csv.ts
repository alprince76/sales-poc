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

export type FormatEkspor = 'csv' | 'txt' | 'xlsx';
export const LABEL_FORMAT: Record<FormatEkspor, string> = { csv: 'CSV', txt: 'TXT (tab)', xlsx: 'Excel (.xlsx)' };

/** TXT: tab-delimited, satu baris per record (tab/baris baru di nilai diganti spasi). */
export function toTXT<T extends Record<string, unknown>>(rows: readonly T[]): string {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '));
  return [cols.join('\t'), ...rows.map((r) => cols.map((c) => esc(r[c])).join('\t'))].join('\r\n');
}

/** Workbook XLSX (satu sheet "Data") sebagai byte array. */
export async function toXLSX<T extends Record<string, unknown>>(rows: readonly T[]): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows as T[]), 'Data');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as Uint8Array;
}

function unduhBlob(namaFile: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export baris ke CSV / TXT / XLSX. `nama` tanpa ekstensi. */
export async function ekspor<T extends Record<string, unknown>>(fmt: FormatEkspor, nama: string, rows: readonly T[]) {
  if (fmt === 'csv') return unduh(`${nama}.csv`, toCSV(rows));
  if (fmt === 'txt') return unduh(`${nama}.txt`, toTXT(rows), 'text/plain;charset=utf-8');
  const buf = await toXLSX(rows);
  unduhBlob(`${nama}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
