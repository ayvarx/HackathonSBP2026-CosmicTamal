// Panel principal (/) — Resumen de un corte (por defecto el más reciente).
//
// Versión fusionada: une el Panel original con componentes portados del frontend de Amet
// (carpeta app/_inicio/). Para el perfil Público abre con la portada de visitante
// (VisitorHome); para todos muestra el Dashboard de Amet (KPIs, tendencia, composición,
// saldo por banco, descartes y verificaciones), el líder de cada ranking (LideresRanking,
// visible para todos los perfiles), movimientos significativos y la cartera por banco,
// sin la lista de módulos (ya está en la navegación).
// Filtro en la URL: ?periodo=AAAAMMDD. Todas las cifras vienen del motor SQL.
// Componente de servidor.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
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
import { aNumeroParaGrafico, compararDecimales, formatearEntero, formatearFecha, nombreRanking } from "@/lib/formato";
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
 * Lo más destacado del corte en tarjetas: nuevo líder, mayor subida y mayor bajada.
 * Solo compara posiciones (enteros), nunca montos.
 */
function destacados(resumen, movs) {
  const tarjetas = [];
  const cambio = resumen.rankings.find((r) => r.cambio_de_lider);
  if (cambio) {
    tarjetas.push({
      tipo: "lider",
      titulo: "Nuevo líder",
      icono: "★",
      banco: cambio.lider.banco,
      ranking: cambio.nombre,
      cifra: "Puesto 1",
      frase: `Antes: ${cambio.lider_anterior.banco}`,
    });
  }
  const subida = movs.reduce((mejor, m) => (m.cambio_posicion > (mejor?.cambio_posicion ?? 0) ? m : mejor), null);
  const bajada = movs.reduce((peor, m) => (m.cambio_posicion < (peor?.cambio_posicion ?? 0) ? m : peor), null);
  const empatados = (m) => movs.filter((x) => x.cambio_posicion === m.cambio_posicion).length - 1;
  const conEmpates = (m) => (empatados(m) > 0 ? `+${empatados(m)} casos iguales` : "Caso único");
  if (subida) {
    tarjetas.push({
      tipo: "subida",
      titulo: "Mayor aumento",
      icono: "▲",
      banco: subida.banco,
      ranking: nombreRanking(subida.ranking),
      cifra: `${subida.posicion_anterior} → ${subida.posicion_actual} (+${subida.cambio_posicion})`,
      frase: conEmpates(subida),
    });
  }
  if (bajada) {
    tarjetas.push({
      tipo: "bajada",
      titulo: "Mayor bajada",
      icono: "▼",
      banco: bajada.banco,
      ranking: nombreRanking(bajada.ranking),
      cifra: `${bajada.posicion_anterior} → ${bajada.posicion_actual} (${bajada.cambio_posicion})`,
      frase: conEmpates(bajada),
    });
  }
  return tarjetas;
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
          Cuando se cargue el primer corte, aquí verá el resumen del período.
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
  const tarjetasDestacadas = anterior ? destacados(resumen, movs) : [];

  // Composición por macroactividad, de mayor a menor saldo (orden exacto sobre texto decimal).
  const composicionOrdenada = [...composicion].sort((a, b) => compararDecimales(b.saldo, a.saldo));
  // Gráfico: cartera local válida de cada banco (ya viene ordenada por el motor).
  const opcionBancos = {
    grid: { left: 158, right: 24, top: 8, bottom: 24, containLabel: false },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      inverse: true,
      data: bancos.map((b) => `${b.posicion}. ${b.banco}`),
      axisLabel: { align: "left", margin: 150, width: 140, overflow: "truncate" },
    },
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
            rankings: "/api/exportar/rankings",
            desglose: "/api/exportar/subactividades",
          }}
          lideres={<LideresRanking lideres={lideres} fecha={fecha} />}
        />
      )}

      <div id="resumen" className="resumen-compacto scroll-mt-24">
        <EncabezadoPagina
          titulo={esPublico ? "Resumen del corte" : "Panel principal"}
          descripcion={anterior ? <small>frente a {textoAnterior}</small> : undefined}
        >
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
        </EncabezadoPagina>
      </div>

      {/* Líder de cada ranking: para Analista/Administrador, primera sección tras el encabezado */}
      {esAnalista && <LideresRanking lideres={lideres} fecha={fecha} />}

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

      {/* Visualizaciones con su tabla (la tabla tiene la cifra oficial y es la alternativa accesible) */}
      <section aria-labelledby="titulo-composicion" className="mb-10">
        <h2 id="titulo-composicion" className="mb-3">Composición de la cartera local válida</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
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
          <div id="cartera-bancos" className="grafico-izquierda flex scroll-mt-24 flex-col gap-3 lg:col-span-2">
            <Grafico
              titulo={`Cartera local válida por banco · ${formatearFecha(fecha)}`}
              descripcion="Denominador de la ponderación: todo el universo local válido del banco."
              opcion={opcionBancos}
              altura={420}
              formatoValor="monto"
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
            {tarjetasDestacadas.length > 0 ? (
              <ul className="destacados" aria-label="Lo más destacado">
                {tarjetasDestacadas.map((t) => (
                  <li key={t.tipo} className={`destacado destacado--${t.tipo}`}>
                    <span className="destacado-tipo">
                      <span aria-hidden="true">{t.icono}</span> {t.titulo}
                    </span>
                    <strong className="destacado-banco">{t.banco}</strong>
                    <span className="destacado-ranking">{t.ranking}</span>
                    <span className="destacado-cifra cifra">{t.cifra}</span>
                    <small>{t.frase}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-texto-suave">Sin cambios de posición frente a {textoAnterior}.</p>
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

      <p className="mt-10 border-t border-borde pt-4 text-xs font-semibold text-texto-tenue">Datos ficticios.</p>
    </>
  );
}
