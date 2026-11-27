// Panel principal (/) — Resumen de un corte (por defecto el más reciente).
//
// Versión fusionada: une el Panel original con componentes portados del frontend de Amet
// (carpeta app/_inicio/). Para el perfil Público abre con la portada de visitante
// (VisitorHome); para todos muestra el Dashboard de Amet (KPIs, tendencia, composición,
// saldo por banco, total descartado e insignia de reconciliaciones), el líder de cada ranking
// y los movimientos destacados. Cada dato completo vive en su vista dueña (Comparar, Calidad,
// Verificación, Rankings), a la que se enlaza.
// Filtro en la URL: ?periodo=AAAAMMDD. Todas las cifras vienen del motor SQL.
// Componente de servidor.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
import Link from "next/link";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import { alcanzaPerfil, exigirPerfil } from "@/lib/auth";
import { calidad, movimientos, rankings, reconciliaciones, resumenPanel } from "@/lib/consultas";
import {
  carteraPorBanco,
  composicionCartera,
  elegirPeriodo,
  fechasDisponibles,
  textoParametro,
} from "@/lib/consultas-rankings";
import { aNumeroParaGrafico, compararDecimales, formatearFecha, nombreRanking } from "@/lib/formato";
import Dashboard from "./_inicio/Dashboard";
import LideresRanking from "./_inicio/LideresRanking";
import StatusNotice from "./_inicio/StatusNotice";
import VisitorHome from "./_inicio/VisitorHome";
import { urlRankings } from "./rankings/urls";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes

/** Lee todo lo que el panel necesita para un período. */
async function cargarDatos(pedido) {
  const fechas = await fechasDisponibles();
  const periodo = elegirPeriodo(pedido, fechas);
  if (!periodo.fecha) return { fechas, periodo };
  // Cortes hasta el período elegido (para la tendencia y la historia de cada líder).
  const hasta = fechas.filter((f) => f <= periodo.fecha);
  const [resumen, composicion, bancos, movs, calidades, rec, rankingsPorCorte] = await Promise.all([
    resumenPanel(periodo.fecha),
    composicionCartera(periodo.fecha),
    carteraPorBanco(periodo.fecha),
    periodo.anterior ? movimientos({ anterior: periodo.anterior, actual: periodo.fecha }) : Promise.resolve([]),
    calidad(),
    reconciliaciones(periodo.fecha),
    Promise.all(hasta.map((f) => rankings({ fecha: f }))),
  ]);
  return { fechas, periodo, resumen, composicion, bancos, movs, calidades, rec, hasta, rankingsPorCorte };
}

/** Agrupa las filas de rankings() por código de ranking (conserva el orden por posición). */
function agruparPorRanking(filas) {
  const grupos = new Map();
  for (const f of filas) {
    if (!grupos.has(f.ranking)) grupos.set(f.ranking, []);
    grupos.get(f.ranking).push(f);
  }
  return grupos;
}

/**
 * Prepara los datos de LideresRanking: líder actual (de resumenPanel), desde qué corte lidera,
 * y enlace al ranking. Solo compara códigos y posiciones; los montos pasan como texto exacto.
 */
function prepararLideres(resumen, hasta, gruposPorCorte, fecha) {
  return resumen.rankings.map((r) => {
    const codigoLider = r.lider.codigo_banco;
    let desde = fecha;
    for (let i = hasta.length - 1; i >= 0; i--) {
      const lider = gruposPorCorte[i].get(r.ranking)?.find((x) => x.posicion === 1);
      if (lider?.codigo_banco === codigoLider) desde = hasta[i];
      else break;
    }
    return {
      ranking: r.ranking,
      nombre: r.nombre,
      tipo: r.tipo,
      lider: r.lider,
      saldo_total: r.saldo_total,
      lider_anterior: r.lider_anterior,
      cambio_de_lider: r.cambio_de_lider,
      desde,
      href: urlRankings({ periodo: fecha, ranking: r.ranking }),
    };
  });
}


