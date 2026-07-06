import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import type { ComplianceOverview, CompliancePartnerRow } from "./complianceDashboard.ts";

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateComplianceReportPdf(
  overview: ComplianceOverview,
  rows: CompliancePartnerRow[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([612, 792]);
  let y = 750;

  const newPage = () => {
    page = doc.addPage([612, 792]);
    y = 750;
  };

  const draw = (text: string, size = 10, useBold = false) => {
    if (y < 60) newPage();
    page.drawText(text, { x: 50, y, size, font: useBold ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 5;
  };

  draw("ZoomEats Compliance Dashboard Report", 16, true);
  draw(`Generated ${new Date(overview.generated_at).toLocaleString()}`, 9);
  y -= 8;

  const s = overview.stats;
  draw("Summary", 12, true);
  draw(`Compliance score (avg): ${s.compliance_percentage}%`);
  draw(`Partners: ${s.total_partners} total · ${s.compliant_partners} fully compliant`);
  draw(`Missing agreements: ${s.missing_agreements}`);
  draw(`Expired licenses: ${s.expired_licenses} · Expired insurance: ${s.expired_insurance}`);
  draw(`Pending approvals: ${s.pending_approvals} · Pending background checks: ${s.pending_background_checks}`);
  draw(`Drivers: ${s.drivers_approved}/${s.drivers_total} approved`);
  draw(`Restaurants: ${s.restaurants_approved}/${s.restaurants_total} approved`);
  y -= 10;

  draw("Partner Detail", 12, true);
  for (const r of rows.slice(0, 80)) {
    const line = `${r.role === "delivery" ? "Driver" : "Restaurant"} · ${r.name} · ${r.email} · Score ${r.compliance_score}% · ${r.approval_status}`;
    for (const l of wrapText(line, 95)) draw(l, 9);
    if (r.issues.length) draw(`  Issues: ${r.issues.join(", ")}`, 8);
    if (r.missing_agreements.length) draw(`  Missing: ${r.missing_agreements.join(", ")}`, 8);
    y -= 4;
  }

  if (rows.length > 80) draw(`… and ${rows.length - 80} more rows (see CSV export)`, 9);

  page.drawText("Confidential — ZoomEats Compliance", {
    x: 50,
    y: 30,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}
