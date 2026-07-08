/** Generate a minimal valid PDF containing signed agreement text. */

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLines(text: string, maxLen = 80): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export type SignedDocumentInput = {
  title: string;
  body: string;
  signerName: string;
  signature: string;
  agreementVersion: string;
  signedAt: string;
  role: string;
};

export function generateSignedAgreementPdf(input: SignedDocumentInput): Uint8Array {
  const signedDate = new Date(input.signedAt).toLocaleString("en-US", { timeZoneName: "short" });
  const header = [
    `ZoomEats — ${input.title}`,
    `Version: ${input.agreementVersion}`,
    "",
    ...wrapLines(input.body),
    "",
    "— SIGNATURE RECORD —",
    `Signer: ${input.signerName}`,
    `Signature: ${input.signature}`,
    `Signed at: ${signedDate}`,
    `Role: ${input.role}`,
  ];

  const fontSize = 11;
  const lineHeight = 14;
  const startY = 750;
  const textOps = header
    .map((line, i) => `BT /F1 ${fontSize} Tf 50 ${startY - i * lineHeight} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const contentStream = textOps;
  const contentLen = contentStream.length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${contentLen} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