/** Encabezado del resumen: h1 para Analista/Administrador; h2 en la portada pública (que ya tiene su h1). */
function Encabezado({ nivel, titulo, descripcion, children }) {
  if (nivel === 1) return <EncabezadoPagina titulo={titulo} descripcion={descripcion}>{children}</EncabezadoPagina>;
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-borde pb-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2>{titulo}</h2>
        {descripcion && <p className="mt-1 max-w-3xl text-texto-suave">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-start gap-2">{children}</div>}
    </div>
  );
}

export default async function PaginaPanel({ searchParams }) {
  const perfil = await exigirPerfil("publico");
  const pedido = textoParametro((await searchParams).periodo);

  const encabezadoBase = (
    <EncabezadoPagina
      titulo="Panel principal"
    />
  );

  let datos;
  try {
    datos = await cargarDatos(pedido);
  } catch (error) {
    return (
      <>
        {encabezadoBase}
        <MensajeError
          titulo="No se pudo leer el resumen"
          mensaje="La base de datos no respondió. Vuelva a intentarlo."
          detalle={error?.message}
          accion={{ href: "/", texto: "Reintentar" }}
        />
      </>
    );
  }

  const { periodo } = datos;
  if (!periodo.fecha || !datos.resumen) {
    return (
      <>
        {encabezadoBase}
        <EstadoVacio
          titulo="Aún no hay cortes cargados"
          accion={alcanzaPerfil(perfil, "administrador") ? { href: "/admin", texto: "Cargar un corte AT03" } : undefined}
        >
          Aquí verá el resumen del período cuando se cargue el primer corte.
        </EstadoVacio>
      </>
    );
  }

  const { resumen, composicion, bancos, movs, calidades, rec, hasta, rankingsPorCorte } = datos;
  const { fecha, anterior } = periodo;
  const textoAnterior = anterior ? formatearFecha(anterior) : null;
  const esPublico = !alcanzaPerfil(perfil, "analista");
  const esAnalista = !esPublico;
  const significativos = movs.filter((m) => m.significativo);
  const urlComparar = `/comparar?periodo=${fecha}&anterior=${anterior}`;

  // Composición por macroactividad, de mayor a menor saldo (orden exacto sobre texto decimal).
  const composicionOrdenada = [...composicion].sort((a, b) => compararDecimales(b.saldo, a.saldo));
  // Gráfico: cartera local válida de cada banco (ya viene ordenada por el motor).
  const opcionBancos = {
    grid: { left: 188, right: 24, top: 8, bottom: 24, containLabel: false },
    tooltip: { trigger: "axis", confine: true },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      inverse: true,
      data: bancos.map((b) => `${b.posicion}. ${b.banco}`),
      axisLabel: { align: "left", margin: 180, width: 172, overflow: "truncate" },
    },
    series: [{ type: "bar", name: "Cartera local válida", itemStyle: { color: "#106003" }, data: bancos.map((b) => aNumeroParaGrafico(b.total_cartera_local_valida)) }],
  };

  // Datos para los componentes portados de Amet (app/_inicio/).
  const gruposPorCorte = rankingsPorCorte.map(agruparPorRanking);
  const gruposActuales = gruposPorCorte.at(-1) ?? new Map();
  const actividades = resumen.rankings.map((r) => ({
    ranking: r.ranking,
    nombre: r.nombre,
    saldo_total: r.saldo_total,
    href: urlRankings({ periodo: fecha, ranking: r.ranking }),
    filas: (gruposActuales.get(r.ranking) ?? []).map((f) => ({
      posicion: f.posicion,
      codigo_banco: f.codigo_banco,
      banco: f.banco,
      saldo_actividad: f.saldo_actividad,
      ponderacion_pct: f.ponderacion_pct,
    })),
  }));
  const lideres = prepararLideres(resumen, hasta, gruposPorCorte, fecha);
  const calidadActual = calidades.find((c) => c.fecha === fecha) ?? null;
  const serie = calidades.filter((c) => c.fecha <= fecha).map((c) => ({ fecha: c.fecha, universo: c.universo_local_valido }));

  return (
    <>
      {esPublico && (
        <VisitorHome
          fecha={fecha}
          cortes={datos.fechas.length}
          actividades={actividades}
          urlRankings={urlRankings({ periodo: fecha })}
          urlsDescarga={{
            rankings: "/api/exportar/rankings",
            desglose: "/api/exportar/subactividades",
          }}
          lideres={<LideresRanking lideres={lideres} />}
        />
      )}

      <div id="resumen" className="resumen-compacto scroll-mt-24">
        <Encabezado
          nivel={esPublico ? 2 : 1}
          titulo={esPublico ? "Resumen del corte" : "Panel principal"}
          descripcion={anterior ? <small>frente a {textoAnterior}</small> : undefined}
        >
          {esAnalista && (
            <Link className="ghost" href={urlRankings({ periodo: fecha })}>
              Ver rankings →
            </Link>
          )}
          <Link className="ghost" href="/reportes">
            Exportar →
          </Link>
          <Filtros
            conLimpiar={false}
            campos={[
              {
                nombre: "periodo",
                etiqueta: "Período",
                predeterminado: fecha,
                opciones: [...datos.fechas].reverse().map((f) => ({ valor: f, texto: `${formatearFecha(f)} (${f})` })),
              },
            ]}
          />
        </Encabezado>
      </div>

      {/* Líder de cada ranking: para Analista/Administrador, primera sección tras el encabezado */}
      {esAnalista && <LideresRanking lideres={lideres} />}

      {periodo.invalido && (
        <StatusNotice type="warning">
          El período «{pedido}» no está cargado; se muestra el más reciente ({formatearFecha(fecha)}).
        </StatusNotice>
      )}
      {!resumen.reconciliaciones_cuadran && (
        <StatusNotice type="error" accion={{ href: "/verificacion", texto: "Ver reconciliaciones" }}>
          Atención: hay reconciliaciones que no cuadran en este corte.
        </StatusNotice>
      )}

      {/* Indicadores y tendencias (Dashboard de Amet) */}
      <Dashboard
        fecha={fecha}
        anterior={anterior}
        serie={serie}
        calidad={calidadActual}
        universo={resumen.universo}
        numBancos={bancos.length}
        movimientos={{ significativos: significativos.length, total: movs.length }}
        reconciliaciones={rec.resumen}
        composicion={composicionOrdenada}
        enlaces={{
          rankings: urlRankings({ periodo: fecha }),
          movimientos: esAnalista ? { href: urlComparar, texto: "Ver todos los movimientos" } : undefined,
        }}
      />

      {/* Composición (tabla) y cartera por banco (gráfico), lado a lado */}
      <section aria-labelledby="titulo-composicion" className="mb-10">
        <h2 id="titulo-composicion" className="mb-3">Composición de la cartera local válida</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3 overflow-x-auto [&_table]:w-full [&_table]:text-[13px] [&_td]:whitespace-nowrap [&_td]:px-2 [&_th]:whitespace-nowrap [&_th]:px-2">
            <TablaOrdenable
              columnas={[
                { clave: "Ranking", titulo: "Ranking", tipo: "ranking", enlace: urlRankings({ periodo: fecha }) + "&ranking={Ranking}" },
                { clave: "Saldo", titulo: "Saldo", tipo: "monto" },
                { clave: "Operaciones", titulo: "Operaciones", tipo: "entero" },
              ]}
              filas={composicionOrdenada.map((c) => ({ Ranking: c.ranking, Saldo: c.saldo, Operaciones: c.operaciones }))}
              claveFila="Ranking"
              compacta
            />
          </div>
          <div id="cartera-bancos" className="grafico-izquierda flex min-w-0 scroll-mt-24 flex-col gap-3">
            <Grafico
              titulo="Cartera local válida por banco"
              opcion={opcionBancos}
              altura={360}
              formatoValor="monto"
            />
          </div>
        </div>
      </section>


    </>
  );
}
