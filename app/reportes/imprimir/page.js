// Versión imprimible del reporte personalizado (analista o administrador).
// Al imprimir se ocultan la cabecera, la franja y el pie del sitio; el encabezado propio de
// esta página repite la fuente, el período y el aviso de datos ficticios.
import Link from "next/link";
import MensajeError from "@/components/MensajeError";
import { exigirPerfil } from "@/lib/auth";
import { AVISO_DATOS_FICTICIOS, FUENTE } from "@/lib/consultas";
import { ErrorExportacion, leerFiltros, reportePersonalizado } from "@/lib/consultas-reportes";
import {
  formatearEntero, formatearFecha, formatearFechaHora, formatearMonto, formatearPorcentaje, nombreRanking,
} from "@/lib/formato";
import BotonImprimir from "./BotonImprimir";
import { etiquetaColumna } from "../etiquetas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reporte imprimible" };

const MAXIMO_FILAS = 2000; // evita páginas enormes; el CSV siempre trae todo

function celda(campo, valor) {
  switch (campo) {
    case "fecha": return formatearFecha(valor, "corta");
    case "ranking": return nombreRanking(valor);
    case "saldo_actividad":
    case "total_cartera_local_valida": return formatearMonto(valor);
    case "ponderacion_pct": return formatearPorcentaje(valor, 4);
    case "operaciones_validas":
    case "posicion": return formatearEntero(valor);
    default: return valor;
  }
}

const esNumerica = (campo) => ["posicion", "saldo_actividad", "total_cartera_local_valida", "ponderacion_pct", "operaciones_validas"].includes(campo);

export default async function PaginaImprimir({ searchParams }) {
  await exigirPerfil("analista");
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) sp.append(k, x);

  let reporte;
  try {
    reporte = await reportePersonalizado(leerFiltros(sp));
  } catch (e) {
    if (!(e instanceof ErrorExportacion)) throw e;
    return (
      <>
        <MensajeError titulo="No se pudo armar el reporte" mensaje={e.message} />
        <p className="mt-4"><Link href="/reportes" className="underline">Volver a Reportes</Link></p>
      </>
    );
  }

  const { columnas, filas, fechas } = reporte;
  const visibles = filas.slice(0, MAXIMO_FILAS);
  const volver = sp.toString() ? `/reportes?${sp}&vista=1` : "/reportes";

  return (
    <>
      <style>{`@media print {
        body > header, body > footer, .sticky, .saltar-contenido, .no-imprimir { display: none !important; }
        main { padding: 0 !important; }
        .marco-tabla { overflow: visible !important; }
        tr { break-inside: avoid; }
        thead { display: table-header-group; }
      }`}</style>

      <div className="no-imprimir mb-6 flex flex-wrap items-center gap-3">
        <BotonImprimir />
        <Link href={volver} className="boton boton-secundario">Volver al reporte</Link>
      </div>

      <article>
        <header className="mb-4 border-b border-borde pb-3">
          <h1>Reporte personalizado de rankings de crédito</h1>
          <p className="text-sm">Período: {fechas.map((f) => formatearFecha(f)).join(", ")}</p>
          <p className="text-sm">{FUENTE}</p>
          <p className="text-sm font-semibold">{AVISO_DATOS_FICTICIOS}</p>
          <p className="text-sm text-texto-suave">Generado: {formatearFechaHora(new Date().toISOString())} · {formatearEntero(filas.length)} filas</p>
        </header>

        {filas.length === 0 ? (
          <p>Ninguna fila cumple la selección.</p>
        ) : (
          <div className="marco-tabla">
            <table className="tabla-datos">
              <thead>
                <tr>{columnas.map(([campo, encabezado]) => <th key={campo} scope="col" className={esNumerica(campo) ? "num" : ""}>{etiquetaColumna(campo, encabezado)}</th>)}</tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={i}>
                    {columnas.map(([campo]) => <td key={campo} className={esNumerica(campo) ? "num" : ""}>{celda(campo, f[campo])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filas.length > MAXIMO_FILAS && (
          <p className="mt-2 text-sm">Se muestran las primeras {formatearEntero(MAXIMO_FILAS)} filas; descargue el CSV para ver todas.</p>
        )}
      </article>
    </>
  );
}
