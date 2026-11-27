// Panel principal (/) — Resumen de un corte (por defecto el más reciente).
//
// Muestra: universo local válido y su saldo, número de bancos, líder de cada uno de los
// 6 rankings, movimientos significativos frente al corte anterior, la composición de la
// cartera y la cartera de cada banco, y accesos a los módulos según el perfil.
// Filtro en la URL: ?periodo=AAAAMMDD. Todas las cifras vienen del motor SQL.
// Componente de servidor.
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import { alcanzaPerfil, exigirPerfil, NOMBRE_PERFIL, RUTAS_MENU } from "@/lib/auth";
import { movimientos, resumenPanel } from "@/lib/consultas";
import {
  carteraPorBanco,
  composicionCartera,
  elegirPeriodo,
  fechasDisponibles,
  textoParametro,
} from "@/lib/consultas-rankings";
import {
  aNumeroParaGrafico,
  compararDecimales,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearMontoCompacto,
  formatearPorcentaje,
  nombreBanco,
  nombreRanking,
} from "@/lib/formato";
import NotaFuente from "./rankings/NotaFuente";
import { urlRankings } from "./rankings/urls";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes

const TIPO_RANKING = { obligatorio: "Obligatorio", recomendado: "Recomendado", bonus: "Bonus" };

/** Lee todo lo que el panel necesita para un período. */
async function cargarDatos(pedido) {
  const fechas = await fechasDisponibles();
  const periodo = elegirPeriodo(pedido, fechas);
  if (!periodo.fecha) return { fechas, periodo };
  const [resumen, composicion, bancos, movs] = await Promise.all([
    resumenPanel(periodo.fecha),
    composicionCartera(periodo.fecha),
    carteraPorBanco(periodo.fecha),
    periodo.anterior ? movimientos({ anterior: periodo.anterior, actual: periodo.fecha }) : Promise.resolve([]),
  ]);
  return { fechas, periodo, resumen, composicion, bancos, movs };
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

  const { resumen, composicion, bancos, movs } = datos;
  const { fecha, anterior } = periodo;
  const textoAnterior = anterior ? formatearFecha(anterior) : null;
  const esAnalista = alcanzaPerfil(perfil, "analista");
  const significativos = movs.filter((m) => m.significativo);
  const frases = anterior ? destacados(resumen, movs, textoAnterior) : [];

  // Gráfico 1: composición de la cartera por macroactividad (orden de mayor a menor saldo).
  // Orden exacto por saldo (texto decimal), sin pasar por punto flotante.
  const composicionOrdenada = [...composicion].sort((a, b) => compararDecimales(b.saldo, a.saldo));
  const opcionComposicion = {
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: composicionOrdenada.map((c) => nombreRanking(c.ranking)) },
    series: [{ type: "bar", name: "Saldo", data: composicionOrdenada.map((c) => aNumeroParaGrafico(c.saldo)) }],
  };
  // Gráfico 2: cartera local válida de cada banco (ya viene ordenada por el motor).
  const opcionBancos = {
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: bancos.map((b) => `${b.posicion}. ${b.banco}`) },
    series: [{ type: "bar", name: "Cartera local válida", data: bancos.map((b) => aNumeroParaGrafico(b.total_cartera_local_valida)) }],
  };

  // Módulos: los que el perfil puede abrir y, aparte, los que requieren otro perfil.
  const modulos = RUTAS_MENU.filter((r) => r.ruta !== "/");

  return (
    <>
      <EncabezadoPagina
        titulo="Panel principal"
        descripcion={
          <>
            Resumen del corte de <strong>{formatearFecha(fecha)}</strong> (Fecha = {fecha})
            {anterior ? <> comparado con {textoAnterior}</> : <>; es el primer corte cargado, sin período anterior</>}.
          </>
        }
      >
        <Link href={urlRankings({ periodo: fecha })} className="boton">
          Ver rankings
        </Link>
      </EncabezadoPagina>

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
        <div className="mb-6">
          <MensajeError
            titulo="Período no disponible"
            mensaje={`El período «${pedido}» no está cargado; se muestra el más reciente (${formatearFecha(fecha)}).`}
          />
        </div>
      )}

      {/* Indicadores principales */}
      <section aria-label="Indicadores del período" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaIndicador
          titulo="Universo local válido"
          valor={formatearEntero(resumen.universo.universo_local_valido)}
          unidad="préstamos"
          detalle={`De ${formatearEntero(resumen.universo.filas_leidas)} filas leídas; ${formatearEntero(resumen.universo.excluidas)} excluidas por los filtros E1–E4.`}
          enlace={{ href: "/calidad", texto: "Ver reporte de calidad" }}
        />
        <TarjetaIndicador
          titulo="Saldo del universo local válido"
          valor={formatearMontoCompacto(resumen.universo.saldo_universo_local_valido)}
          detalle={
            <>
              Exacto: <span className="cifra">{formatearMonto(resumen.universo.saldo_universo_local_valido)}</span>.{" "}
              {resumen.reconciliaciones_cuadran
                ? "Las reconciliaciones 1, 2 y 3 cuadran al centavo."
                : "Atención: hay reconciliaciones que no cuadran."}
            </>
          }
          enlace={{ href: "/verificacion", texto: "Ver reconciliaciones" }}
        />
        <TarjetaIndicador
          titulo="Bancos"
          valor={formatearEntero(bancos.length)}
          unidad="bancos ficticios"
          detalle="Todos aparecen en los 6 rankings; un banco sin cartera en una actividad figura con saldo 0.00."
          enlace={{ href: "#cartera-bancos", texto: "Ver cartera por banco" }}
        />
        <TarjetaIndicador
          titulo="Movimientos significativos"
          valor={anterior ? formatearEntero(significativos.length) : "—"}
          unidad={anterior ? `de ${formatearEntero(movs.length)} posiciones` : undefined}
          detalle={
            anterior
              ? `Frente a ${textoAnterior}, según la regla configurable vigente.`
              : "Es el primer corte cargado: no hay período anterior para comparar."
          }
          enlace={
            anterior
              ? esAnalista
                ? { href: `/comparar?periodo=${fecha}&anterior=${anterior}`, texto: "Comparar períodos" }
                : { href: "#movimientos", texto: "Ver la lista" }
              : undefined
          }
        />
      </section>

      {/* Líder de cada ranking */}
      <section aria-labelledby="titulo-lideres" className="mb-10">
        <h2 id="titulo-lideres" className="mb-3">Líder de cada ranking</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumen.rankings.map((r) => (
            <li key={r.ranking} className="tarjeta flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h3>{r.nombre}</h3>
                <span className="etiqueta">{TIPO_RANKING[r.tipo]}</span>
              </div>
              <p className="text-lg font-semibold">{nombreBanco(r.lider.codigo_banco, r.lider.banco)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                <dt className="text-texto-suave">Saldo</dt>
                <dd className="cifra text-right">{formatearMonto(r.lider.saldo_actividad)}</dd>
                <dt className="text-texto-suave">Ponderación</dt>
                <dd className="cifra text-right">{formatearPorcentaje(r.lider.ponderacion_pct)}</dd>
                <dt className="text-texto-suave">Total del ranking</dt>
                <dd className="cifra text-right">{formatearMontoCompacto(r.saldo_total)}</dd>
              </dl>
              <p className="text-sm">
                {!r.lider_anterior ? (
                  <span className="text-texto-tenue">Sin período anterior</span>
                ) : r.cambio_de_lider ? (
                  <span className="movimiento movimiento-sube">
                    <span aria-hidden="true">▲</span> Nuevo líder (antes: {r.lider_anterior.banco})
                  </span>
                ) : (
                  <span className="movimiento movimiento-igual">
                    <span aria-hidden="true">=</span> Mantiene el liderazgo desde {textoAnterior}
                  </span>
                )}
              </p>
              <p className="mt-auto pt-1 text-sm">
                <Link href={urlRankings({ periodo: fecha, ranking: r.ranking })}>Ver ranking completo</Link>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Visualizaciones con su tabla (la tabla tiene la cifra oficial y es la alternativa accesible) */}
      <section aria-labelledby="titulo-composicion" className="mb-10">
        <h2 id="titulo-composicion" className="mb-3">Composición de la cartera local válida</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Grafico
              titulo={`Saldo por macroactividad · ${formatearFecha(fecha)}`}
              descripcion="Suma del saldo de los 12 bancos en cada ranking."
              opcion={opcionComposicion}
              altura={300}
              formatoValor="monto"
            />
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
