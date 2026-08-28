import ExcelJS from "exceljs";
import type { PricingSimulationReport } from "@dachbyte-office/pricing-agent";

export const PRICING_WORKBOOK_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_PRICING_WORKBOOK_BYTES = 10 * 1024 * 1024;

const headerFill = "1F4E79";
const moneyNumberFormat = "@";

export async function renderPricingWorkbook(
  report: PricingSimulationReport,
): Promise<Buffer> {
  const artifactTimestamp = new Date(report.provenance.periodEnd);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DACHBYTE OFFICE";
  workbook.created = artifactTimestamp;
  workbook.modified = artifactTimestamp;

  summarySheet(workbook, report);
  pricingSheet(workbook, report);
  evidenceSheet(workbook, report);

  const bytes = Buffer.from(
    await workbook.xlsx.writeBuffer({
      useSharedStrings: true,
      useStyles: true,
    }),
  );
  if (bytes.byteLength > MAX_PRICING_WORKBOOK_BYTES)
    throw new Error("pricing_workbook_too_large");
  return bytes;
}

function summarySheet(
  workbook: ExcelJS.Workbook,
  report: PricingSimulationReport,
): void {
  const sheet = workbook.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [{ width: 28 }, { width: 72 }];
  sheet.addRow(["DACHBYTE OFFICE — Simulação de Precificação"]);
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: headerFill },
  };
  for (const [label, value] of [
    ["Status", report.status],
    ["Confiança", report.confidence],
    ["Canal", report.provenance.channel],
    ["Período inicial", report.provenance.periodStart],
    ["Período final", report.provenance.periodEnd],
    ["Task", report.provenance.taskId],
    ["Agente", report.provenance.agentId],
    ["Versão do agente", report.provenance.agentVersionId],
    ["Escritório", report.provenance.officeId],
  ])
    sheet.addRow([label, value]);
  sheet.getColumn(1).font = { bold: true };
}

function pricingSheet(
  workbook: ExcelJS.Workbook,
  report: PricingSimulationReport,
): void {
  const sheet = workbook.addWorksheet("Precificação", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "SKU",
    "Produto",
    "Fonte de custo",
    "Custo",
    "Moeda",
    "Preço atual",
    "Preço com desconto",
    "Break-even mínimo",
    "Status da ação",
    "Confiança",
    "Achados",
  ];
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));
  sheet.columns = [
    { width: 20 },
    { width: 36 },
    { width: 20 },
    { width: 18, style: { numFmt: moneyNumberFormat } },
    { width: 12 },
    { width: 18, style: { numFmt: moneyNumberFormat } },
    { width: 22, style: { numFmt: moneyNumberFormat } },
    { width: 24, style: { numFmt: moneyNumberFormat } },
    { width: 20 },
    { width: 14 },
    { width: 60 },
  ];
  for (const line of report.lines) {
    sheet.addRow([
      line.sku,
      line.name,
      line.cost?.source ?? "missing",
      line.cost?.cost ?? "",
      line.cost?.currency ?? line.listing?.currency ?? "",
      line.currentPrice ?? "",
      line.discountedPrice ?? "",
      line.breakEvenMinimumPrice ?? "",
      line.actionStatus,
      line.confidence,
      line.findings.map((finding) => finding.type).join(", "),
    ]);
  }
  sheet.getColumn(11).alignment = { wrapText: true, vertical: "top" };
}

function evidenceSheet(
  workbook: ExcelJS.Workbook,
  report: PricingSimulationReport,
): void {
  const sheet = workbook.addWorksheet("Evidências", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [{ width: 26 }, { width: 90 }];
  sheet.addRow(["Tipo", "Referência"]);
  styleHeader(sheet.getRow(1));
  for (const reference of report.provenance.costSourceReferences)
    sheet.addRow(["Custo", reference]);
  for (const reference of report.provenance.listingSourceReferences)
    sheet.addRow(["Listing", reference]);
  for (const ruleId of report.provenance.feeRuleIds)
    sheet.addRow(["Regra financeira", ruleId]);
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: headerFill },
  };
  row.alignment = { vertical: "middle", wrapText: true };
}
