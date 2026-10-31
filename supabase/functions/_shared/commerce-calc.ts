export type LineInput = {
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
};

export type VatRow = { rateBps: number; baseCents: number; vatCents: number };

export type Totals = {
  lineTotals: number[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  vatBreakdown: VatRow[];
};

// Tous les montants sont en centimes entiers ; la quantité est arrondie au millième.
export function lineTotalCents(quantity: number, unitPriceCents: number) {
  return Math.round((Math.round(quantity * 1000) * unitPriceCents) / 1000);
}

export function computeTotals(lines: LineInput[]): Totals {
  const lineTotals = lines.map((line) => lineTotalCents(line.quantity, line.unitPriceCents));
  const byRate = new Map<number, number>();
  lines.forEach((line, index) => {
    byRate.set(line.vatRateBps, (byRate.get(line.vatRateBps) ?? 0) + lineTotals[index]);
  });
  const vatBreakdown = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBps, baseCents]) => ({
      rateBps,
      baseCents,
      vatCents: Math.round((baseCents * rateBps) / 10000)
    }));
  const totalHtCents = lineTotals.reduce((sum, value) => sum + value, 0);
  const totalVatCents = vatBreakdown.reduce((sum, row) => sum + row.vatCents, 0);
  return {
    lineTotals,
    totalHtCents,
    totalVatCents,
    totalTtcCents: totalHtCents + totalVatCents,
    vatBreakdown
  };
}

export function depositCents(totalTtcCents: number, enabled: boolean, bps: number) {
  return enabled ? Math.round((totalTtcCents * bps) / 10000) : 0;
}

export function normalizeFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "CLIENT";
}
