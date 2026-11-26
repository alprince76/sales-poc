/** Ringkasan & warning setelah upload (US-A1, US-A2). Pure. */
import { normKode } from './billing';
import { kunciBaris } from './jenisData';
import type { TipeData } from './parse';
import type { DataSet, Kunjungan, MasterToko } from './types';

export interface RingkasanUpload {
  baris: { label: string; nilai: string }[];
  warning: string[];
}

function kodeTidakAda(kode: Iterable<string>, ada: Set<string>): string[] {
  const out = new Set<string>();
  for (const k of kode) if (!ada.has(normKode(k))) out.add(normKode(k));
  return [...out].sort();
}

function contoh(list: string[]): string {
  return list.slice(0, 5).join(', ') + (list.length > 5 ? `, … (+${list.length - 5})` : '');
}

/** `data` = dataset SETELAH tipe ini diganti dengan baris baru. */
export function ringkasUpload(
  tipe: TipeData,
  data: DataSet,
  fmt: { rupiah: (n: number) => string; tanggal: (d: string) => string },
): RingkasanUpload {
  const masterKode = new Set(data.master.map((m) => normKode(m.kode_toko)));
  const roviKode = new Set(data.rovi.map((f) => normKode(f.kode_toko)));
  const warning: string[] = [];

  if (tipe === 'rovi') {
    const total = data.rovi.reduce((s, f) => s + f.sisa_tagihan, 0);
    if (data.master.length) {
      const hilang = kodeTidakAda(roviKode, masterKode);
      if (hilang.length) warning.push(`${hilang.length} toko di ROVI tidak ditemukan di Master Toko: ${contoh(hilang)}`);
    }
    return {
      baris: [
        { label: 'Faktur', nilai: data.rovi.length.toLocaleString('id-ID') },
        { label: 'Toko', nilai: roviKode.size.toLocaleString('id-ID') },
        { label: 'Total outstanding', nilai: fmt.rupiah(total) },
      ],
      warning,
    };
  }

  if (tipe === 'pjp') {
    const sales = new Set(data.pjp.map((p) => normKode(p.kode_salesman)));
    const tgl = data.pjp.map((p) => p.tanggal_kunjungan).sort();
    const pjpKode = data.pjp.map((p) => p.kode_toko);
    const tidakDiRovi = kodeTidakAda(pjpKode, roviKode);
    if (tidakDiRovi.length)
      warning.push(
        `${tidakDiRovi.length} toko tidak ditemukan di data ROVI (akan tampil "Tidak ada tagihan"): ${contoh(tidakDiRovi)}`,
      );
    if (data.master.length) {
      const tidakDiMaster = kodeTidakAda(pjpKode, masterKode);
      if (tidakDiMaster.length)
        warning.push(`${tidakDiMaster.length} toko di PJP tidak ditemukan di Master Toko: ${contoh(tidakDiMaster)}`);
    }
    return {
      baris: [
        { label: 'Salesman', nilai: String(sales.size) },
        {
          label: 'Rentang tanggal',
          nilai: tgl.length ? `${fmt.tanggal(tgl[0])} – ${fmt.tanggal(tgl[tgl.length - 1])}` : '–',
        },
        { label: 'Kunjungan', nilai: data.pjp.length.toLocaleString('id-ID') },
      ],
      warning,
    };
  }

  if (tipe === 'produk') {
    const divisi = new Set(data.produk.map((p) => p.divisi));
    const ruleKode = new Set(data.rules.map((r) => normKode(r.kode_sku)));
    const tanpaRule = data.produk.filter((p) => !ruleKode.has(normKode(p.kode_sku))).map((p) => p.kode_sku);
    if (data.rules.length && tanpaRule.length)
      warning.push(`${tanpaRule.length} SKU belum punya Order Rules (MOQ dianggap 1): ${contoh(tanpaRule)}`);
    return {
      baris: [
        { label: 'SKU', nilai: data.produk.length.toLocaleString('id-ID') },
        { label: 'Divisi', nilai: [...divisi].join(', ') || '–' },
      ],
      warning,
    };
  }

  if (tipe === 'rules') {
    const produkKode = new Set(data.produk.map((p) => normKode(p.kode_sku)));
    const asing = data.rules.filter((r) => !produkKode.has(normKode(r.kode_sku))).map((r) => r.kode_sku);
    if (data.produk.length && asing.length) warning.push(`${asing.length} SKU di Order Rules tidak ada di Master SKU: ${contoh(asing)}`);
    return { baris: [{ label: 'Aturan SKU', nilai: data.rules.length.toLocaleString('id-ID') }], warning };
  }

  if (tipe === 'histori') {
    const tgl = data.histori.map((h) => h.tanggal_po).sort();
    const toko = new Set(data.histori.map((h) => normKode(h.kode_toko)));
    if (data.master.length) {
      const hilang = kodeTidakAda(toko, masterKode);
      if (hilang.length) warning.push(`${hilang.length} toko di Histori tidak ditemukan di Master Toko: ${contoh(hilang)}`);
    }
    return {
      baris: [
        { label: 'Baris histori', nilai: data.histori.length.toLocaleString('id-ID') },
        { label: 'Toko', nilai: toko.size.toLocaleString('id-ID') },
        { label: 'Rentang', nilai: tgl.length ? `${fmt.tanggal(tgl[0])} – ${fmt.tanggal(tgl[tgl.length - 1])}` : '–' },
      ],
      warning,
    };
  }

  if (tipe === 'price') {
    const produkKode = new Set(data.produk.map((p) => normKode(p.kode_sku)));
    const asing = [...new Set(data.price.filter((r) => !produkKode.has(normKode(r.kode_sku))).map((r) => r.kode_sku))];
    if (data.produk.length && asing.length) warning.push(`${asing.length} SKU di Price List tidak ada di Master SKU: ${contoh(asing)}`);
    const ch = (c?: string) => data.price.filter((r) => (r.channel ?? '') === c).length.toLocaleString('id-ID');
    return {
      baris: [
        { label: 'Harga GT', nilai: ch('GT') },
        { label: 'Harga MT', nilai: ch('MT') },
        { label: 'Semua channel', nilai: ch('') },
      ],
      warning,
    };
  }

  if (tipe === 'msl') {
    const toko = new Set(data.msl.map((m) => normKode(m.kode_toko)));
    return {
      baris: [
        { label: 'Baris SKU Listed', nilai: data.msl.length.toLocaleString('id-ID') },
        { label: 'Toko', nilai: toko.size.toLocaleString('id-ID') },
        { label: 'Listed', nilai: data.msl.filter((m) => m.status_listed).length.toLocaleString('id-ID') },
      ],
      warning,
    };
  }

  if (tipe === 'avgorder') {
    const toko = new Set(data.avgorder.map((a) => normKode(a.kode_toko)));
    if (data.master.length) {
      const hilang = kodeTidakAda(toko, masterKode);
      if (hilang.length) warning.push(`${hilang.length} toko di Avg Order tidak ditemukan di Master Toko: ${contoh(hilang)}`);
    }
    const produkKode = new Set(data.produk.map((p) => normKode(p.kode_sku)));
    const asing = [...new Set(data.avgorder.filter((a) => !produkKode.has(normKode(a.kode_sku))).map((a) => a.kode_sku))];
    if (data.produk.length && asing.length) warning.push(`${asing.length} SKU di Avg Order tidak ada di Master SKU: ${contoh(asing)}`);
    return {
      baris: [
        { label: 'Baris Avg Order', nilai: data.avgorder.length.toLocaleString('id-ID') },
        { label: 'Toko', nilai: toko.size.toLocaleString('id-ID') },
      ],
      warning,
    };
  }

  const sales = new Set(data.master.map((m) => normKode(m.kode_salesman)));
  return {
    baris: [
      { label: 'Salesman', nilai: String(sales.size) },
      { label: 'Toko', nilai: masterKode.size.toLocaleString('id-ID') },
    ],
    warning,
  };
}

