// Reportes (/reportes) — descargas de los entregables 2 a 5 y reporte personalizado.
//   Público: rankings y subactividades.
//   Analista y administrador: además calidad, exclusiones, movimientos y reporte personalizado.
// Los permisos se verifican aquí (servidor) y de nuevo en cada ruta /api/exportar/*.
import Link from "next/link";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil, puede } from "@/lib/auth";
import { RANKINGS, catalogos, periodos } from "@/lib/consultas";
import { ErrorExportacion, COLUMNAS_PERSONALIZADO, leerFiltros, reportePersonalizado } from "@/lib/consultas-reportes";
import { formatearEntero, formatearFecha, nombreBanco, nombreRanking } from "@/lib/formato";
import DescargaMovimientos from "./DescargaMovimientos";
import { etiquetaColumna } from "./etiquetas";
import FormularioPersonalizado from "./FormularioPersonalizado";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Reportes" };

const MAXIMO_VISTA_PREVIA = 100;

// Tipo de columna de la tabla según el campo (para formatear sin float).
const TIPO_COLUMNA = {
  fecha: "fecha", ranking: "ranking", posicion: "entero", codigo_banco: "codigo", banco: "texto",
  saldo_actividad: "monto", total_cartera_local_valida: "monto", ponderacion_pct: "porcentaje", operaciones_validas: "entero",
};

/** Convierte la selección del formulario en un texto de consulta (?fechas=..&rankings=..). */
function consultaDeSeleccion(filtros) {
  const q = new URLSearchParams();
  for (const [nombre, valores] of [["fechas", filtros.fechas], ["rankings", filtros.rankings], ["bancos", filtros.bancos], ["columnas", filtros.columnas]]) {
    if (valores.length) q.set(nombre, valores.join(","));
  }
  return q.toString();
}

