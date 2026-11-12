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
  // small : conditions en petit et serré (police 6), pour que le devis tienne sur une page
  sections: Array<{ heading: string; text: string; small?: boolean }>;
  // Bloc de signatures (devis) : deux cadres côte à côte, « Le client » et « Le prestataire »
  signatures?: { client: string; issuer: string };
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

    y = Math.min(top - 64, top - rows.length * rowH) - 26;
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
    y -= 12;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  // Bas de la zone de contenu : juste au-dessus du pied de page (première ligne à 36 pt du bas).
  const ensure = (height: number) => {
    if (y - height < MARGIN + 14) newPage();
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
  let afterSmall = false;
  for (const section of data.sections.filter((entry) => (entry.text ?? "").trim())) {
    if (!section.small && afterSmall) y -= 5; // un peu d'air après le bloc de conditions
    afterSmall = Boolean(section.small);
    if (section.small) {
      // Petit et serré : titre puis texte en police 6, sans ligne vide entre les paragraphes,
      // chaque mention (paragraphe) commence simplement à la ligne.
      ensure(20);
      text(section.heading, MARGIN, y, { size: 6.5, font: bold });
      y -= 7.6;
      for (const line of wrap(section.text, regular, 6, PAGE_WIDTH - 2 * MARGIN).filter((line) => line.trim())) {
        ensure(9);
        text(line, MARGIN, y, { size: 6 });
        y -= 7;
      }
      y -= 2;
      continue;
    }
    ensure(36);
    text(section.heading, MARGIN, y, { size: 9, font: bold });
    y -= 12;
    for (const line of wrap(section.text, regular, 8.5, PAGE_WIDTH - 2 * MARGIN)) {
      // Une ligne vide ne provoque pas à elle seule une nouvelle page.
      if (!line.trim()) { y -= 10.5; continue; }
      ensure(11);
      text(line, MARGIN, y, { size: 8.5 });
      y -= 10.5;
    }
    y -= 6;
  }

  // Signatures : deux cadres côte à côte, avec assez de place pour signer (jamais coupés entre deux pages).
  if (data.signatures) {
    const boxHeight = 64; // environ 2,3 cm : de quoi dater, écrire « Bon pour accord » et signer
    if (afterSmall) y -= 4;
    ensure(boxHeight + 4);
    const gap = 14;
    const boxWidth = (PAGE_WIDTH - 2 * MARGIN - gap) / 2;
    const boxes = [
      { title: "Le client", note: data.signatures.client },
      { title: "Le prestataire", note: data.signatures.issuer }
    ];
    // Emplacement du cadre « Le client », noté dans le PDF : la signature en ligne y sera posée.
    pdf.setKeywords([
      `signature-client=${pdf.getPageCount() - 1},${MARGIN.toFixed(2)},${(y - boxHeight).toFixed(2)},${boxWidth.toFixed(2)},${boxHeight}`
    ]);
    boxes.forEach((box, index) => {
      const x = MARGIN + index * (boxWidth + gap);
      page.drawRectangle({
        x, y: y - boxHeight, width: boxWidth, height: boxHeight,
        borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.6
      });
      text(box.title, x + 8, y - 12, { size: 8.5, font: bold });
      wrap(box.note, regular, 6.5, boxWidth - 16).slice(0, 2).forEach((line, lineIndex) => {
        text(line, x + 8, y - 22 - lineIndex * 8, { size: 6.5, color: GREY });
      });
    });
    y -= boxHeight + 6;
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

export type OnlineSignature = {
  png: Uint8Array;
  name: string;
  email: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  number: string;
  originalSha256: string;
};

function parisDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris"
  }).format(date).replace(/\u202f/g, " ");
}

