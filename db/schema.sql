-- Skema DB untuk Neon Postgres (dibuat otomatis oleh function; file ini untuk dijalankan manual di Neon SQL Editor bila mau).
-- Satu baris = satu jenis data master (master, rovi, pjp, produk, rules, histori, msl, price) dalam bentuk array JSON.
CREATE TABLE IF NOT EXISTS dataset (
  tipe       text PRIMARY KEY,
  rows       jsonb NOT NULL,
  jumlah     integer NOT NULL DEFAULT 0,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cek isi:
-- SELECT tipe, jumlah, version, updated_at FROM dataset ORDER BY tipe;