// ── Upload per channel (Store GT/MT, PJP GT/MT). Server tetap menyimpan per jenis data. ──
export type ChannelUpload = 'GT' | 'MT';
const chOf = (m: { channel?: string }): ChannelUpload => (String(m.channel ?? '').trim().toUpperCase() === 'MT' ? 'MT' : 'GT');

/** Ganti hanya toko channel `channel`; toko channel lain dipertahankan. Semua baris baru dipaksa ke `channel`. */
export function gabungMaster(lama: MasterToko[], baru: MasterToko[], channel: ChannelUpload): { rows: MasterToko[]; dipaksa: number } {
  let dipaksa = 0;
  const masuk = baru.map((m) => {
    if (m.channel !== undefined && chOf(m) !== channel) dipaksa++;
    return { ...m, channel };
  });
  return { rows: [...lama.filter((m) => chOf(m) !== channel), ...masuk], dipaksa };
}

/**
 * Ganti hanya kunjungan segmen `channel` (ditentukan dari channel toko di Master; toko tak dikenal = GT).
 * `diLuar` = baris baru yang tokonya di Master ber-channel lain / tidak ada.
 */
export function gabungPjp(lama: Kunjungan[], baru: Kunjungan[], channel: ChannelUpload, master: MasterToko[]): { rows: Kunjungan[]; diLuar: number } {
  const ch = new Map(master.map((m) => [normKode(m.kode_toko), chOf(m)]));
  const segmen = (k: Kunjungan) => ch.get(normKode(k.kode_toko)) ?? 'GT';
  const diLuar = baru.filter((k) => ch.get(normKode(k.kode_toko)) !== channel).length;
  return { rows: [...lama.filter((k) => segmen(k) !== channel), ...baru], diLuar };
}

