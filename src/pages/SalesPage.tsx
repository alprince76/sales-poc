import { useEffect, useState } from 'react';
import { KunjunganPanel } from '../components/KunjunganPanel';
import { DateNav, Select } from '../components/ui';
import { todayJakarta } from '../lib/dates';
import { DEFAULT_DATE, formatTimestamp, latestUpdate, useData } from '../state';

const SALES_KEY = 'svdi-poc-salesman';

function readPref(): string {
  try {
    return localStorage.getItem(SALES_KEY) ?? '';
  } catch {
    return '';
  }
}

export function SalesPage() {
  const { salesmen, updatedAt } = useData();
  const [kode, setKode] = useState(readPref);
  const [D, setD] = useState(DEFAULT_DATE);

  useEffect(() => {
    if (salesmen.length && !salesmen.some((s) => s.kode === kode)) setKode(salesmen[0].kode);
  }, [salesmen, kode]);

  const pilih = (k: string) => {
    setKode(k);
    try {
      localStorage.setItem(SALES_KEY, k);
    } catch {
      /* abaikan */
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10 pt-4">
      <header className="mb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-slate-900">Kunjungan Hari Ini</h1>
          <button type="button" onClick={() => setD(todayJakarta())} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Hari ini
          </button>
        </div>
        {salesmen.length ? (
          <Select label="Pilih salesman" value={kode} onChange={pilih} className="w-full">
            {salesmen.map((s) => (
              <option key={s.kode} value={s.kode}>
                {s.nama} ({s.kode})
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-slate-500">Belum ada data salesman. Upload Master/PJP di halaman Admin.</p>
        )}
        <DateNav value={D} onChange={setD} />
      </header>

      {kode && <KunjunganPanel key={kode} kodeSalesman={kode} D={D} />}

      <footer className="mt-6 text-center text-xs text-slate-400">
        Data terakhir diperbarui: {formatTimestamp(latestUpdate(updatedAt))}
      </footer>
    </div>
  );
}
