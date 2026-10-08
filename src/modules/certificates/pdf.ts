import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { CertificatePayload } from './signing.js';

/**
 * The official PDF of a certificate: A4 landscape, everything that was
 * signed printed on it, a QR code that opens the public verifier, and the
 * serial, key id and fingerprint along the foot so a paper copy can be
 * checked by hand.
 *
 * Rendered once at issue; the bytes are stored and their hash kept, so the
 * copy a holder downloads is always the very file that was registered.
 */

const NAVY = '#16264A';
const GOLD = '#B8862B';
const GREY = '#5A6577';

const short = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export async function renderCertificatePdf(p: CertificatePayload, opts: { verifyUrl: string; keyId: string; payloadHash: string }): Promise<Buffer> {
  const qr = await QRCode.toBuffer(opts.verifyUrl, { margin: 0, width: 300, color: { dark: NAVY, light: '#FFFFFF' }, errorCorrectionLevel: 'M' });
  const issued = new Date(p.issuedAt);

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: 0,
    info: {
      Title: `${p.title} — ${p.serialNo}`,
      Author: p.institution.name,
      Subject: `${p.type} issued to ${p.recipient.name}`,
      Keywords: `certificate ${p.serialNo} ${opts.keyId}`,
      Creator: 'Resolion Campus OS',
      CreationDate: issued,
      ModDate: issued,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const W = doc.page.width;
  const H = doc.page.height;

  // Frame
  doc.rect(18, 18, W - 36, H - 36).lineWidth(3).stroke(NAVY);
  doc.rect(28, 28, W - 56, H - 56).lineWidth(0.8).stroke(GOLD);

  // Institution
  doc.circle(W / 2, 74, 24).fill(NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(p.institution.code.length > 3 ? 11 : 14).text(p.institution.code, W / 2 - 24, 74 - 7, { width: 48, align: 'center' });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(p.institution.name.toUpperCase(), 60, 108, { width: W - 120, align: 'center', characterSpacing: 1 });

  // Title
  doc.moveTo(W / 2 - 120, 146).lineTo(W / 2 + 120, 146).lineWidth(0.8).stroke(GOLD);
  doc.fillColor(GOLD).font('Times-BoldItalic').fontSize(30).text(p.title, 60, 158, { width: W - 120, align: 'center' });

  // Statement, with the recipient's name set apart
  doc.fillColor(GREY).font('Times-Roman').fontSize(14).text('This is to certify that', 80, 212, { width: W - 160, align: 'center' });
  doc.fillColor(NAVY).font('Times-Bold').fontSize(26).text(p.recipient.name, 80, 234, { width: W - 160, align: 'center' });
  if (p.recipient.ref) doc.fillColor(GREY).font('Helvetica').fontSize(10).text(p.recipient.ref, 80, 266, { width: W - 160, align: 'center' });
  doc.fillColor('#1F2937').font('Times-Roman').fontSize(13).text(p.statement, 110, 288, { width: W - 220, align: 'center', lineGap: 3 });

  // Particulars, two columns
  const fields = p.fields.slice(0, 8);
  const top = Math.max(doc.y + 14, 350);
  const colW = (W - 260) / 2;
  fields.forEach(([label, value], i) => {
    const x = 130 + (i % 2) * (colW + 20);
    const y = top + Math.floor(i / 2) * 22;
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(label.toUpperCase(), x, y, { width: colW * 0.42 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(value, x + colW * 0.42, y - 1, { width: colW * 0.58, ellipsis: true, lineBreak: false });
  });

  // Dates and signatory
  const foot = H - 150;
  doc.fillColor(GREY).font('Helvetica').fontSize(9).text('DATE OF ISSUE', 70, foot);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(short(p.issuedAt), 70, foot + 13);
  if (p.validUntil) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text('VALID UNTIL', 70, foot + 36);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(short(p.validUntil), 70, foot + 49);
  }

  const sx = W / 2 - 110;
  doc.fillColor('#0E7A5F').font('Helvetica-Bold').fontSize(9).text('DIGITALLY SIGNED', sx, foot + 2, { width: 220, align: 'center' });
  doc.fillColor(NAVY).font('Times-Bold').fontSize(13).text(p.issuer.name, sx, foot + 18, { width: 220, align: 'center' });
  doc.moveTo(sx + 20, foot + 36).lineTo(sx + 200, foot + 36).lineWidth(0.6).stroke(GREY);
  doc.fillColor(GREY).font('Helvetica').fontSize(10).text(p.issuer.title, sx, foot + 40, { width: 220, align: 'center' });
  const signedAt = issued.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  doc.fillColor(GREY).font('Helvetica').fontSize(8).text(`Signed ${signedAt} IST`, sx, foot + 54, { width: 220, align: 'center' });

  // QR
  const q = 96;
  doc.image(qr, W - 70 - q, foot - 20, { width: q, height: q });
  doc.fillColor(GREY).font('Helvetica').fontSize(7.5).text('Scan to verify', W - 70 - q, foot + q - 14, { width: q, align: 'center' });

  // The foot line: everything needed to check the paper by hand
  doc.fillColor(GREY).font('Courier').fontSize(7.5).text(
    `Certificate No. ${p.serialNo}   ·   Signed with key ${opts.keyId} (Ed25519)   ·   Fingerprint ${opts.payloadHash.slice(0, 32)}`,
    40, H - 54, { width: W - 80, align: 'center' },
  );
  doc.fillColor(GREY).font('Helvetica').fontSize(7.5).text(`Verify at ${opts.verifyUrl.split('?')[0]} — or upload this PDF there. Any change to this document invalidates it.`, 40, H - 42, { width: W - 80, align: 'center' });

  doc.end();
  return done;
}
