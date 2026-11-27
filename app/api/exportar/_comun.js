// Lógica común de las rutas de exportación: control de acceso en el SERVIDOR,
// lectura de filtros, generación del archivo y registro en la bitácora.
// Formatos: ?formato=csv (predeterminado, idéntico a la clave de control) | xlsx | pdf.
// XLSX y PDF se arman a partir de las MISMAS filas y columnas del CSV.
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exigirPerfilApi } from '@/lib/auth';
import { registrarBitacora } from '@/lib/consultas';
import { ErrorExportacion, generarExportacion, leerFiltros } from '@/lib/consultas-reportes';

const json = (estado, cuerpo) => Response.json(cuerpo, { status: estado });

const FORMATOS = {
  csv: { tipo: 'text/csv; charset=utf-8', extension: '.csv' },
  xlsx: { tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
  pdf: { tipo: 'application/pdf', extension: '.pdf' },
};

const FUENTE = 'Plataforma de Rankings · Hackathon SBP 2026 (motor SQL)';

// Tipo de cada columna según su encabezado oficial.
// texto: códigos y etiquetas (conservan ceros a la izquierda); monto: #,##0.00; pct: 0.0000; entero: #,##0.
function tipoColumna(encabezado) {
  if (/^(Fecha|Codigo|Numero|Tipo|Destino|Archivo|Filtro|Ranking|Subactividad|Banco|Motivo|Significativo|Cambio_De_Lider|Alertas|Cuadre)/i.test(encabezado)) return 'texto';
  if (/Pct$/i.test(encabezado) || /^Ponderacion/i.test(encabezado)) return 'pct';
  if (/Saldo|Cartera|Monto/i.test(encabezado)) return 'monto';
  return 'entero';
}

const FORMATO_EXCEL = { monto: '#,##0.00', pct: '0.0000', entero: '#,##0' };
const esNumero = (v) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v);

function aFecha(v) {
  return /^\d{8}$/.test(v) ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)}` : v;
}

/** Texto del período a partir de las columnas Fecha* del archivo. */
function textoPeriodo(encabezados, filas) {
  const indices = encabezados.map((e, i) => (/^Fecha/i.test(e) ? i : -1)).filter((i) => i >= 0);
  const unicas = [...new Set(filas.flatMap((f) => indices.map((i) => f[i])).filter(Boolean))].sort();
  if (unicas.length === 0) return 'sin datos';
  return unicas.length === 1 ? aFecha(unicas[0]) : `${aFecha(unicas[0])} a ${aFecha(unicas[unicas.length - 1])}`;
}

function textoNumero(v, tipo) {
  if (!esNumero(v)) return v;
  const n = Number(v);
  if (tipo === 'monto') return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === 'pct') return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

async function aXlsx(encabezados, filas, titulo, periodo) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Plataforma de Rankings SBP';
  const hoja = libro.addWorksheet(titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 2 }] });
  const tipos = encabezados.map(tipoColumna);

  encabezados.forEach((e, i) => {
    let ancho = e.length;
    for (let k = 0; k < Math.min(filas.length, 500); k++) ancho = Math.max(ancho, String(filas[k][i] ?? '').length + (tipos[i] === 'monto' ? 4 : 0));
    hoja.getColumn(i + 1).width = Math.min(Math.max(ancho + 2, 8), 60);
  });

  const filaTitulo = hoja.addRow([`${titulo} · Fuente: ${FUENTE} · Período: ${periodo} · Datos ficticios`]);
  filaTitulo.font = { bold: true, size: 12, color: { argb: 'FF106003' } };

  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  filaEncabezado.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF106003' } }; });

  for (const f of filas) {
    const fila = hoja.addRow(f.map((v, i) => (tipos[i] !== 'texto' && esNumero(v) ? Number(v) : v)));
    fila.eachCell((c, n) => { c.numFmt = tipos[n - 1] === 'texto' ? '@' : FORMATO_EXCEL[tipos[n - 1]]; });
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

function aPdf(encabezados, filas, titulo, periodo) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const tipos = encabezados.map(tipoColumna);
  doc.setFontSize(14);
  doc.setTextColor(16, 96, 3);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Período: ${periodo} · Fuente: ${FUENTE} · Datos ficticios`, 40, 56);

  const columnStyles = {};
  tipos.forEach((t, i) => { if (t !== 'texto') columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    startY: 68,
    head: [encabezados],
    body: filas.map((f) => f.map((v, i) => (tipos[i] === 'texto' ? v : textoNumero(v, tipos[i])))),
    styles: { fontSize: encabezados.length > 10 ? 6 : 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [16, 96, 3], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 250, 241] },
    columnStyles,
    margin: { left: 40, right: 40, bottom: 36 },
    didDrawPage: () => {
      const pagina = doc.internal.getNumberOfPages();
      const alto = doc.internal.pageSize.getHeight();
      const ancho = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Página ${pagina} · Datos ficticios`, ancho - 40, alto - 18, { align: 'right' });
    },
  });
  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Responde una exportación (CSV, XLSX o PDF).
 * @param {Request} request
 * @param {string} conjunto  rankings | subactividades | calidad | exclusiones | movimientos | personalizado
 * @param {'publico'|'analista'|'administrador'} perfilMinimo  quien no lo alcanza recibe 403
 */
export async function responderExportacion(request, conjunto, perfilMinimo) {
  const { perfil, error } = await exigirPerfilApi(perfilMinimo);
  if (error) return error;

  const inicio = Date.now();
  try {
    const parametros = new URL(request.url).searchParams;
    const formato = (parametros.get('formato') || 'csv').toLowerCase();
    if (!FORMATOS[formato]) throw new ErrorExportacion(`Formato desconocido "${formato}". Valores válidos: csv, xlsx, pdf.`);
    const filtros = leerFiltros(parametros);
    const { csv, nombreArchivo: nombreCsv, filas } = await generarExportacion(conjunto, filtros);

    let cuerpo = csv;
    let nombreArchivo = nombreCsv;
    if (formato !== 'csv') {
      const [encabezados = [], ...datos] = parse(csv, { relax_column_count: true });
      const titulo = nombreCsv.replace(/\.csv$/, '');
      const periodo = textoPeriodo(encabezados, datos);
      cuerpo = formato === 'xlsx' ? await aXlsx(encabezados, datos, titulo, periodo) : aPdf(encabezados, datos, titulo, periodo);
      nombreArchivo = `${titulo}${FORMATOS[formato].extension}`;
    }

    // La bitácora nunca debe impedir una descarga.
    await registrarBitacora({
      perfil, operacion: 'exportar', detalle: `${nombreArchivo} (${filas} filas)`, resultado: 'ok', duracion_ms: Date.now() - inicio,
    }).catch(() => {});
    return new Response(cuerpo, {
      headers: {
        'Content-Type': FORMATOS[formato].tipo,
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
        'X-Filas': String(filas),
      },
    });
  } catch (e) {
    if (e instanceof ErrorExportacion) return json(e.estado, { error: 'solicitud_invalida', mensaje: e.message });
    console.error(`Error al exportar ${conjunto}:`, e);
    return json(500, { error: 'error_interno', mensaje: 'No se pudo generar el archivo. Intente de nuevo; si persiste, avise al administrador.' });
  }
}
