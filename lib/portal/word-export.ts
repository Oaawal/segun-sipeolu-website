import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { FIRM } from "./vocab";
import { fmtDay } from "./format";

/**
 * Builds editable Word (.docx) documents on the firm's letterhead: matter
 * summaries, meeting minutes and cause lists. Opens in Word, Google Docs and
 * LibreOffice; print to PDF from there when a PDF is needed.
 */

const MAROON = "6D1F3B";
const GOLD = "D4B06A";
const GREY = "6B6B6B";

export type Block =
  | { type: "heading"; text: string }
  | { type: "para"; text: string; muted?: boolean }
  | { type: "bullets"; items: string[] }
  | { type: "kv"; rows: [string, string][] }
  | { type: "table"; head: string[]; rows: string[][] };

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    border: { bottom: { color: GOLD, style: BorderStyle.SINGLE, size: 6, space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, color: MAROON, font: "Calibri", characterSpacing: 20 })],
  });
}

function para(text: string, muted = false) {
  return text.split("\n").map((line) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: line, size: 22, color: muted ? GREY : undefined, font: "Calibri" })] }));
}

function cell(text: string, opts: { bold?: boolean; shade?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: "F7F4F1" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: text.split("\n").map((l) => new Paragraph({ children: [new TextRun({ text: l, bold: opts.bold, size: 20, font: "Calibri" })] })),
  });
}

function render(b: Block): (Paragraph | Table)[] {
  switch (b.type) {
    case "heading": return [heading(b.text)];
    case "para": return para(b.text, b.muted);
    case "bullets": return b.items.length
      ? b.items.map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: t, size: 22, font: "Calibri" })] }))
      : para("None.", true);
    case "kv": return [new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: b.rows.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, shade: true, width: 30 }), cell(v || "—", { width: 70 })] })),
    })];
    case "table": return [new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: b.head.map((h) => cell(h, { bold: true, shade: true })) }),
        ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
      ],
    })];
  }
}

export async function buildDocx({ title, subtitle, blocks, confidential = true }: { title: string; subtitle?: string; blocks: Block[]; confidential?: boolean }): Promise<Buffer> {
  const doc = new Document({
    creator: `${FIRM.name} Practice Portal`,
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1000, left: 1100, right: 1100 } } },
      headers: {
        default: new Header({ children: [
          new Paragraph({ children: [new TextRun({ text: FIRM.name, bold: true, size: 28, color: MAROON, font: "Georgia" })] }),
          new Paragraph({ border: { bottom: { color: GOLD, style: BorderStyle.SINGLE, size: 12, space: 4 } }, children: [new TextRun({ text: "Barristers, Solicitors & Arbitrators · 12 Hakeem Balogun Street, CBD, Alausa, Ikeja, Lagos", size: 16, color: GREY })] }),
        ] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: `${confidential ? "Confidential and privileged · " : ""}Generated ${fmtDay(new Date().toISOString())} · Page `, size: 16, color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
        ] })] }),
      },
      children: [
        new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: title, bold: true, size: 36, font: "Georgia", color: "2B0D17" })] }),
        ...(subtitle ? [new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: subtitle, size: 22, color: GREY })] })] : []),
        ...blocks.flatMap(render),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

export function docxResponseHeaders(fileName: string) {
  const safe = fileName.replace(/[^A-Za-z0-9 ._-]+/g, "-").slice(0, 120);
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Cache-Control": "no-store",
  };
}
