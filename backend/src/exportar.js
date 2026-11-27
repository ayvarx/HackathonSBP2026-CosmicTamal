// Exportación de resultados en CSV, Excel (.xlsx) y PDF. Todas las cifras vienen del motor de rankings.
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export const COLUMNAS_RANKING = [
  "Fecha", "Ranking", "Posicion", "Codigo_Banco", "Banco",
  "Saldo_Actividad", "Total_Cartera_Local_Valida", "Ponderacion_Pct", "Operaciones_Validas",
];
export const COLUMNAS_DESGLOSE = ["Fecha", "Ranking", "Subactividad", "Codigo_Banco", "Saldo"];

const AVISO = "Datos ficticios con formato regulatorio. Uso informativo; no es una opinión formal de la SBP.";
const TITULOS = { rankings: "Rankings por actividad", desglose: "Desglose por subactividad" };

// Columnas numéricas: se escriben como número en Excel y alineadas a la derecha en PDF.
const NUMERICAS = new Set(["Posicion", "Saldo_Actividad", "Total_Cartera_Local_Valida", "Ponderacion_Pct", "Operaciones_Validas", "Saldo"]);

export function aCsv(filas, columnas) {
  const escapar = (v) => {
    const t = String(v ?? "");
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + [columnas.join(","), ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(","))].join("\r\n") + "\r\n";
}

export async function aExcel(filas, columnas, tipo, fecha) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Rankings de crédito bancario";
  const hoja = libro.addWorksheet(TITULOS[tipo].slice(0, 31));
  hoja.addRow([`${TITULOS[tipo]} · corte ${fecha}`]).font = { bold: true, size: 14, color: { argb: "FF094000" } };
  hoja.addRow([AVISO]).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  hoja.addRow([]);
  const cab = hoja.addRow(columnas);
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF267F18" } };
    c.alignment = { vertical: "middle" };
  });
  for (const f of filas) {
    hoja.addRow(columnas.map((c) => (NUMERICAS.has(c) && f[c] !== "" && !Number.isNaN(Number(f[c])) ? Number(f[c]) : f[c])));
  }
  columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    col.width = Math.max(12, c.length + 4);
    if (c.startsWith("Saldo") || c.startsWith("Total")) col.numFmt = "#,##0.00";
    if (c === "Ponderacion_Pct") col.numFmt = "0.0000";
  });
  hoja.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}

export function aPdf(filas, columnas, tipo, fecha) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: `${TITULOS[tipo]} ${fecha}` } });
    const trozos = [];
    doc.on("data", (t) => trozos.push(t));
    doc.on("end", () => resolve(Buffer.concat(trozos)));
    doc.on("error", reject);

    const ancho = doc.page.width - 72;
    const colAncho = ancho / columnas.length;
    const alto = 18;
    const pie = () => {
      doc.fontSize(7).fillColor("#6b7280").text(AVISO, 36, doc.page.height - 30, { width: ancho, align: "left", lineBreak: false });
    };
    const encabezado = (y) => {
      doc.rect(36, y, ancho, alto).fill("#267F18");
      doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
      columnas.forEach((c, i) => doc.text(c.replace(/_/g, " "), 40 + i * colAncho, y + 5, { width: colAncho - 8, align: NUMERICAS.has(c) ? "right" : "left", lineBreak: false }));
      doc.font("Helvetica");
    };

    doc.fillColor("#094000").fontSize(16).font("Helvetica-Bold").text(TITULOS[tipo], 36, 36);
    doc.fillColor("#374151").fontSize(9).font("Helvetica").text(`Corte ${fecha} · ${filas.length} filas`, 36, 58);
    let y = 80;
    encabezado(y);
    y += alto;
    filas.forEach((f, n) => {
      if (y + alto > doc.page.height - 44) {
        pie();
        doc.addPage();
        y = 36;
        encabezado(y);
        y += alto;
      }
      if (n % 2 === 0) doc.rect(36, y, ancho, alto).fill("#F3F9EF");
      doc.fillColor("#111827").fontSize(7.5);
      columnas.forEach((c, i) => {
        let v = f[c] ?? "";
        if (c.startsWith("Saldo") || c.startsWith("Total")) v = Number(v).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.text(String(v), 40 + i * colAncho, y + 5, { width: colAncho - 8, align: NUMERICAS.has(c) ? "right" : "left", lineBreak: false, ellipsis: true });
      });
      y += alto;
    });
    pie();
    doc.end();
  });
}
