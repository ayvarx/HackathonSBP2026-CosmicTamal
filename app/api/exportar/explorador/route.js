// GET /api/exportar/explorador?datos=…&f=…&formato=csv|xlsx|pdf — descarga del Explorador de datos
// con los filtros aplicados (perfil Analista o superior). Vuelve a leer los datos, aplica la MISMA
// función de filtrado y orden que la pantalla (lib/explorador.js) y exporta solo las columnas
// visibles, en el orden mostrado y con los encabezados originales.
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cargarConjunto } from "@/app/explorar/datos";
import { exigirPerfilApi } from "@/lib/auth";
import { registrarBitacora } from "@/lib/consultas";
import {
  aplicarExplorador,
  CLAVES_CONJUNTO,
  columnasVisibles,
  CONJUNTOS_EXPLORADOR,
  hayFiltros,
  leerEstado,
  valorTexto,
} from "@/lib/explorador";

export const dynamic = "force-dynamic";

const FORMATOS = {
  csv: { tipo: "text/csv; charset=utf-8", extension: ".csv" },
  xlsx: { tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: ".xlsx" },
  pdf: { tipo: "application/pdf", extension: ".pdf" },
};
const FUENTE = "Plataforma de Rankings · Hackathon SBP 2026 (motor SQL)";
const FORMATO_EXCEL = { monto: "#,##0.00", pct: "0.0000", entero: "#,##0" };
const NUMERICO = new Set(["monto", "pct", "entero"]);
const esNumero = (v) => /^-?\d+(\.\d+)?$/.test(v);
const json = (estado, cuerpo) => Response.json(cuerpo, { status: estado });

function textoNumero(v, tipo) {
  if (!esNumero(v)) return v;
  const n = Number(v);
  if (tipo === "monto") return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === "pct") return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

async function aXlsx(columnas, filas, titulo, subtitulo) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Plataforma de Rankings SBP";
  const hoja = libro.addWorksheet(titulo.slice(0, 31), { views: [{ state: "frozen", ySplit: 2 }] });
  columnas.forEach((c, i) => {
    let ancho = c.encabezado.length;
    for (let k = 0; k < Math.min(filas.length, 500); k++) ancho = Math.max(ancho, String(filas[k][i] ?? "").length + (c.tipo === "monto" ? 4 : 0));
    hoja.getColumn(i + 1).width = Math.min(Math.max(ancho + 2, 8), 60);
  });
  const filaTitulo = hoja.addRow([`${titulo} · ${subtitulo} · Fuente: ${FUENTE} · Datos ficticios`]);
  filaTitulo.font = { bold: true, size: 12, color: { argb: "FF106003" } };
  const encabezado = hoja.addRow(columnas.map((c) => c.encabezado));
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF106003" } }; });
  hoja.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columnas.length } };
  for (const f of filas) {
    const fila = hoja.addRow(f.map((v, i) => (NUMERICO.has(columnas[i].tipo) && esNumero(v) ? Number(v) : v)));
    fila.eachCell((c, n) => { c.numFmt = FORMATO_EXCEL[columnas[n - 1].tipo] ?? "@"; });
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

function aPdf(columnas, filas, titulo, subtitulo) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.setTextColor(16, 96, 3);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(doc.splitTextToSize(`${subtitulo} · Fuente: ${FUENTE} · Datos ficticios`, 700), 40, 56);
  const columnStyles = {};
  columnas.forEach((c, i) => { if (NUMERICO.has(c.tipo)) columnStyles[i] = { halign: "right" }; });
  autoTable(doc, {
    startY: 76,
    head: [columnas.map((c) => c.encabezado)],
    body: filas.map((f) => f.map((v, i) => (NUMERICO.has(columnas[i].tipo) ? textoNumero(v, columnas[i].tipo) : v))),
    styles: { fontSize: columnas.length > 10 ? 6 : 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [16, 96, 3], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [242, 250, 241] },
    columnStyles,
    margin: { left: 40, right: 40, bottom: 36 },
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      const ancho = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Página ${doc.internal.getNumberOfPages()} · Datos ficticios`, ancho - 40, alto - 18, { align: "right" });
    },
  });
  return Buffer.from(doc.output("arraybuffer"));
}

export async function GET(request) {
  const { perfil, error } = await exigirPerfilApi("analista");
  if (error) return error;
  const inicio = Date.now();
  try {
    const parametros = new URL(request.url).searchParams;
    const formato = (parametros.get("formato") || "csv").toLowerCase();
    if (!FORMATOS[formato]) return json(400, { error: "solicitud_invalida", mensaje: `Formato desconocido "${formato}". Valores válidos: csv, xlsx, pdf.` });
    const datos = parametros.get("datos") || "rankings";
    if (!CLAVES_CONJUNTO.includes(datos)) {
      return json(400, { error: "solicitud_invalida", mensaje: `Conjunto desconocido "${datos}". Valores válidos: ${CLAVES_CONJUNTO.join(", ")}.` });
    }
    const estado = leerEstado(parametros.get("f") || "", datos);
    const { fechas, filas: todas } = await cargarConjunto(datos);
    if (fechas.length === 0) return json(404, { error: "sin_datos", mensaje: "Aún no hay cortes cargados. Cargue un corte AT03 desde el perfil Administrador." });

    const filas = aplicarExplorador(todas, datos, estado);
    if (filas.length === 0) {
      return json(404, { error: "sin_filas", mensaje: "Ninguna fila cumple los filtros aplicados. Quite o cambie algún filtro e intente de nuevo." });
    }
    const columnas = columnasVisibles(datos, estado);
    const matriz = filas.map((f) => columnas.map((c) => valorTexto(f[c.campo])));
    const base = `explorador-${datos}${hayFiltros(estado) ? "-filtrado" : ""}`;
    const titulo = `Explorador · ${CONJUNTOS_EXPLORADOR[datos].etiqueta}`;
    const subtitulo = `${filas.length} de ${todas.length} filas${hayFiltros(estado) ? " (con filtros)" : ""}`;

    let cuerpo;
    if (formato === "csv") cuerpo = stringify([columnas.map((c) => c.encabezado), ...matriz], { record_delimiter: "\r\n" });
    else if (formato === "xlsx") cuerpo = await aXlsx(columnas, matriz, titulo, subtitulo);
    else cuerpo = aPdf(columnas, matriz, titulo, subtitulo);
    const nombreArchivo = `${base}${FORMATOS[formato].extension}`;

    await registrarBitacora({
      perfil, operacion: "exportar", detalle: `${nombreArchivo} (${filas.length} filas)`, resultado: "ok", duracion_ms: Date.now() - inicio,
    }).catch(() => {});
    return new Response(cuerpo, {
      headers: {
        "Content-Type": FORMATOS[formato].tipo,
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        "Cache-Control": "no-store",
        "X-Filas": String(filas.length),
      },
    });
  } catch (e) {
    console.error("Error al exportar el explorador:", e);
    return json(500, { error: "error_interno", mensaje: "No se pudo generar el archivo. Intente de nuevo; si persiste, avise al administrador." });
  }
}
