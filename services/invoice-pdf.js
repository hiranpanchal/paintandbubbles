// Builds an invoice PDF with pdfkit and streams it to `out` (e.g. an HTTP response).
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');

const ROSE = '#C4748A';
const DARK = '#2C2028';
const MID = '#5C4F57';
const LIGHT = '#9E8E96';
const BORDER = '#EDE0E5';

const money = p => `£${((p || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ukDate = iso => iso
  ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  : '';

// Resolve the site logo to a local file in the uploads folder.
// Returns { file, type: 'svg' | 'raster' } or null.
function localLogo(logoUrl) {
  const m = /^\/uploads\/([^/]+\.(png|jpe?g|svg))$/i.exec(logoUrl || '');
  if (!m) return null;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../db');
  const file = path.join(dataDir, 'uploads', path.basename(m[1]));
  if (!fs.existsSync(file)) return null;
  return { file, type: m[2].toLowerCase() === 'svg' ? 'svg' : 'raster' };
}

// svg-to-pdfkit ignores <style> blocks, and Illustrator exports colour every
// shape through classes (.st0{fill:#FCF0E8}). Copy each class's rules onto
// the elements as inline styles so the colours survive.
function inlineSvgClassStyles(svg) {
  const rules = {};
  for (const block of svg.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []) {
    for (const [, names, body] of block.matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) {
      for (const name of names.split(',').map(n => n.trim().slice(1)).filter(Boolean)) {
        rules[name] = (rules[name] || '') + body.trim().replace(/;?$/, ';');
      }
    }
  }
  return svg
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\sclass="([^"]+)"/g, (_, classes) => {
      const style = classes.split(/\s+/).map(c => rules[c] || '').join('');
      return style ? ` style="${style}"` : '';
    });
}

// Draw the logo inside a box (x, y, maxW x maxH), keeping its proportions.
// Returns the drawn height, or 0 if there's no usable logo.
function drawLogo(doc, logoUrl, x, y, maxW, maxH) {
  const logo = localLogo(logoUrl);
  if (!logo) return 0;
  try {
    if (logo.type === 'raster') {
      const img = doc.openImage(logo.file);
      const scale = Math.min(maxW / img.width, maxH / img.height);
      doc.image(img, x, y, { width: img.width * scale });
      return img.height * scale;
    }
    const svg = inlineSvgClassStyles(fs.readFileSync(logo.file, 'utf8'));
    const vb = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    const [w, h] = vb ? [parseFloat(vb[1]), parseFloat(vb[2])] : [maxW, maxH];
    const scale = Math.min(maxW / w, maxH / h);
    SVGtoPDF(doc, svg, x, y, { width: w * scale, height: h * scale, preserveAspectRatio: 'xMinYMin meet' });
    return h * scale;
  } catch (err) {
    console.error('[Invoice PDF] Could not draw logo:', err.message);
    return 0;
  }
}

function buildInvoicePdf(invoice, settings, out) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${invoice.invoice_number}` } });
  doc.pipe(out);

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const businessName = settings.seo_business_name || 'Paint & Bubbles';

  // ── Header: logo / name on the left, INVOICE + number on the right ──
  const logoHeight = drawLogo(doc, settings.logo_url, left, 40, 150, 90);
  if (!logoHeight) {
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ROSE).text(businessName, left, 55);
  }
  doc.font('Helvetica-Bold').fontSize(26).fillColor(DARK).text('INVOICE', left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(11).fillColor(MID).text(invoice.invoice_number, left, 82, { width, align: 'right' });
  if (invoice.status === 'paid' || invoice.status === 'void') {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(invoice.status === 'paid' ? '#059669' : '#9B2335')
      .text(invoice.status === 'paid' ? 'PAID' : 'VOID', left, 98, { width, align: 'right' });
  }

  // ── From / Bill to / Dates ──
  let y = Math.max(135, 40 + logoHeight + 20);
  const col = width / 3;
  const block = (x, title, lines, boldFirst = true) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ROSE).text(title.toUpperCase(), x, y, { width: col - 12, characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(10).fillColor(DARK);
    lines.filter(Boolean).forEach((line, i) => {
      doc.font(i === 0 && boldFirst ? 'Helvetica-Bold' : 'Helvetica').text(line, x, doc.y + (i === 0 ? 4 : 1), { width: col - 12 });
    });
    return doc.y;
  };
  const fromBottom = block(left, 'From', [
    businessName,
    ...(settings.invoice_business_address || settings.seo_business_address || '').split('\n'),
    settings.invoice_business_email || '',
    settings.seo_business_phone || '',
  ]);
  const toBottom = block(left + col, 'Bill to', [
    invoice.client_company || invoice.client_name,
    invoice.client_company ? invoice.client_name : '',
    ...(invoice.client_address || '').split('\n'),
    invoice.client_email,
    invoice.client_phone,
  ]);
  const datesBottom = block(left + col * 2, 'Details', [
    `Invoice date: ${ukDate(invoice.issue_date)}`,
    `Due date: ${ukDate(invoice.due_date)}`,
    invoice.status === 'paid' && invoice.paid_at ? `Paid: ${ukDate(invoice.paid_at.slice(0, 10))}` : '',
  ], false);
  y = Math.max(fromBottom, toBottom, datesBottom) + 30;

  // ── Line items table ──
  const cols = { desc: left + 10, qty: left + width * 0.58, unit: left + width * 0.68, amount: left + width * 0.84 };
  const colW = { desc: width * 0.56, qty: width * 0.08, unit: width * 0.15, amount: width * 0.16 - 10 };
  doc.rect(left, y, width, 24).fill('#FFF6F8');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ROSE);
  doc.text('DESCRIPTION', cols.desc, y + 8, { width: colW.desc });
  doc.text('QTY', cols.qty, y + 8, { width: colW.qty, align: 'right' });
  doc.text('UNIT PRICE', cols.unit, y + 8, { width: colW.unit, align: 'right' });
  doc.text('AMOUNT', cols.amount, y + 8, { width: colW.amount, align: 'right' });
  y += 32;

  let items = [];
  try { items = JSON.parse(invoice.items || '[]'); } catch {}
  doc.font('Helvetica').fontSize(10).fillColor(DARK);
  for (const item of items) {
    doc.font('Helvetica').fontSize(10);
    const descHeight = doc.heightOfString(item.description || '', { width: colW.desc });
    doc.fontSize(8.5);
    const detailsHeight = item.details ? doc.heightOfString(item.details, { width: colW.desc }) + 4 : 0;
    doc.fontSize(10);
    const rowHeight = Math.max(16, descHeight + detailsHeight);
    if (y + rowHeight > doc.page.height - 200) { doc.addPage(); y = 60; }
    const amount = Math.round((item.quantity || 0) * (item.unit_price_pence || 0));
    doc.fillColor(DARK).text(item.description || '', cols.desc, y, { width: colW.desc });
    if (item.details) {
      doc.fontSize(8.5).fillColor(MID).text(item.details, cols.desc, y + descHeight + 4, { width: colW.desc });
      doc.fontSize(10).fillColor(DARK);
    }
    doc.text(String(item.quantity), cols.qty, y, { width: colW.qty, align: 'right' });
    doc.text(money(item.unit_price_pence), cols.unit, y, { width: colW.unit, align: 'right' });
    doc.text(money(amount), cols.amount, y, { width: colW.amount, align: 'right' });
    y += rowHeight + 10;
    doc.moveTo(left, y - 5).lineTo(right, y - 5).strokeColor(BORDER).lineWidth(0.8).stroke();
  }

  // ── Total ──
  y += 6;
  doc.rect(left + width * 0.55, y, width * 0.45, 34).fill(ROSE);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
    .text(invoice.status === 'paid' ? 'Total paid' : 'Total due', left + width * 0.55 + 14, y + 11);
  doc.fontSize(14).text(money(invoice.total_pence), left + width * 0.55, y + 9, { width: width * 0.45 - 14, align: 'right' });
  y += 56;

  // ── Payment details (bank transfer) ──
  const bank = [
    ['Account name', settings.invoice_bank_account_name],
    ['Sort code', settings.invoice_bank_sort_code],
    ['Account number', settings.invoice_bank_account_number],
    ['Payment reference', invoice.invoice_number],
  ].filter(([, v]) => v);
  // Only unpaid invoices need payment instructions.
  if (invoice.status === 'unpaid' && bank.length > 1) {
    if (y > doc.page.height - 190) { doc.addPage(); y = 60; }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ROSE).text('PAY BY BANK TRANSFER', left, y, { characterSpacing: 0.8 });
    y = doc.y + 6;
    for (const [label, value] of bank) {
      doc.font('Helvetica').fontSize(10).fillColor(LIGHT).text(label, left, y, { width: 120 });
      doc.font('Helvetica-Bold').fillColor(DARK).text(value, left + 125, y);
      y = doc.y + 3;
    }
    y += 14;
  }

  // ── Notes + footer ──
  if (invoice.notes) {
    if (y > doc.page.height - 150) { doc.addPage(); y = 60; }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ROSE).text('NOTES', left, y, { characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(10).fillColor(MID).text(invoice.notes, left, doc.y + 6, { width });
  }
  if (settings.invoice_footer_note) {
    doc.font('Helvetica').fontSize(9).fillColor(LIGHT)
      .text(settings.invoice_footer_note, left, doc.page.height - 80, { width, align: 'center', lineBreak: false });
  }

  doc.end();
}

module.exports = { buildInvoicePdf };