// Devis signé en ligne : la signature est posée dans le cadre « Le client » du PDF d'origine,
// avec la mention « Bon pour accord », le nom et la date. Une page « Attestation d'acceptation »
// est ajoutée à la fin (date et heure, e-mail, adresse IP, empreinte du devis d'origine).
export async function signQuotePdf(original: Uint8Array, signature: OnlineSignature) {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = await pdf.embedPng(signature.png);
  const when = parisDateTime(signature.signedAt);

  const fit = (maxWidth: number, maxHeight: number) => {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    return { width: image.width * scale, height: image.height * scale };
  };

  const match = /signature-client=(\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)/.exec(pdf.getKeywords() ?? "");
  if (match) {
    const [pageIndex, x, y, width, height] = match.slice(1).map(Number);
    const page = pdf.getPage(pageIndex);
    // La consigne « Date et signature… » est remplacée par la mention signée.
    page.drawRectangle({ x: x + 1, y: y + height - 33, width: width - 2, height: 18, color: rgb(1, 1, 1) });
    page.drawText(pdfSafe(`Bon pour accord — ${signature.name}`), { x: x + 8, y: y + height - 22, size: 6.5, font: bold, color: BLACK });
    page.drawText(pdfSafe(`Signé en ligne le ${when}`), { x: x + 8, y: y + height - 30, size: 6.5, font: regular, color: GREY });
    const size = fit(width - 16, height - 37);
    page.drawImage(image, { x: x + 8, y: y + 3, ...size });
  }

  // Attestation d'acceptation
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN - 10;
  page.drawText(pdfSafe(`Attestation d'acceptation du devis ${signature.number}`), { x: MARGIN, y, size: 15, font: bold, color: BLACK });
  y -= 30;
  const rows: Array<[string, string]> = [
    ["Devis", signature.number],
    ["Accepté par", signature.name],
    ["Adresse e-mail", signature.email],
    ["Date et heure", `${when} (heure de Paris)`],
    ["Adresse IP", signature.ip || "non disponible"],
    ["Navigateur", signature.userAgent.slice(0, 160) || "non disponible"],
    ["Empreinte du devis d'origine (SHA-256)", signature.originalSha256],
    ["Qualité du client", "Professionnel, agissant pour les besoins de son activité"],
    ["Conditions générales", "Acceptées (case cochée) — version en vigueur sur alexandrepalanca.fr/conditions-generales à la date ci-dessus"]
  ];
  for (const [label, value] of rows) {
    page.drawText(pdfSafe(label), { x: MARGIN, y, size: 8.5, font: bold, color: BLACK });
    y -= 12;
    for (const line of wrap(value, regular, 9, PAGE_WIDTH - 2 * MARGIN)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: BLACK });
      y -= 12;
    }
    y -= 6;
  }
  y -= 6;
  for (const line of wrap(
    "Le client a pris connaissance du devis ci-dessus, de ses conditions, des conditions générales de prestation et du montant indiqué, puis l'a accepté en ligne avec la mention « Bon pour accord » en apposant la signature ci-dessous, depuis le lien personnel qui lui a été envoyé par e-mail.",
    regular, 9, PAGE_WIDTH - 2 * MARGIN
  )) {
    page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: BLACK });
    y -= 12;
  }
  y -= 14;
  page.drawText("Signature du client", { x: MARGIN, y, size: 8.5, font: bold, color: BLACK });
  const boxWidth = 260;
  const boxHeight = 110;
  y -= boxHeight + 8;
  page.drawRectangle({ x: MARGIN, y, width: boxWidth, height: boxHeight, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.6 });
  const size = fit(boxWidth - 20, boxHeight - 20);
  page.drawImage(image, { x: MARGIN + (boxWidth - size.width) / 2, y: y + (boxHeight - size.height) / 2, ...size });

  return await pdf.save();
}

// ---------------------------------------------------------------- proposition commune

export type SummaryData = {
  logo: Uint8Array | null;
  date: string;
  validUntil: string;
  projectTitle: string;
  description: string;
  client: { name: string; lines: string[] };
  rows: Array<{ service: string; issuer: string; number: string; cents: number }>;
  totalCents: number;
  deposits: Array<{ issuer: string; cents: number }>;
  footer: string;
};

