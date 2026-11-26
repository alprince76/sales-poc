import { useEffect, useRef } from 'react';
import type { TipeData } from '../lib/parse';
import { useData } from '../state';
import { useToast } from './ui';

const NAMA: Record<TipeData, string> = {
  master: 'Store',
  rovi: 'Tagihan',
  pjp: 'PJP',
  produk: 'SKU',
  rules: 'MOQ',
  histori: 'Historical order',
  msl: 'SKU listed MT',
  price: 'Price list',
  avgorder: 'Avg order MT',
};

/** Toast saat data master berubah karena upload admin (sinkron dari server). */
export function SyncToast() {
  const { pembaruan } = useData();
  const toast = useToast();
  const terakhir = useRef<number | null>(null);
  useEffect(() => {
    if (!pembaruan || pembaruan.id === terakhir.current) return;
    terakhir.current = pembaruan.id;
    toast(`Data diperbarui admin: ${pembaruan.tipe.map((t) => NAMA[t]).join(', ')}`, 'info');
  }, [pembaruan, toast]);
  return null;
}
