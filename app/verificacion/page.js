// Verificación (/verificacion) — los seis puntos de verificación de un período.
// Pública. Los rankings se ven de uno en uno con un selector (?ranking=). Cada sección tiene ancla (#p1 ... #p6).
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import Filtros from "@/components/Filtros";
import TablaOrdenable from "@/components/TablaOrdenable";
import BotonDescarga from "@/components/BotonDescarga";
import { exigirPerfil } from "@/lib/auth";
import { calidad, periodos, RANKINGS, rankings, reconciliaciones } from "@/lib/consultas";
import { elegirPeriodo, reclasificacionSb21, totalesPorSubactividad } from "@/lib/consultas-calidad";
import Link from "next/link";
import { formatearEntero, formatearFecha, formatearMontoCompacto, nombreRanking } from "@/lib/formato";

// "5,152.10 millones" → "5,152.1 M".
const M = (v) => formatearMontoCompacto(v).replace(/(\.\d)\d millones$/, "$1 M").replace(/ millones$/, " M");
const SIN_TARJETA = "[&_.tarjeta]:m-0 [&_.tarjeta]:border-0 [&_.tarjeta]:bg-transparent [&_.tarjeta]:p-0 [&_.tarjeta]:shadow-none [&_select]:min-w-[13rem]";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Verificación" };

const PUNTOS = [
  ["p1", "1. Calidad"],
  ["p2", "2. Hipotecario a Agropecuario"],
  ["p3", "3. Comercio y Consumo"],
  ["p4", "4. Cartera y ponderación"],
  ["p5", "5. Subactividades"],
  ["p6", "6. Períodos y reconciliaciones"],
];

// Tabla de un ranking: posición, banco, saldo, ponderación y operaciones.
function TablaRanking({ filas }) {
  return (
    <div className="w-full [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
      <TablaOrdenable
        claveFila="codigo_banco"
        compacta
        ordenInicial={{ clave: "posicion", direccion: "asc" }}
        filas={filas}
        columnas={[
          { clave: "posicion", titulo: "Pos.", tipo: "entero" },
          { clave: "codigo_banco", titulo: "Cód.", tipo: "codigo" },
          { clave: "banco", titulo: "Banco", tipo: "texto", alinear: "izquierda" },
          { clave: "saldo_actividad", titulo: "Saldo actividad", tipo: "monto" },
          { clave: "ponderacion_pct", titulo: "Ponderación", tipo: "porcentaje", decimales: 4 },
          { clave: "operaciones_validas", titulo: "Operaciones", tipo: "entero" },
        ]}
      />
    </div>
  );
}

