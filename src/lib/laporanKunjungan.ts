/** Baris export "Laporan Kunjungan GT": status tiap langkah + reason per toko di rute satu salesman. */
import { ringkasPenagihan } from './collection';
import type { ISODate } from './dates';
import type { Aktivitas } from './types';
import { cariKunjungan, isSelesai } from './visit';

export function laporanKunjungan(
  rute: readonly { kode_toko: string; nama_toko: string }[],
  akt: Pick<Aktivitas, 'kunjungan' | 'penagihan' | 'po'>,
  sales: string,
  D: ISODate,
) {
  return rute.map((b) => {
    const k = cariKunjungan(akt.kunjungan, sales, b.kode_toko, D);
    const milik = (x: { kode_salesman: string; kode_toko: string; tanggal: ISODate }) =>
      x.kode_salesman === sales && x.kode_toko === b.kode_toko && x.tanggal === D;
    const po = akt.po.filter(milik);
    return {
      tanggal: D,
      kode_salesman: sales,
      kode_toko: b.kode_toko,
      nama_toko: b.nama_toko,
      cek_stok: k?.langkah.stok ?? 'BELUM',
      collection: k?.langkah.collection ?? 'BELUM',
      purchase_order: k?.langkah.po ?? 'BELUM',
      status_kunjungan: isSelesai(k) ? 'SELESAI' : 'BELUM',
      waktu_selesai: k?.selesaiAt ?? '',
      reason_tidak_dikunjungi: k?.alasan_tidak_dikunjungi ?? '',
      reason_tidak_transaksi: po.length ? '' : (k?.alasan_tidak_transaksi ?? ''),
      terkumpul: ringkasPenagihan(akt.penagihan.filter(milik)).terkumpul,
      nilai_po: po.reduce((s, p) => s + p.total, 0),
    };
  });
}
