/** Formatting helpers shared across screens. */

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatNav(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** AUM in the Indian convention: ₹3,206 Cr. */
export function formatAum(croreValue: number | null | undefined): string {
  if (croreValue === null || croreValue === undefined) return '—';
  return `₹${croreValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** 2026-07-02 -> "2 Jul 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 2026-07-02 -> "2 Jul" for compact chart axis labels. */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}
