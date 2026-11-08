/**
 * Tanggal bisnis = string "YYYY-MM-DD" (hari kalender, tanpa jam/timezone).
 * Semua aritmetika dilakukan lewat "epoch day" berbasis UTC supaya tidak geser hari.
 */
export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
/** Excel serial 25569 = 1970-01-01 (sistem 1900, sudah memperhitungkan bug 1900-02-29). */
const EXCEL_EPOCH_OFFSET = 25569;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fromUTCParts(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function toEpochDay(d: ISODate): number {
  const m = ISO_RE.exec(d);
  if (!m) throw new Error(`Tanggal tidak valid: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

export function fromEpochDay(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  return fromUTCParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** a − b dalam hari kalender. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(d) + n);
}

/** Tanggal hari ini di Asia/Jakarta. */
export function todayJakarta(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Normalisasi nilai sel Excel/CSV ke "YYYY-MM-DD".
 * Menerima: serial Excel (number), Date object, string ISO, string "D/M/YYYY" atau "DD-MM-YYYY".
 * Mengembalikan null bila tidak bisa dibaca.
 */
export function normalizeDate(v: unknown): ISODate | null {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial Excel; buang pecahan jam.
    return fromEpochDay(Math.floor(v) - EXCEL_EPOCH_OFFSET);
  }

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // SheetJS (cellDates) membuat Date pada tengah malam waktu lokal untuk sel tanggal;
    // ambil komponen lokal agar tidak geser hari. Tambah 12 jam bila tepat sebelum tengah malam
    // (artefak pembulatan detik pada beberapa file).
    const d = new Date(v.getTime());
    if (d.getHours() === 23 && d.getMinutes() >= 59) d.setTime(d.getTime() + 60_000);
    return fromUTCParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  if (typeof v === 'string') {
    const s = v.trim();
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
    if (iso) {
      const out = fromUTCParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      return isISODate(out) ? out : null;
    }
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (dmy) {
      const out = fromUTCParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
      return isISODate(out) ? out : null;
    }
    if (/^\d+(\.\d+)?$/.test(s)) return normalizeDate(Number(s));
  }
  return null;
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** "9 Nov 2026" */
export function formatTanggal(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${BULAN[m - 1]} ${y}`;
}

/** "Senin" */
export function namaHari(d: ISODate): string {
  // 1970-01-01 adalah Kamis (index 4).
  return HARI[(((toEpochDay(d) + 4) % 7) + 7) % 7];
}