// Page 1 de la proposition commune : synthèse commerciale (n'a pas valeur de devis).
export async function renderSummaryPdf(data: SummaryData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Proposition globale — ${data.client.name}`);
  pdf.setAuthor("Alexandre Palanca & Elisa Martignac");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const W = PAGE_WIDTH - 2 * MARGIN;
  const text = (value: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(pdfSafe(value), { x, y, size: o.size ?? 9, font: o.font ?? regular, color: o.color ?? BLACK });
  const right = (value: string, xRight: number, y: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 9;
    const font = o.font ?? regular;
    text(value, xRight - font.widthOfTextAtSize(pdfSafe(value), size), y, o);
  };

  let y = PAGE_HEIGHT - MARGIN;
  if (data.logo) {
    try {
      const logo = await pdf.embedPng(data.logo);
      const size = 54;
      page.drawImage(logo, { x: MARGIN, y: y - size, width: size, height: size * (logo.height / logo.width) });
    } catch { /* logo facultatif */ }
  }
  right("Proposition globale", PAGE_WIDTH - MARGIN, y - 14, { size: 9, font: bold, color: GREY });
  right(`Le ${formatDateFr(data.date)}`, PAGE_WIDTH - MARGIN, y - 28, { size: 9, color: GREY });
  if (data.validUntil) right(`Valable jusqu'au ${formatDateFr(data.validUntil)}`, PAGE_WIDTH - MARGIN, y - 41, { size: 9, color: GREY });
  y -= 92;

  text("Alexandre Palanca  ·  Elisa Martignac", MARGIN, y, { size: 9, color: GREY });
  y -= 30;
  for (const line of wrap(data.projectTitle, bold, 24, W)) {
    text(line, MARGIN, y, { size: 24, font: bold });
    y -= 28;
  }
  y -= 6;
  for (const line of wrap(data.description, regular, 10, W).slice(0, 6)) {
    if (!line.trim()) { y -= 6; continue; }
    text(line, MARGIN, y, { size: 10, color: GREY });
    y -= 14;
  }
  y -= 14;

  // Client
  text("Client", MARGIN, y, { size: 8, font: bold, color: GREY });
  y -= 15;
  text(data.client.name, MARGIN, y, { size: 11, font: bold });
  y -= 14;
  for (const line of data.client.lines.slice(0, 5)) {
    text(line, MARGIN, y, { size: 9 });
    y -= 12;
  }
  y -= 24;

  // Les deux prestations
  text("Les prestations", MARGIN, y, { size: 8, font: bold, color: GREY });
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
  for (const row of data.rows) {
    y -= 22;
    text(row.service, MARGIN, y, { size: 11, font: bold });
    right(formatMoney(row.cents), PAGE_WIDTH - MARGIN, y, { size: 11, font: bold });
    y -= 14;
    text(`${row.issuer} — devis ${row.number}`, MARGIN, y, { size: 9, color: GREY });
    y -= 12;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });
  }
  y -= 26;

  // Total cumulé, bien en évidence
  const boxH = 64;
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: W, height: boxH, color: rgb(0.08, 0.08, 0.075) });
  text("Montant total du projet", MARGIN + 18, y - 26, { size: 10, color: rgb(0.8, 0.8, 0.78) });
  text("Somme des deux devis (TTC)", MARGIN + 18, y - 41, { size: 8, color: rgb(0.6, 0.6, 0.58) });
  right(formatMoney(data.totalCents), PAGE_WIDTH - MARGIN - 18, y - 40, { size: 24, font: bold, color: rgb(1, 1, 1) });
  y -= boxH + 18;

  if (data.deposits.some((d) => d.cents > 0)) {
    text(`Acomptes à la validation : ${data.deposits.filter((d) => d.cents > 0).map((d) => `${d.issuer} ${formatMoney(d.cents)}`).join("  ·  ")}`, MARGIN, y, { size: 9 });
    y -= 22;
  }

  // Mention : deux prestations indépendantes
  const note = "Ce document présente une proposition globale composée de deux prestations indépendantes. Retrouvez le détail et les conditions de chaque prestation dans les devis individuels des pages suivantes. Chaque prestataire facture séparément sa propre prestation.";
  const noteLines = wrap(note, regular, 9, W - 28);
  const noteH = noteLines.length * 12 + 20;
  page.drawRectangle({ x: MARGIN, y: y - noteH, width: W, height: noteH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.6 });
  let ny = y - 18;
  for (const line of noteLines) {
    text(line, MARGIN + 14, ny, { size: 9 });
    ny -= 12;
  }

  wrap(data.footer, regular, 7, W).slice(0, 3).forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: 36 - index * 9, size: 7, font: regular, color: GREY });
  });
  return await pdf.save();
}

// Assemble plusieurs PDF en un seul (synthèse + devis d'Alexandre + devis d'Elisa).
export async function mergePdfs(parts: Uint8Array[]) {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => out.addPage(page));
  }
  return await out.save();
}
