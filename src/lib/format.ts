/** "Rp 1.250.000" — uang selalu integer rupiah. */
export function formatRupiah(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}Rp ${s}`;
}
