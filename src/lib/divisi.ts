/** Kode divisi pada faktur (ROVI). Kode di luar tabel tetap ditampilkan apa adanya. */
export const DIVISI: Record<string, string> = {
  DNE: 'Danone',
  CBN: 'Combine',
  MRS: 'Mars',
};

export function namaDivisi(kode: string | undefined | null): string {
  const k = String(kode ?? '').trim().toUpperCase();
  return DIVISI[k] ?? k;
}

/** "02/10/2026" dari "2026-10-02" (format di kartu faktur, sesuai contoh user). */
export function tanggalDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
