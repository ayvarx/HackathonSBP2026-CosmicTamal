// Panel principal (/) — Resumen de un corte (por defecto el más reciente).
//
// Versión fusionada: une el Panel original con componentes portados del frontend de Amet
// (carpeta app/_inicio/). Para el perfil Público abre con la portada de visitante
// (VisitorHome); para todos muestra el Dashboard de Amet (KPIs, tendencia, composición,
// saldo por banco, descartes y verificaciones), el líder de cada ranking (LideresRanking,
// visible para todos los perfiles), movimientos significativos, la cartera por banco y
// accesos a los módulos según el perfil.
// Filtro en la URL: ?periodo=AAAAMMDD. Todas las cifras vienen del motor SQL.
// Componente de servidor.
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import { alcanzaPerfil, exigirPerfil, NOMBRE_PERFIL, RUTAS_MENU } from "@/lib/auth";
import { calidad, movimientos, rankings, reconciliaciones, resumenPanel } from "@/lib/consultas";
import {
  carteraPorBanco,
  composicionCartera,
  elegirPeriodo,
  fechasDisponibles,
  textoParametro,
} from "@/lib/consultas-rankings";
import { aNumeroParaGrafico, compararDecimales, formatearEntero, formatearFecha, nombreBanco, nombreRanking } from "@/lib/formato";
import Dashboard from "./_inicio/Dashboard";
import LideresRanking from "./_inicio/LideresRanking";
import StatusNotice from "./_inicio/StatusNotice";
import VisitorHome from "./_inicio/VisitorHome";
import NotaFuente from "./rankings/NotaFuente";
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
 * su saldo/ponderación en cada corte y el top 3 de la actividad. Solo compara códigos y
 * posiciones; los montos pasan como texto exacto.
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
    const detalle = hasta.map((f, i) => {
      const x = gruposPorCorte[i].get(r.ranking)?.find((y) => y.codigo_banco === codigoLider);
      return { fecha: f, saldo: x?.saldo_actividad ?? null, ponderacion: x?.ponderacion_pct ?? null, operaciones: x?.operaciones_validas ?? null };
    });
    const filas = gruposPorCorte.at(-1)?.get(r.ranking) ?? [];
    return {
      ranking: r.ranking,
      nombre: r.nombre,
      tipo: r.tipo,
      lider: r.lider,
      saldo_total: r.saldo_total,
      lider_anterior: r.lider_anterior,
      cambio_de_lider: r.cambio_de_lider,
      desde,
      detalle,
      top3: filas.slice(0, 3).map((f) => ({ posicion: f.posicion, codigo_banco: f.codigo_banco, banco: f.banco, saldo_actividad: f.saldo_actividad })),
      href: urlRankings({ periodo: fecha, ranking: r.ranking }),
    };
  });
}

/**
 * Frases automáticas con lo más destacado del corte: cambios de líder, la mayor subida
 * y la mayor bajada. Solo compara posiciones (enteros), nunca montos.
 */
function destacados(resumen, movs, textoAnterior) {
  const frases = [];
  const cambios = resumen.rankings.filter((r) => r.cambio_de_lider);
  for (const r of cambios) {
    frases.push(`En ${r.nombre}, ${r.lider.banco} pasa a liderar el ranking (antes: ${r.lider_anterior.banco}).`);
  }
  if (!cambios.length && resumen.rankings.some((r) => r.lider_anterior)) {
    frases.push(`Los ${resumen.rankings.length} rankings mantienen a su líder respecto a ${textoAnterior}.`);
  }
  const subida = movs.reduce((mejor, m) => (m.cambio_posicion > (mejor?.cambio_posicion ?? 0) ? m : mejor), null);
  const bajada = movs.reduce((peor, m) => (m.cambio_posicion < (peor?.cambio_posicion ?? 0) ? m : peor), null);
  // Si varios bancos empatan en el mismo cambio, se dice cuántos más hay (para no exagerar al primero).
  const empatados = (m) => movs.filter((x) => x.cambio_posicion === m.cambio_posicion).length - 1;
  const conEmpates = (m) => (empatados(m) > 0 ? ` Otros ${empatados(m)} casos con el mismo cambio.` : "");
  if (subida) {
    frases.push(
      `Mayor subida: ${subida.banco} en ${nombreRanking(subida.ranking)}, del puesto ${subida.posicion_anterior} al ${subida.posicion_actual} (+${subida.cambio_posicion}).${conEmpates(subida)}`,
    );
  }
  if (bajada) {
    frases.push(
      `Mayor bajada: ${bajada.banco} en ${nombreRanking(bajada.ranking)}, del puesto ${bajada.posicion_anterior} al ${bajada.posicion_actual} (${bajada.cambio_posicion}).${conEmpates(bajada)}`,
    );
  }
  if (movs.length && !subida && !bajada) frases.push("Ningún banco cambió de posición en ningún ranking.");
  return frases;
}