export default async function PaginaReportes({ searchParams }) {
  const perfil = await exigirPerfil("publico");
  const analista = puede(perfil, "reportes_personalizados");
  const params = await searchParams;

  const lista = await periodos();
  if (lista.length === 0) {
    return (
      <>
        <EncabezadoPagina titulo="Reportes y descargas" />
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={puede(perfil, "cargar_cortes") ? { href: "/admin", texto: "Cargar un corte" } : undefined}>
          Las descargas estarán disponibles cuando el administrador cargue al menos un corte AT03.
        </EstadoVacio>
      </>
    );
  }

  // Filtros de las descargas (período y ranking), tomados de la URL.
  const periodo = typeof params.periodo === "string" && lista.some((p) => p.fecha === params.periodo) ? params.periodo : "";
  const ranking = typeof params.ranking === "string" && RANKINGS.some((r) => r.clave === params.ranking) ? params.ranking : "";
  const unRanking = ranking ? { ranking } : {};
  const unPeriodo = periodo ? { fecha: periodo } : {};
  const textoAlcance = `${periodo ? formatearFecha(periodo) : "todos los períodos cargados"}${ranking ? `, ranking ${nombreRanking(ranking)}` : ""}`;

  // Reporte personalizado (solo analista+): vista previa si se pidió.
  let vista = null;
  let errorVista = null;
  let filtrosPersonalizado = null;
  let consultaPersonalizada = "";
  let catalogoBancos = [];
  if (analista) {
    catalogoBancos = (await catalogos()).bancos;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) sp.append(k, x);
    try {
      filtrosPersonalizado = leerFiltros(sp);
      consultaPersonalizada = consultaDeSeleccion(filtrosPersonalizado);
      if (params.vista === "1") vista = await reportePersonalizado(filtrosPersonalizado);
    } catch (e) {
      if (!(e instanceof ErrorExportacion)) throw e;
      errorVista = e.message;
    }
  }

  const columnasTabla = vista?.columnas.map(([campo, encabezado]) => ({
    clave: campo, titulo: etiquetaColumna(campo, encabezado), tipo: TIPO_COLUMNA[campo] ?? "texto", decimales: 4,
  }));
  const filasVista = vista?.filas.slice(0, MAXIMO_VISTA_PREVIA).map((f, i) => ({ ...f, _n: i }));
  const hrefPersonalizado = (ruta) => (consultaPersonalizada ? `${ruta}?${consultaPersonalizada}` : ruta);

  return (
    <>
      <EncabezadoPagina
        titulo="Reportes y descargas"
        descripcion="Descargas en CSV, Excel o PDF."
      />

      <section aria-labelledby="t-alcance" className="tarjeta mb-6">
        <h2 id="t-alcance" className="mb-3">Alcance</h2>
        <Filtros
          campos={[
            { nombre: "periodo", etiqueta: "Período", textoTodos: "Todos los períodos", opciones: lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) })) },
            { nombre: "ranking", etiqueta: "Ranking", textoTodos: "Todos los rankings", opciones: RANKINGS.map((r) => ({ valor: r.clave, texto: r.nombre })) },
          ]}
        />
        <p className="mt-3 text-sm text-texto-suave">Todas las descargas de esta pantalla incluirán: {textoAlcance}. Sin filtros se descarga todo.</p>
        <div className="mt-3 flex flex-row flex-wrap items-start gap-2" role="group" aria-label="Acceso rápido">
          <BotonDescarga href="/api/exportar/rankings" parametros={{ ...unPeriodo, ...unRanking }} texto="Rankings consolidados" variante="primario" />
          <BotonDescarga href="/api/exportar/subactividades" parametros={{ ...unPeriodo, ...unRanking }} texto="Desglose por subactividad" />
        </div>
      </section>

      <section aria-labelledby="t-descargas" className="mb-8">
        <h2 id="t-descargas" className="mb-3">Descargas</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="tarjeta">
            <h3>Rankings por período</h3>
            <p className="mb-3 text-sm text-texto-suave">Posición, saldo de la actividad, cartera local válida, ponderación y número de préstamos de cada banco.</p>
            <BotonDescarga href="/api/exportar/rankings" parametros={{ ...unPeriodo, ...unRanking }} texto="Descargar rankings" variante="primario" descripcion="Fecha, Ranking, Posicion, Codigo_Banco, Banco, Saldo_Actividad, Total_Cartera_Local_Valida, Ponderacion_Pct, Operaciones_Validas" />
          </div>
          <div className="tarjeta">
            <h3>Desglose por subactividad</h3>
            <p className="mb-3 text-sm text-texto-suave">Saldo de cada banco en cada subactividad de cada ranking.</p>
            <BotonDescarga href="/api/exportar/subactividades" parametros={{ ...unPeriodo, ...unRanking }} texto="Descargar subactividades" variante="primario" descripcion="Fecha, Ranking, Subactividad, Codigo_Banco, Saldo" />
          </div>
          <div className="tarjeta">
            <h3>Calidad de datos</h3>
            <p className="mb-3 text-sm text-texto-suave">Conteos en cascada E1 a E4, universo local válido y cuadre.</p>
            <BotonDescarga href="/api/exportar/calidad" parametros={unPeriodo} texto="Descargar calidad" descripcion="Un renglón por período (el filtro de ranking no aplica)." />
          </div>
          <div className="tarjeta">
            <h3>Filas excluidas</h3>
            <p className="mb-3 text-sm text-texto-suave">Cada préstamo descartado con el filtro (E1 a E4) que lo excluyó y su fila en el archivo.</p>
            <BotonDescarga href="/api/exportar/exclusiones" parametros={unPeriodo} texto="Descargar exclusiones" descripcion="Archivo grande: varios miles de filas." />
          </div>
          {analista ? (
            <>
              <div className="tarjeta">
                <h3>Movimientos de posición</h3>
                <p className="mb-3 text-sm text-texto-suave">Cambio de posición y de saldo entre períodos; sin período, todos los pares.</p>
                <DescargaMovimientos parametros={{ actual: periodo, ...unRanking }} descripcion={periodo ? "Con período elegido: movimientos hacia ese período." : undefined} />
              </div>
            </>
          ) : (
            <div className="tarjeta md:col-span-2">
              <h3>Más reportes con el perfil Analista</h3>
              <p className="text-sm text-texto-suave">
                Los movimientos de posición entre períodos y los reportes personalizados requieren el perfil Analista.{" "}
                <Link href="/perfil" className="underline">Cambiar de perfil</Link>
              </p>
            </div>
          )}
        </div>
      </section>

      {analista && (
        <section aria-labelledby="t-personalizado" className="mb-8">
          <h2 id="t-personalizado" className="mb-1">Reporte personalizado</h2>
          <p className="mb-4 text-texto-suave">Elija períodos, rankings, bancos y columnas. Si no marca nada en un grupo, se incluyen todos.</p>
          <FormularioPersonalizado
            periodos={lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) }))}
            rankings={RANKINGS.map((r) => ({ valor: r.clave, texto: r.nombre }))}
            bancos={catalogoBancos.map((b) => ({ valor: b.codigo_banco, texto: nombreBanco(b.codigo_banco, b.nombre_ficticio) }))}
            columnas={COLUMNAS_PERSONALIZADO.map(([campo, encabezado]) => ({ valor: encabezado, texto: etiquetaColumna(campo, encabezado), campo }))}
            seleccion={filtrosPersonalizado ?? { fechas: [], rankings: [], bancos: [], columnas: [] }}
          />

          {errorVista && <div className="mt-4"><MensajeError titulo="No se pudo armar el reporte" mensaje={errorVista} /></div>}

          {vista && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-texto-suave">
                  Vista previa: {formatearEntero(vista.filas.length)} filas
                  {vista.filas.length > MAXIMO_VISTA_PREVIA ? ` (se muestran las primeras ${MAXIMO_VISTA_PREVIA}; el CSV las incluye todas)` : ""}.
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <BotonDescarga href={hrefPersonalizado("/api/exportar/personalizado")} texto="Descargar reporte" variante="primario" />
                  <Link href={hrefPersonalizado("/reportes/imprimir")} className="boton boton-secundario">Versión imprimible</Link>
                </div>
              </div>
              {vista.filas.length === 0 ? (
                <EstadoVacio titulo="Sin filas">Ninguna fila cumple la selección. Amplíe los rankings o bancos.</EstadoVacio>
              ) : (
                <TablaOrdenable titulo="Vista previa del reporte personalizado" columnas={columnasTabla} filas={filasVista} claveFila="_n" compacta />
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
