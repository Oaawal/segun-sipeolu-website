import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } from "docx";

/**
 * Starter precedents, built as Word documents with {{fields}}. They are a
 * starting point in the firm's style: a lawyer should review and adapt the
 * wording before the firm relies on them, then replace them with the firm's
 * own precedents through the Templates page.
 */

const MAROON = "6D1F3B";
const p = (text: string, opts: { bold?: boolean; size?: number; align?: "center" | "right" | "justify"; after?: number; italic?: boolean } = {}) =>
  new Paragraph({
    alignment: opts.align === "center" ? AlignmentType.CENTER : opts.align === "right" ? AlignmentType.RIGHT : opts.align === "justify" ? AlignmentType.JUSTIFIED : undefined,
    spacing: { after: opts.after ?? 160, line: 300 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: opts.size ?? 23, font: "Times New Roman" })],
  });

const letterhead = () => [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "{{firm.name}}", bold: true, size: 32, color: MAROON, font: "Georgia" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Barristers, Solicitors & Arbitrators", italics: true, size: 18, font: "Georgia" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, border: { bottom: { color: "D4B06A", style: BorderStyle.SINGLE, size: 12, space: 6 } }, children: [new TextRun({ text: "{{firm.address}} · {{firm.phone}} · {{firm.email}}", size: 16, font: "Calibri" })] }),
];

async function build(children: Paragraph[]) {
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } } }, children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function starterTemplates() {
  return [
    {
      title: "Letter of engagement", category: "engagement", description: "Confirms instructions, scope, fees and responsibilities at the start of a matter.",
      file_name: "Letter of engagement.docx",
      bytes: await build([
        ...letterhead(),
        p("Our ref: {{matter.number}}", { size: 20 }), p("{{today}}", { size: 20, after: 280 }),
        p("{{client.name}}", { bold: true, after: 40 }), p("{{client.address}}", { after: 280 }),
        p("Dear Sir/Madam,"),
        p("RE: {{matter.title}}: LETTER OF ENGAGEMENT", { bold: true }),
        p("Thank you for instructing us. This letter confirms the terms on which {{firm.name}} will act for you in this matter.", { align: "justify" }),
        p("1. Scope of our work", { bold: true }),
        p("You have instructed us in respect of {{matter.practice_area}}, as follows: {{matter.description}}", { align: "justify" }),
        p("2. Who will handle your matter", { bold: true }),
        p("The partner responsible for your matter is {{partner.name}}, assisted by members of the firm as needed.", { align: "justify" }),
        p("3. Fees", { bold: true }),
        p("Our professional fee for this engagement is {{fee}}, exclusive of VAT and out-of-pocket expenses such as filing fees, which will be billed as incurred.", { align: "justify" }),
        p("4. Confidentiality", { bold: true }),
        p("We will keep your information confidential and process your personal data in line with the Nigeria Data Protection Act 2023.", { align: "justify" }),
        p("Please sign and return a copy of this letter to confirm your acceptance of these terms.", { align: "justify", after: 360 }),
        p("Yours faithfully,", { after: 600 }),
        p("{{user.name}}", { bold: true, after: 40 }), p("For: {{firm.name}}", { after: 480 }),
        p("ACCEPTED: ______________________   Date: ______________", { size: 20 }),
      ]),
    },
    {
      title: "Letter of demand", category: "letter", description: "Pre-action demand for payment, with a deadline before legal proceedings.",
      file_name: "Letter of demand.docx",
      bytes: await build([
        ...letterhead(),
        p("Our ref: {{matter.number}}", { size: 20 }), p("{{today}}", { size: 20, after: 280 }),
        p("{{opponent.name}}", { bold: true, after: 40 }), p("{{opponent.address}}", { after: 280 }),
        p("Dear Sir/Madam,"),
        p("RE: DEMAND FOR PAYMENT OF {{amount}} ON BEHALF OF {{client.name}}", { bold: true }),
        p("We are Solicitors to {{client.name}} (\"our client\") on whose instructions we write.", { align: "justify" }),
        p("Our client instructs us that {{facts}}", { align: "justify" }),
        p("Despite repeated requests, the sum of {{amount}} remains unpaid. We therefore demand that you pay the said sum to our client within {{days}} days of the receipt of this letter.", { align: "justify" }),
        p("Take notice that if you fail to do so, we have our client's firm instructions to commence legal proceedings against you without further notice, to recover the said sum together with interest and costs.", { align: "justify" }),
        p("Be guided accordingly.", { after: 360 }),
        p("Yours faithfully,", { after: 600 }),
        p("{{user.name}}", { bold: true, after: 40 }), p("For: {{firm.name}}"),
      ]),
    },
    {
      title: "Affidavit of service", category: "court", description: "Sworn proof that a process was served. Generate it from the service register entry.",
      file_name: "Affidavit of service.docx",
      bytes: await build([
        p("IN THE {{matter.court}}", { bold: true, align: "center", after: 40 }),
        p("SUIT NO: {{matter.suit_number}}", { bold: true, align: "right", after: 240 }),
        p("BETWEEN:", { bold: true }),
        p("{{parties}}", { align: "center", after: 320 }),
        p("AFFIDAVIT OF SERVICE", { bold: true, align: "center", after: 320 }),
        p("I, {{deponent}}, Nigerian, of {{deponent.address}}, do hereby make oath and state as follows:", { align: "justify" }),
        p("1. That I am a {{deponent.role}} and by virtue of my position I am conversant with the facts deposed to herein.", { align: "justify" }),
        p("2. That on {{service.date}} at about {{service.time}}, I served the {{service.title}} on {{service.party}} by {{service.method}}.", { align: "justify" }),
        p("3. That the said process was received by {{service.received_by}}. Proof: {{service.proof}}.", { align: "justify" }),
        p("4. That I make this affidavit in good faith, believing its contents to be true and correct, in accordance with the Oaths Act.", { align: "justify", after: 480 }),
        p("______________________", { align: "right", after: 40 }), p("DEPONENT", { bold: true, align: "right", after: 360 }),
        p("SWORN TO at the {{matter.court}} Registry this ____ day of ______________ 20___", { after: 480 }),
        p("BEFORE ME", { bold: true, after: 480 }), p("COMMISSIONER FOR OATHS", { bold: true }),
      ]),
    },
  ];
}