/** Jumlah baris per segmen channel (untuk kartu upload). */
export function hitungSegmen(data: DataSet, tipe: 'master' | 'pjp', channel: ChannelUpload): number {
  if (tipe === 'master') return data.master.filter((m) => chOf(m) === channel).length;
  const ch = new Map(data.master.map((m) => [normKode(m.kode_toko), chOf(m)]));
  return data.pjp.filter((k) => (ch.get(normKode(k.kode_toko)) ?? 'GT') === channel).length;
}

// ── Upload "tambah & perbarui" (upsert): data lama tetap, kunci sama diganti isi file, kunci baru ditambah. ──
export interface HasilUpsert<T> {
  rows: T[];
  baru: number;
  diperbarui: number;
  /** Baris di file yang isinya sama persis dengan data lama. */
  sama: number;
  /** Baris lama yang tidak disentuh file. */
  tetap: number;
  /** Store: toko yang sebelumnya terdaftar di channel lain lalu dipindah ke channel kartu ini. */
  pindahChannel: number;
}

/** Kunci upsert per tipe (null = tidak bisa digabung → baris selalu ditambah). Histori: toko + SKU + tanggal PO. */
export function kunciUpsert(tipe: TipeData, r: Record<string, unknown>): string | null {
  if (tipe === 'histori') return `${normKode(String(r.kode_toko ?? ''))}|${normKode(String(r.kode_sku ?? ''))}|${String(r.tanggal_po ?? '')}`;
  return kunciBaris(tipe, r);
}

const samaJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Gabungkan baris file ke data lama. Store GT/MT: baris file dipaksa ke channel kartu.
 * Urutan data lama dipertahankan; baris baru di belakang.
 */
export function gabungUpsert<T>(tipe: TipeData, lama: readonly T[], file: readonly T[], channel?: ChannelUpload): HasilUpsert<T> {
  const masuk = (tipe === 'master' && channel ? file.map((m) => ({ ...(m as object), channel }) as T) : [...file]);
  const posLama = new Map<string, number>();
  lama.forEach((r, i) => {
    const k = kunciUpsert(tipe, r as Record<string, unknown>);
    if (k !== null && !posLama.has(k)) posLama.set(k, i);
  });
  const rows = [...lama];
  const disentuh = new Set<number>();
  let baru = 0;
  let diperbarui = 0;
  let sama = 0;
  let pindahChannel = 0;
  for (const r of masuk) {
    const k = kunciUpsert(tipe, r as Record<string, unknown>);
    const i = k === null ? undefined : posLama.get(k);
    if (i === undefined) {
      rows.push(r);
      if (k !== null) posLama.set(k, rows.length - 1);
      baru++;
      continue;
    }
    if (tipe === 'master' && channel && chOf(rows[i] as { channel?: string }) !== channel) pindahChannel++;
    if (samaJson(rows[i], r)) sama++;
    else {
      rows[i] = r;
      if (i < lama.length && !disentuh.has(i)) diperbarui++;
    }
    disentuh.add(i);
  }
  const tetap = lama.length - [...disentuh].filter((i) => i < lama.length).length;
  return { rows, baru, diperbarui, sama, tetap, pindahChannel };
}
