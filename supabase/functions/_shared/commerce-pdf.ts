import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export type PdfParty = {
  name: string;
  lines: string[];
};

export type PdfItem = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
  totalHtCents: number;
};

export type PdfDocumentData = {
  title: string;
  number: string;
  dateLabel: string;
  date: string;
  secondaryDateLabel?: string;
  secondaryDate?: string;
  issuer: PdfParty;
  client: PdfParty;
  reference?: string;
  items: PdfItem[];
  totalHtCents: number;
  vatBreakdown: Array<{ rateBps: number; baseCents: number; vatCents: number }>;
  totalTtcCents: number;
  extraTotals: Array<{ label: string; cents: number; strong?: boolean }>;
  sections: Array<{ heading: string; text: string }>;
  footer: string;
  logo?: Uint8Array | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const BLACK = rgb(0.04, 0.04, 0.04);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.9, 0.9, 0.9);

const EXTRA_WIN_ANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

// Les polices standard du PDF ne couvrent que le jeu WinAnsi.
export function pdfSafe(value: string) {
  return (value ?? "")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/[\r\t]/g, " ")
    .replace(/[^\n\u0020-\u007e\u00a1-\u00ff]/g, (char) => EXTRA_WIN_ANSI.has(char) ? char : "?");
}

export function formatMoney(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${euros},${String(abs % 100).padStart(2, "0")} €`;
}

export function formatRate(bps: number) {
  return `${(bps / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export function formatDateFr(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

export async function renderDocumentPdf(data: PdfDocumentData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.title} ${data.number}`);
  pdf.setAuthor(data.issuer.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (data.logo) {
    try {
      logoImage = await pdf.embedPng(data.logo);
    } catch {
      logoImage = null;
    }
  }

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  const text = (
    value: string,
    x: number,
    baseline: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(pdfSafe(value), {
      x,
      y: baseline,
      size: options.size ?? 9,
      font: options.font ?? regular,
      color: options.color ?? BLACK
    });
  };

  // Mise en page de type courrier : logo et titre, encadré émetteur, bloc client, objet.
  const drawHeader = () => {
    const top = PAGE_HEIGHT - MARGIN;
    if (logoImage) {
      const size = 64;
      const scale = size / Math.max(logoImage.width, logoImage.height);
      page.drawImage(logoImage, {
        x: MARGIN,
        y: top - size,
        width: logoImage.width * scale,
        height: logoImage.height * scale
      });
    }

    // Petit tableau encadré en haut à droite
    const rows: Array<[string, string]> = [
      [`${data.title} n°`, data.number],
      [data.dateLabel, formatDateFr(data.date)]
    ];
    if (data.secondaryDate) rows.push([data.secondaryDateLabel ?? "", formatDateFr(data.secondaryDate)]);
    const labelW = 96;
    const valueW = 100;
    const rowH = 20;
    const tableX = PAGE_WIDTH - MARGIN - labelW - valueW;
    const border = rgb(0.55, 0.55, 0.55);
    rows.forEach(([label, value], index) => {
      const rowY = top - (index + 1) * rowH;
      page.drawRectangle({ x: tableX, y: rowY, width: labelW, height: rowH, color: rgb(0.92, 0.92, 0.92), borderColor: border, borderWidth: 0.6 });
      page.drawRectangle({ x: tableX + labelW, y: rowY, width: valueW, height: rowH, borderColor: border, borderWidth: 0.6 });
      text(label, tableX + 6, rowY + 6.5, { size: 9, font: bold });
      text(value, tableX + labelW + 6, rowY + 6.5, { size: 9 });
    });

    y = Math.min(top - 64, top - rows.length * rowH) - 34;
    text(data.title, MARGIN, y, { size: 22 });
    y -= 16;
    if (data.reference) {
      text(data.reference, MARGIN, y, { size: 10, color: GREY });
      y -= 14;
    }
    y -= 14;

    // Émetteur puis contact client
    text(data.issuer.name, MARGIN, y, { size: 11, font: bold });
    y -= 14;
    for (const line of data.issuer.lines.filter(Boolean)) {
      for (const part of wrap(line, regular, 9.5, PAGE_WIDTH - 2 * MARGIN)) {
        text(part, MARGIN, y, { size: 9.5 });
        y -= 12.5;
      }
    }
    y -= 12;
    text("Client :", MARGIN, y, { size: 10, font: bold });
    y -= 14;
    text(data.client.name, MARGIN, y, { size: 10.5, font: bold });
    y -= 13;
    for (const line of data.client.lines.filter(Boolean)) {
      for (const part of wrap(line, regular, 9.5, PAGE_WIDTH - 2 * MARGIN)) {
        text(part, MARGIN, y, { size: 9.5 });
        y -= 12.5;
      }
    }
    y -= 18;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensure = (height: number) => {
    if (y - height < MARGIN + 30) newPage();
  };

  drawHeader();

  // Tableau des prestations
  const columns = { title: MARGIN, qty: 318, unit: 352, price: 398, vat: 456, total: 500 };
  const tableRight = PAGE_WIDTH - MARGIN;
  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tableRight - MARGIN, height: 20, color: rgb(0.17, 0.17, 0.17) });
    const white = rgb(1, 1, 1);
    text("Désignation", columns.title + 6, y, { size: 8, font: bold, color: white });
    text("Qté", columns.qty, y, { size: 8, font: bold, color: white });
    text("Unité", columns.unit, y, { size: 8, font: bold, color: white });
    text("P.U. HT", columns.price, y, { size: 8, font: bold, color: white });
    text("TVA", columns.vat, y, { size: 8, font: bold, color: white });
    text("Total HT", columns.total, y, { size: 8, font: bold, color: white });
    y -= 22;
  };
  drawTableHeader();

  for (const item of data.items) {
    const titleLines = wrap(item.title, bold, 9, columns.qty - columns.title - 16);
    const descLines = item.description
      ? wrap(item.description, regular, 8, columns.qty - columns.title - 16)
      : [];
    const rowHeight = titleLines.length * 12 + descLines.length * 10.5 + 8;
    if (y - rowHeight < MARGIN + 30) {
      newPage();
      drawTableHeader();
    }
    let lineY = y;
    for (const line of titleLines) {
      text(line, columns.title + 6, lineY, { size: 9, font: bold });
      lineY -= 12;
    }
    for (const line of descLines) {
      text(line, columns.title + 6, lineY, { size: 8, color: GREY });
      lineY -= 10.5;
    }
    text(String(item.quantity).replace(".", ","), columns.qty, y);
    text(item.unit, columns.unit, y);
    text(formatMoney(item.unitPriceCents), columns.price, y);
    text(formatRate(item.vatRateBps), columns.vat, y);
    text(formatMoney(item.totalHtCents), columns.total, y);
    y -= rowHeight;
    page.drawLine({
      start: { x: MARGIN, y: y + 7 },
      end: { x: tableRight, y: y + 7 },
      thickness: 0.4,
      color: LIGHT
    });
  }

  // Totaux
  y -= 8;
  const totalsLines: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Total HT", value: formatMoney(data.totalHtCents) },
    ...data.vatBreakdown.map((row) => ({
      label: `TVA ${formatRate(row.rateBps)} sur ${formatMoney(row.baseCents)}`,
      value: formatMoney(row.vatCents)
    })),
    { label: "Total TTC", value: formatMoney(data.totalTtcCents), strong: true },
    ...data.extraTotals.map((row) => ({
      label: row.label,
      value: formatMoney(row.cents),
      strong: row.strong
    }))
  ];
  ensure(totalsLines.length * 15 + 10);
  const labelX = 330;
  for (const row of totalsLines) {
    const font = row.strong ? bold : regular;
    text(row.label, labelX, y, { size: row.strong ? 10 : 9, font });
    const value = pdfSafe(row.value);
    text(value, tableRight - font.widthOfTextAtSize(value, row.strong ? 10 : 9), y, {
      size: row.strong ? 10 : 9,
      font
    });
    y -= 15;
  }
  y -= 12;

  // Sections de conditions
  for (const section of data.sections.filter((entry) => entry.text.trim())) {
    ensure(40);
    text(section.heading, MARGIN, y, { size: 9, font: bold });
    y -= 13;
    for (const line of wrap(section.text, regular, 8.5, PAGE_WIDTH - 2 * MARGIN)) {
      ensure(12);
      text(line, MARGIN, y, { size: 8.5 });
      y -= 11.5;
    }
    y -= 8;
  }

  // Pied de page sur chaque page
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const footerLines = wrap(data.footer, regular, 7, PAGE_WIDTH - 2 * MARGIN).slice(0, 3);
    footerLines.forEach((line, lineIndex) => {
      current.drawText(line, {
        x: MARGIN,
        y: 36 - lineIndex * 9,
        size: 7,
        font: regular,
        color: GREY
      });
    });
    const label = `${index + 1} / ${pages.length}`;
    current.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 7),
      y: 36,
      size: 7,
      font: regular,
      color: GREY
    });
  });

  return await pdf.save();
}
