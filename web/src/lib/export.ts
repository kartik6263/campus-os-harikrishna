/**
 * Files a screen hands the user: CSV registers, PDF reports and documents.
 *
 * Every "Export", "Download" and "Print" control goes through here, so each
 * one produces a real file carrying the institution's own name.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { inst, PRODUCT_NAME } from './institution';
import { saveBlob } from './records';
import { toast } from '../components/ui';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  /** How to show a value; defaults to the field as text. */
  value?: (row: T) => string | number | null | undefined;
}

function cell<T>(row: T, col: Column<T>): string {
  const v = col.value ? col.value(row) : (row as Record<string, unknown>)[col.key as string];
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Column definitions from the first row's own fields, skipping server-owned ones. */
export function autoColumns<T extends object>(rows: T[]): Column<T>[] {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!k.startsWith('_')) keys.add(k);
  return [...keys].map((k) => ({ key: k, label: k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) }));
}

const stamp = () => new Date().toISOString().slice(0, 10);
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function downloadCSV<T extends object>(name: string, rows: T[], columns: Column<T>[] = autoColumns(rows)) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(cell(r, c))).join(','))];
  // The BOM lets Excel read Hindi names correctly.
  saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${safeName(name)}-${stamp()}.csv`);
  toast.success(`${rows.length} row${rows.length === 1 ? '' : 's'} exported to CSV`);
}

/** A blank import template: just the header row, plus an example if given. */
export function downloadTemplate(name: string, headers: string[], example?: string[]) {
  const lines = [headers.join(','), ...(example ? [example.join(',')] : [])];
  saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${safeName(name)}-template.csv`);
  toast.success('Template downloaded');
}

/** Parses a CSV file into objects keyed by its header row. */
export async function readCSV(file: File): Promise<Record<string, string>[]> {
  const text = (await file.text()).replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export interface PdfSection {
  heading?: string;
  /** Label/value pairs, shown as a two-column block. */
  fields?: Array<[string, string | number | null | undefined]>;
  /** A table. */
  table?: { head: string[]; body: Array<Array<string | number | null | undefined>> };
  /** Free text paragraphs. */
  text?: string[];
  /** Start this section on a fresh page (e.g. one hall ticket per page). */
  pageBreak?: boolean;
}

export interface PdfOptions {
  title: string;
  subtitle?: string;
  /** Reference number shown top right, e.g. a receipt or certificate number. */
  reference?: string;
  sections: PdfSection[];
  /** A URL or text encoded as a QR code in the footer, for verification. */
  qr?: string;
  /** File name without extension. */
  fileName?: string;
  landscape?: boolean;
  /** Text printed for signature, e.g. "Registrar". */
  signatory?: string;
}

const INK: [number, number, number] = [22, 38, 74];
const SLATE: [number, number, number] = [90, 101, 119];
const MARIGOLD: [number, number, number] = [224, 149, 42];

// jsPDF's built-in fonts carry Latin only; Devanagari would print as boxes.
const latin = (s: unknown) => String(s ?? '').replace(/[^\u0000-ɏ–-…₹]/g, '').replace(/₹/g, 'Rs. ');

export async function buildPdf(opts: PdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const i = inst();

  // Letterhead.
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...MARIGOLD);
  doc.rect(0, 26, W, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(latin(i.name), 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(latin([i.address, i.city, i.state, i.pincode].filter(Boolean).join(', ') || i.tagline || ''), 14, 18);
  if (i.email || i.phone) doc.text(latin([i.email, i.phone].filter(Boolean).join('  ·  ')), 14, 22.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(latin(i.shortCode), W - 14, 12, { align: 'right' });

  let y = 38;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(latin(opts.title), 14, y);
  if (opts.reference) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(latin(opts.reference), W - 14, y, { align: 'right' });
  }
  y += 6;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(doc.splitTextToSize(latin(opts.subtitle), W - 28), 14, y);
    y += 8;
  }
  y += 2;

  for (const s of opts.sections) {
    if (y > H - 40 || (s.pageBreak && y > 50)) { doc.addPage(); y = 20; }
    if (s.heading) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(latin(s.heading), 14, y);
      doc.setDrawColor(211, 216, 224);
      doc.line(14, y + 1.5, W - 14, y + 1.5);
      y += 7;
    }
    if (s.fields?.length) {
      autoTable(doc, {
        startY: y,
        body: s.fields.map(([k, v]) => [latin(k), latin(v ?? '—')]),
        theme: 'plain',
        styles: { fontSize: 9.5, cellPadding: 1.6, textColor: INK },
        columnStyles: { 0: { cellWidth: 55, textColor: SLATE }, 1: { fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    if (s.table) {
      autoTable(doc, {
        startY: y,
        head: [s.table.head.map(latin)],
        body: s.table.body.map((r) => r.map((c) => latin(c ?? ''))),
        theme: 'grid',
        headStyles: { fillColor: INK, textColor: 255, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: [211, 216, 224] },
        alternateRowStyles: { fillColor: [245, 246, 249] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    if (s.text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      for (const p of s.text) {
        const lines = doc.splitTextToSize(latin(p), W - 28);
        if (y + lines.length * 5 > H - 30) { doc.addPage(); y = 20; }
        doc.text(lines, 14, y);
        y += lines.length * 5 + 2;
      }
    }
  }

  // Signature, QR and footer on the last page.
  const last = doc.getNumberOfPages();
  doc.setPage(last);
  if (opts.qr) {
    const png = await QRCode.toDataURL(opts.qr, { margin: 0, width: 240, color: { dark: '#16264A' } });
    doc.addImage(png, 'PNG', 14, H - 46, 26, 26);
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text('Scan to verify', 14, H - 17);
  }
  if (opts.signatory) {
    doc.setDrawColor(...SLATE);
    doc.line(W - 70, H - 26, W - 14, H - 26);
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(latin(opts.signatory), W - 42, H - 21, { align: 'center' });
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')} · ${PRODUCT_NAME}`, 14, H - 8);
    doc.text(`Page ${p} of ${pages}`, W - 14, H - 8, { align: 'right' });
  }
  return doc;
}

/** Builds and saves a PDF. */
export async function downloadPdf(opts: PdfOptions) {
  try {
    const doc = await buildPdf(opts);
    doc.save(`${safeName(opts.fileName ?? opts.title)}-${stamp()}.pdf`);
    toast.success(`${opts.title} downloaded`);
  } catch (err) {
    console.error(err);
    toast.error('Could not build the PDF');
  }
}

/** Builds a PDF and opens the browser's print dialog for it. */
export async function printPdf(opts: PdfOptions) {
  const doc = await buildPdf(opts);
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(url as unknown as string, '_blank');
}

/** A table register as a PDF — the common "Download register" case. */
export function downloadTablePdf<T extends object>(title: string, rows: T[], columns: Column<T>[] = autoColumns(rows), subtitle?: string) {
  return downloadPdf({
    title,
    subtitle: subtitle ?? `${rows.length} record${rows.length === 1 ? '' : 's'}`,
    landscape: columns.length > 6,
    sections: [{ table: { head: columns.map((c) => c.label), body: rows.map((r) => columns.map((c) => cell(r, c))) } }],
  });
}

/** A QR code as a data URL, for showing on screen. */
export const qrDataUrl = (text: string, size = 200) => QRCode.toDataURL(text, { margin: 1, width: size, color: { dark: '#16264A' } });

/** Copies text and confirms. */
export async function copyText(text: string, what = 'Link') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied to clipboard`);
  } catch {
    toast.error('Copy failed — your browser blocked clipboard access');
  }
}
