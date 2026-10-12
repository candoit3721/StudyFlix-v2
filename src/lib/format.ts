/** Numbers are shown in Canadian English style, for example 12,345.5. */
const numberFormat = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 6 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
