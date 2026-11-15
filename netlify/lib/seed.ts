/** Pemilihan jenis data yang di-seed. Pure. */
import { TIPE, type Tipe } from './store';

export interface OpsiSeed {
  /** Hanya jenis ini (kosong = semua). */
  only?: string[];
  /** Timpa jenis yang sudah ada di server. Default: hanya isi yang kosong. */
  force?: boolean;
}

export function pilihTipeSeed(adaDiServer: Iterable<string>, opsi: OpsiSeed): { isi: Tipe[]; lewati: Tipe[]; tidakDikenal: string[] } {
  const ada = new Set(adaDiServer);
  const only = (opsi.only ?? []).map((s) => s.trim()).filter(Boolean);
  const tidakDikenal = only.filter((t) => !(TIPE as readonly string[]).includes(t));
  const kandidat = TIPE.filter((t) => !only.length || only.includes(t));
  const isi = kandidat.filter((t) => opsi.force || !ada.has(t));
  return { isi, lewati: kandidat.filter((t) => !isi.includes(t)), tidakDikenal };
}
