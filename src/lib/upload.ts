/** Ringkasan & warning setelah upload (US-A1, US-A2). Pure. */
import { normKode } from './billing';
import type { TipeData } from './parse';
import type { DataSet } from './types';

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

  const sales = new Set(data.master.map((m) => normKode(m.kode_salesman)));
  return {
    baris: [
      { label: 'Salesman', nilai: String(sales.size) },
      { label: 'Toko', nilai: masterKode.size.toLocaleString('id-ID') },
    ],
    warning,
  };
}