export default async function PaginaPanel({ searchParams }) {
  const perfil = await exigirPerfil("publico");
  const pedido = textoParametro((await searchParams).periodo);

  const encabezadoBase = (
    <EncabezadoPagina
      titulo="Panel principal"
      descripcion="Resumen del corte: universo local válido, líderes de cada ranking y movimientos principales."
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
          mensaje="La base de datos no respondió. Verifique que esté configurada (npm run db:setup) y vuelva a intentarlo."
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
          La plataforma calcula los rankings a partir de los archivos AT03. Cuando un administrador cargue el primer
          corte, aquí verá el resumen del período.
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
  const frases = anterior ? destacados(resumen, movs, textoAnterior) : [];

  // Composición por macroactividad, de mayor a menor saldo (orden exacto sobre texto decimal).
  const composicionOrdenada = [...composicion].sort((a, b) => compararDecimales(b.saldo, a.saldo));
  // Gráfico: cartera local válida de cada banco (ya viene ordenada por el motor).
  const opcionBancos = {
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: bancos.map((b) => `${b.posicion}. ${b.banco}`) },
    series: [{ type: "bar", name: "Cartera local válida", data: bancos.map((b) => aNumeroParaGrafico(b.total_cartera_local_valida)) }],
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

  // Módulos: los que el perfil puede abrir y, aparte, los que requieren otro perfil.
  const modulos = RUTAS_MENU.filter((r) => r.ruta !== "/");

  return (
    <>
      {esPublico && (
        <VisitorHome
          fecha={fecha}
          cortes={datos.fechas.length}
          obligatorios={resumen.rankings.filter((r) => r.tipo === "obligatorio").length}
          actividades={actividades}
          urlRankings={urlRankings({ periodo: fecha })}
          urlsDescarga={{
            rankings: `/api/exportar/rankings?fecha=${fecha}`,
            desglose: `/api/exportar/subactividades?fecha=${fecha}`,
          }}
        />
      )}

      <div id="resumen" className="scroll-mt-24">
        <EncabezadoPagina
          titulo={esPublico ? "Resumen del corte" : "Panel principal"}
          descripcion={
            <>
              Resumen del corte de <strong>{formatearFecha(fecha)}</strong> (Fecha = {fecha})
              {anterior ? <> comparado con {textoAnterior}</> : <>; es el primer corte cargado, sin período anterior</>}.
            </>
          }
        />
      </div>

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
        rankings={actividades}
        enlaces={{
          rankings: urlRankings({ periodo: fecha }),
          exportar: "/reportes",
          movimientos: esAnalista
            ? { href: `/comparar?periodo=${fecha}&anterior=${anterior}`, texto: "Comparar períodos" }
            : { href: "#movimientos", texto: "Ver la lista" },
        }}
      />

      {/* Líder de cada ranking: visible para todos los perfiles (LideresRanking de Amet) */}
      <LideresRanking lideres={lideres} fecha={fecha} />

      {/* Visualizaciones con su tabla (la tabla tiene la cifra oficial y es la alternativa accesible) */}
      <section aria-labelledby="titulo-composicion" className="mb-10">
        <h2 id="titulo-composicion" className="mb-3">Composición de la cartera local válida</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-texto-suave">
              Cifras exactas de la dona «Saldo por macroactividad» del panel: suma del saldo de los 12 bancos en cada ranking.
            </p>
            <TablaOrdenable
              titulo="Saldo por macroactividad"
              columnas={[
                { clave: "Ranking", titulo: "Ranking", tipo: "ranking", enlace: urlRankings({ periodo: fecha }) + "&ranking={Ranking}" },
                { clave: "Saldo", titulo: "Saldo", tipo: "monto" },
                { clave: "Operaciones", titulo: "Operaciones", tipo: "entero" },
                { clave: "Participacion", titulo: "Participación", tipo: "porcentaje", decimales: 2, ayuda: "Saldo del ranking ÷ saldo del universo local válido × 100" },
              ]}
              filas={composicion.map((c) => ({ Ranking: c.ranking, Saldo: c.saldo, Operaciones: c.operaciones, Participacion: c.participacion_pct }))}
              claveFila="Ranking"
              filaTotal={{
                Ranking: "Total",
                Saldo: resumen.universo.saldo_universo_local_valido,
                Operaciones: resumen.universo.universo_local_valido,
              }}
              compacta
            />
          </div>
          <div id="cartera-bancos" className="flex scroll-mt-24 flex-col gap-3">
            <Grafico
              titulo={`Cartera local válida por banco · ${formatearFecha(fecha)}`}
              descripcion="Denominador de la ponderación: todo el universo local válido del banco."
              opcion={opcionBancos}
              altura={420}
              formatoValor="monto"
            />
            <TablaOrdenable
              titulo="Cartera local válida por banco"
              columnas={[
                { clave: "Posicion", titulo: "#", tipo: "entero", alinear: "centro" },
                { clave: "Banco", titulo: "Banco", enlace: urlRankings({ periodo: fecha }) + "&banco={Codigo_Banco}" },
                { clave: "Total", titulo: "Cartera local válida", tipo: "monto" },
                { clave: "Operaciones", titulo: "Operaciones", tipo: "entero" },
                { clave: "Participacion", titulo: "Participación", tipo: "porcentaje", decimales: 2, ayuda: "Cartera del banco ÷ cartera de los 12 bancos × 100" },
              ]}
              filas={bancos.map((b) => ({
                Posicion: b.posicion,
                Codigo_Banco: b.codigo_banco,
                // Espacios irrompibles: el nombre del banco no se parte en dos líneas.
                Banco: nombreBanco(b.codigo_banco, b.banco).replace(/ /g, " "),
                Total: b.total_cartera_local_valida,
                Operaciones: b.operaciones,
                Participacion: b.participacion_pct,
              }))}
              claveFila="Codigo_Banco"
              ordenInicial={{ clave: "Posicion", direccion: "asc" }}
              compacta
            />
          </div>
        </div>
      </section>

      {/* Movimientos significativos frente al corte anterior */}
      <section id="movimientos" aria-labelledby="titulo-movimientos" className="mb-10 scroll-mt-24">
        <h2 id="titulo-movimientos" className="mb-1">Movimientos significativos</h2>
        {!anterior ? (
          <EstadoVacio titulo="Sin período anterior">
            {formatearFecha(fecha)} es el primer corte cargado. Al cargar el siguiente, aquí se señalarán los cambios de
            posición automáticamente.
          </EstadoVacio>
        ) : (
          <>
            <p className="mb-3 max-w-3xl text-sm text-texto-suave">
              {formatearFecha(fecha)} frente a {textoAnterior}. Un movimiento es significativo según la regla configurable
              que define el Administrador (cambio de posición mínimo, cambio de líder o variación de saldo mínima).
            </p>
            {frases.length > 0 && (
              <ul className="tarjeta mb-4 list-disc space-y-1 pl-8 text-sm" aria-label="Lo más destacado">
                {frases.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            <TablaOrdenable
              titulo={`${formatearEntero(significativos.length)} movimientos significativos · ${textoAnterior} → ${formatearFecha(fecha)}`}
              columnas={[
                { clave: "Ranking", titulo: "Ranking", tipo: "ranking" },
                { clave: "Banco", titulo: "Banco", enlace: urlRankings({ periodo: fecha }) + "&ranking={Ranking}&banco={Codigo_Banco}" },
                { clave: "Posicion_Anterior", titulo: "Posición anterior", tipo: "entero", alinear: "centro" },
                { clave: "Posicion_Actual", titulo: "Posición actual", tipo: "entero", alinear: "centro" },
                { clave: "Cambio_Posicion", titulo: "Movimiento", tipo: "movimiento" },
                { clave: "Var_Saldo", titulo: "Var. saldo", tipo: "monto_signo" },
                { clave: "Var_Saldo_Pct", titulo: "Var. saldo %", tipo: "porcentaje", decimales: 4 },
                { clave: "Motivo", titulo: "Por qué es significativo", ordenable: false },
              ]}
              filas={significativos.map((m) => ({
                Clave: `${m.ranking}-${m.codigo_banco}`,
                Ranking: m.ranking,
                Codigo_Banco: m.codigo_banco,
                Banco: m.banco,
                Posicion_Anterior: m.posicion_anterior,
                Posicion_Actual: m.posicion_actual,
                Cambio_Posicion: m.cambio_posicion,
                Var_Saldo: m.var_saldo,
                Var_Saldo_Pct: m.var_saldo_pct,
                Motivo: m.motivo,
              }))}
              claveFila="Clave"
              mensajeVacio="Ningún movimiento cumple la regla de significancia vigente."
              altoMaximo="28rem"
              compacta
            />
          </>
        )}
      </section>

      {/* Accesos a los módulos según el perfil */}
      <section aria-labelledby="titulo-modulos" className="mb-6">
        <h2 id="titulo-modulos" className="mb-3">Módulos</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modulos.map((m) => {
            const permitido = alcanzaPerfil(perfil, m.minimo);
            return (
              <li key={m.ruta} className={`tarjeta flex flex-col gap-1 ${permitido ? "" : "border-dashed"}`}>
                {permitido ? (
                  <Link href={m.ruta} className="font-semibold">
                    {m.etiqueta}
                  </Link>
                ) : (
                  <span className="font-semibold text-texto-suave">{m.etiqueta}</span>
                )}
                <span className="text-sm text-texto-suave">{m.descripcion}</span>
                {!permitido && (
                  <span className="mt-auto pt-1 text-xs text-texto-tenue">
                    Requiere el perfil {NOMBRE_PERFIL[m.minimo]}.{" "}
                    <Link href={`/perfil?volver=${encodeURIComponent(m.ruta)}`}>Cambiar de perfil</Link>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <NotaFuente fecha={fecha} anterior={anterior} />
    </>
  );
}