// Selector de ranking (?ranking=): un enlace por ranking; el elegido queda marcado.
function SelectorRanking({ claves, elegido, fecha, ancla }) {
  return (
    <nav aria-label="Elegir ranking" className="flex flex-wrap gap-2">
      {claves.map((clave) => {
        const activo = clave === elegido;
        return (
          <Link
            key={clave}
            href={`/verificacion?periodo=${fecha}&ranking=${clave}#${ancla}`}
            scroll={false}
            aria-current={activo ? "true" : undefined}
            className={activo ? "boton" : "boton boton-secundario"}
          >
            {nombreRanking(clave)}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function PaginaVerificacion({ searchParams }) {
  await exigirPerfil("publico");
  const sp = await searchParams;
  const pedido = (Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo) || "";
  const pedidoRanking = String((Array.isArray(sp.ranking) ? sp.ranking[0] : sp.ranking) || "").toUpperCase();
  const rankingElegido = RANKINGS.some((r) => r.clave === pedidoRanking) ? pedidoRanking : RANKINGS[0].clave;

  let d;
  try {
    const lista = await periodos();
    const fecha = elegirPeriodo(lista, pedido);
    if (!fecha) d = null;
    else {
      const [[q], ranks, subs, sb21, recs] = await Promise.all([
        calidad(fecha),
        rankings({ fecha }),
        totalesPorSubactividad(fecha),
        reclasificacionSb21(fecha),
        Promise.all(lista.map((p) => reconciliaciones(p.fecha))),
      ]);
      d = { lista, fecha, q, ranks, subs, sb21, recs };
    }
  } catch (e) {
    return (
      <>
        <EncabezadoPagina titulo="Verificación" />
        <MensajeError titulo="No se pudo leer la verificación" mensaje="La base de datos no respondió. Revise que esté disponible y vuelva a intentarlo." detalle={String(e?.message ?? e)} />
      </>
    );
  }
  if (!d) {
    return (
      <>
        <EncabezadoPagina titulo="Verificación" />
        <EstadoVacio titulo="Todavía no hay cortes cargados" accion={{ href: "/admin", texto: "Cargar un corte (administrador)" }}>
          La verificación aparece cuando se carga al menos un archivo AT03.
        </EstadoVacio>
      </>
    );
  }

  const { lista, fecha, q, ranks, subs, sb21, recs } = d;
  const porRanking = (clave) => ranks.filter((r) => r.ranking === clave);
  const principales = RANKINGS.filter((r) => r.tipo === "obligatorio").map((r) => r.clave);
  const otros = RANKINGS.filter((r) => r.tipo !== "obligatorio").map((r) => r.clave);

  // Punto 4: una fila por banco con su total de cartera (igual en los 6 rankings) y las 6 ponderaciones.
  const bancos = new Map();
  for (const r of ranks) {
    if (!bancos.has(r.codigo_banco)) {
      bancos.set(r.codigo_banco, { codigo_banco: r.codigo_banco, banco: r.banco, total_cartera_local_valida: r.total_cartera_local_valida });
    }
    bancos.get(r.codigo_banco)[`pond_${r.ranking}`] = r.ponderacion_pct;
  }
  const filasBancos = [...bancos.values()];

  // Punto 6: estado de cada reconciliación en cada período.
  const filasPeriodos = lista.map((p, i) => {
    const fila = { fecha: p.fecha, filas_leidas: p.filas_leidas, universo_local_valido: p.universo_local_valido };
    for (const r of recs[i].resumen) {
      fila[`rec${r.reconciliacion}`] = r.comprobaciones === 0 ? "Sin datos" : r.todas_cuadran ? `Cuadra (${r.cuadran}/${r.comprobaciones})` : `NO cuadra (${r.cuadran}/${r.comprobaciones})`;
    }
    return fila;
  });
  const recActual = recs[lista.findIndex((p) => p.fecha === fecha)];
  const NOMBRE_REC = { 1: "Subactividades = actividad", 2: "Actividades = cartera", 3: "Bancos = universo" };
  const detalleRec = recActual.detalle.map((x, i) => ({ ...x, comprobacion: NOMBRE_REC[x.reconciliacion] ?? String(x.reconciliacion), clave: `${x.reconciliacion}-${x.ranking}-${x.codigo_banco}-${i}` }));
  const resumenSub = subs.map((s) => ({ ...s, clave: `${s.ranking}-${s.subactividad}` }));

  return (
    <>
      <EncabezadoPagina titulo="Verificación y reconciliaciones">
        <div className={SIN_TARJETA}>
          <Filtros
            campos={[{ nombre: "periodo", etiqueta: "Período", predeterminado: fecha, opciones: lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) })) }]}
            conLimpiar={false}
          />
        </div>
        <BotonDescarga href="/api/exportar/rankings" parametros={{ periodo: fecha }} texto="Rankings del período" />
      </EncabezadoPagina>

      <nav aria-label="Puntos de verificación" className="mt-4 flex flex-wrap gap-2">
        {PUNTOS.map(([id, texto]) => (
          <a key={id} href={`#${id}`} className="boton boton-secundario">{texto}</a>
        ))}
      </nav>

      <section id="p1" className="mt-8 scroll-mt-24" aria-labelledby="h-p1">
        <h2 id="h-p1">1. Reporte de calidad</h2>
        <p className="mt-2">
          <strong>{formatearEntero(q.filas_leidas)}</strong> filas leídas · <strong>{formatearEntero(q.universo_local_valido)}</strong> operaciones válidas · saldo válido <strong>{M(q.saldo_universo_local_valido)}</strong> · <a href={`/calidad?periodo=${fecha}`}>ver detalle en Calidad</a>
        </p>
      </section>

      <section id="p2" className="mt-8 scroll-mt-24" aria-labelledby="h-p2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="h-p2" className="mb-0">2. Rankings Hipotecario, Construcción, Industria y Agropecuario</h2>
          <SelectorRanking claves={principales} elegido={rankingElegido} fecha={fecha} ancla="p2" />
        </div>
        {principales.includes(rankingElegido) ? (
          <TablaRanking filas={porRanking(rankingElegido)} />
        ) : null}
      </section>

      <section id="p3" className="mt-8 scroll-mt-24" aria-labelledby="h-p3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="h-p3" className="mb-0">3. Rankings Comercio y Consumo</h2>
          <SelectorRanking claves={otros} elegido={rankingElegido} fecha={fecha} ancla="p3" />
        </div>
        {otros.includes(rankingElegido) ? (
          <TablaRanking filas={porRanking(rankingElegido)} />
        ) : null}
      </section>

      <section id="p4" className="mt-8 scroll-mt-24" aria-labelledby="h-p4">
        <h2 id="h-p4">4. Total de cartera local válida y ponderación</h2>
        <div className="w-full [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <TablaOrdenable
          claveFila="codigo_banco"
          compacta
          filas={filasBancos}
          columnas={[
            { clave: "codigo_banco", titulo: "Cód.", tipo: "codigo" },
            { clave: "banco", titulo: "Banco", tipo: "texto", alinear: "izquierda" },
            { clave: "total_cartera_local_valida", titulo: "Total cartera local válida", tipo: "monto" },
            ...RANKINGS.map((r) => ({ clave: `pond_${r.clave}`, titulo: `% ${r.nombre}`, tipo: "porcentaje", decimales: 4 })),
          ]}
        />
        </div>
      </section>

      <section id="p5" className="mt-8 scroll-mt-24" aria-labelledby="h-p5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="h-p5" className="mb-0">5. Desglose por subactividad</h2>
          <BotonDescarga href="/api/exportar/subactividades" parametros={{ periodo: fecha }} texto="Desglose por banco" />
        </div>
        <p className="mb-3 text-sm">
          Crédito personal → Tarjeta: <strong>{formatearEntero(sb21.operaciones_movidas)}</strong> operaciones · <strong>{M(sb21.saldo_movido)}</strong>
        </p>
        <TablaOrdenable
          claveFila="clave"
          compacta
          filas={resumenSub}
          columnas={[
            { clave: "ranking", titulo: "Ranking", tipo: "ranking", alinear: "izquierda" },
            { clave: "subactividad", titulo: "Subactividad", tipo: "subactividad", alinear: "izquierda" },
            { clave: "saldo", titulo: "Saldo", tipo: "monto" },
            { clave: "operaciones", titulo: "Operaciones", tipo: "entero" },
          ]}
        />
      </section>

      <section id="p6" className="mt-8 scroll-mt-24" aria-labelledby="h-p6">
        <h2 id="h-p6">6. Períodos procesados y reconciliaciones</h2>
        <TablaOrdenable
          claveFila="fecha"
          filaResaltada={fecha}
          filas={filasPeriodos}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "filas_leidas", titulo: "Filas leídas", tipo: "entero" },
            { clave: "universo_local_valido", titulo: "Universo válido", tipo: "entero" },
            { clave: "rec1", titulo: "Subactividades = actividad", tipo: "texto", alinear: "centro" },
            { clave: "rec2", titulo: "Actividades = cartera", tipo: "texto", alinear: "centro" },
            { clave: "rec3", titulo: "Bancos = universo", tipo: "texto", alinear: "centro" },
          ]}
        />
        <details className="mt-4">
          <summary className="cursor-pointer font-medium">Comprobaciones de {formatearFecha(fecha)} ({detalleRec.length})</summary>
          <div className="mt-3">
            <TablaOrdenable
              claveFila="clave"
              compacta
              filas={detalleRec}
              columnas={[
                { clave: "comprobacion", titulo: "Comprobación", tipo: "texto", alinear: "izquierda" },
                { clave: "ranking", titulo: "Ranking", tipo: "ranking", alinear: "izquierda" },
                { clave: "codigo_banco", titulo: "Banco", tipo: "codigo" },
                { clave: "esperado", titulo: "Esperado", tipo: "monto" },
                { clave: "obtenido", titulo: "Obtenido", tipo: "monto" },
                { clave: "diferencia", titulo: "Diferencia", tipo: "monto_signo" },
                { clave: "cuadra", titulo: "¿Cuadra?", tipo: "texto", alinear: "centro" },
              ]}
            />
          </div>
        </details>
      </section>

    </>
  );
}
