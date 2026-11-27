// Comparar (/comparar) — movimientos de posición entre dos períodos y comparación de bancos.
// Solo perfil Analista o superior (entregable 8: "compara entidades y períodos").
//
// Qué muestra (sección 8 de las indicaciones):
//   1. Resumen del par de períodos en los 6 rankings y la regla de movimiento significativo vigente.
//   2. Para el ranking elegido: explicación automática (plantillas fijas), tabla de movimientos
//      y gráfico de posiciones por mes (una línea por banco, eje invertido).
//   3. Cascada de la variación de saldo del movimiento elegido (nuevos, salidos, amortización).
//   4. De 2 a 4 bancos lado a lado en los 6 rankings.
//
// Todas las cifras vienen de lib/consultas.js (motor SQL). Aquí solo se filtran, ordenan y
// formatean para mostrar. Los filtros viven en la URL (?anterior=&periodo=&ranking=&banco=&bancos=).
import { redirect } from "next/navigation";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
import IndicadorMovimiento from "@/components/IndicadorMovimiento";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import { exigirPerfil } from "@/lib/auth";
import {
  descomposicion,
  FUENTE,
  movimientos,
  parametros,
  periodos,
  RANKINGS,
  rankings,
} from "@/lib/consultas";
import { compararDecimales, formatearFecha, formatearMonto, nombreRanking } from "@/lib/formato";
import {
  descomposicionCuadra,
  explicarMovimiento,
  introduccionRanking,
  ordinal,
  principalesMovimientos,
  quitarSigno,
  unirLista,
} from "./explicacion";
import { opcionCascada, opcionPosiciones } from "./graficos";
import ReglaAplicada from "./ReglaAplicada";
import SeccionEntidades, { MAX_BANCOS, MIN_BANCOS } from "./SeccionEntidades";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Comparar" };

const ORDEN_RANKINGS = RANKINGS.map((r) => r.clave);
const ENCABEZADO = {
  titulo: "Comparar períodos y bancos",
  descripcion:
    "Cambios de posición y variación de saldo entre dos cortes.",
};

// --------------------------------------------------------------------------------------
// Lectura de la URL
// --------------------------------------------------------------------------------------

/** searchParams puede traer un texto o una lista (?a=1&a=2); para filtros simples se usa el primero. */
function primero(valor) {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

/**
 * Bancos a comparar. Acepta ?bancos=101,105 (enlaces) y ?bancos=101&bancos=105 (casillas del formulario).
 * Devuelve null si la URL no trae el parámetro (se usará la selección inicial).
 */
function leerBancos(valor, codigosValidos) {
  if (valor === undefined) return null;
  const lista = (Array.isArray(valor) ? valor : [valor]).flatMap((v) => String(v).split(",")).map((v) => v.trim());
  return [...new Set(lista)].filter((codigo) => codigosValidos.includes(codigo));
}

/** Por defecto se comparan los dos cortes más recientes; si solo viene uno, se completa el otro. */
function completarPeriodos(fechas, pedidoAnterior, pedidoActual) {
  let actual = fechas.includes(pedidoActual) ? pedidoActual : fechas.at(-1);
  let anterior = fechas.includes(pedidoAnterior) ? pedidoAnterior : fechas.filter((f) => f < actual).at(-1);
  if (!anterior) {
    actual = fechas.at(-1);
    anterior = fechas.at(-2);
  }
  return { anterior, actual };
}

// --------------------------------------------------------------------------------------
// Página
// --------------------------------------------------------------------------------------

export default async function PaginaComparar({ searchParams }) {
  // Comparar entidades y períodos es una opción del perfil Analista (entregable 8).
  const perfil = await exigirPerfil("analista");
  const sp = await searchParams;

  let listaPeriodos;
  try {
    listaPeriodos = await periodos();
  } catch (error) {
    return <ErrorDatos detalle={error?.message} />;
  }

  if (listaPeriodos.length < 2) {
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <EstadoVacio
          titulo={listaPeriodos.length === 0 ? "Aún no hay cortes cargados" : "Se necesitan al menos dos cortes para comparar"}
          accion={perfil === "administrador" ? { href: "/admin", texto: "Ir a Administración para cargar un corte" } : undefined}
        >
          {listaPeriodos.length === 0
            ? "Cuando el Administrador cargue al menos dos cortes AT03, aquí se compararán sus rankings."
            : `Solo está cargado ${formatearFecha(listaPeriodos[0].fecha)}. Cuando el Administrador cargue otro corte, la comparación se calcula sola.`}
        </EstadoVacio>
      </>
    );
  }

  const fechas = listaPeriodos.map((p) => p.fecha);
  const pedidoAnterior = primero(sp.anterior);
  const pedidoActual = primero(sp.periodo);

  // Si la URL no trae ambos períodos, se completan y se redirige: así la URL se puede
  // compartir y la franja superior muestra "anterior → actual".
  if (!pedidoAnterior || !pedidoActual) {
    const { anterior, actual } = completarPeriodos(fechas, pedidoAnterior, pedidoActual);
    const consulta = new URLSearchParams();
    for (const [clave, valor] of Object.entries(sp)) for (const v of [].concat(valor)) consulta.append(clave, v);
    consulta.set("anterior", anterior);
    consulta.set("periodo", actual);
    redirect(`/comparar?${consulta.toString()}`);
  }

  const anterior = pedidoAnterior;
  const actual = pedidoActual;
  const ranking = ORDEN_RANKINGS.includes(primero(sp.ranking)) ? primero(sp.ranking) : ORDEN_RANKINGS[0];

  const camposFiltro = [
    {
      nombre: "anterior",
      etiqueta: "Período anterior",
      opciones: fechas.slice(0, -1).map((f) => ({ valor: f, texto: formatearFecha(f) })),
    },
    {
      nombre: "periodo",
      etiqueta: "Período actual",
      opciones: fechas.slice(1).map((f) => ({ valor: f, texto: formatearFecha(f) })),
    },
    {
      nombre: "ranking",
      etiqueta: "Ranking",
      predeterminado: ranking,
      opciones: ORDEN_RANKINGS.map((r) => ({ valor: r, texto: nombreRanking(r) })),
    },
  ];

  // El período anterior debe existir y ser previo al actual (Cambio_Posicion = anterior − actual).
  const errorPeriodos = !fechas.includes(anterior) || !fechas.includes(actual)
    ? "Uno de los períodos de la dirección no está cargado."
    : anterior >= actual
      ? `El período anterior (${formatearFecha(anterior)}) debe ser previo al período actual (${formatearFecha(actual)}).`
      : null;
  if (errorPeriodos) {
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <Filtros campos={camposFiltro} />
        <MensajeError
          titulo="No se puede comparar esa combinación de períodos"
          mensaje={`${errorPeriodos} Elija otro par en los filtros. Períodos cargados: ${unirLista(fechas.map((f) => formatearFecha(f)))}.`}
          accion={{ href: "/comparar", texto: "Comparar los dos cortes más recientes" }}
        />
      </>
    );
  }

  // ------------------------------------------------------------------------------------
  // Datos (todas las cifras salen del motor SQL)
  // ------------------------------------------------------------------------------------
  let datos;
  try {
    const [params, movs, desc, rankingsActual, ...posicionesPorFecha] = await Promise.all([
      parametros(),
      movimientos({ anterior, actual }),
      descomposicion({ anterior, actual, ranking }),
      rankings({ fecha: actual }),
      ...fechas.map((fecha) => rankings({ fecha, ranking })),
    ]);
    datos = { params, movs, desc, rankingsActual, posiciones: posicionesPorFecha.flat() };
  } catch (error) {
    return <ErrorDatos detalle={error?.message} />;
  }
  const { params, movs, desc, rankingsActual, posiciones } = datos;

  if (movs.length === 0) {
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <Filtros campos={camposFiltro} />
        <EstadoVacio titulo="No hay movimientos para ese par de períodos">
          No hay movimientos entre {formatearFecha(anterior)} y {formatearFecha(actual)}. Pruebe con otro par
          de períodos.
        </EstadoVacio>
      </>
    );
  }

  // Bancos del período actual (12 en cada ranking, aunque tengan saldo 0.00).
  const todosBancos = [...new Map(rankingsActual.map((r) => [r.codigo_banco, { codigo: r.codigo_banco, nombre: r.banco }])).values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const codigos = todosBancos.map((b) => b.codigo);
  const bancoPedido = codigos.includes(primero(sp.banco)) ? primero(sp.banco) : "";

  camposFiltro.push({
    nombre: "banco",
    etiqueta: "Movimiento a explicar",
    textoTodos: "El principal (automático)",
    opciones: todosBancos.map((b) => ({ valor: b.codigo, texto: `${b.codigo} · ${b.nombre}` })),
  });

  // --- Ranking elegido -----------------------------------------------------------------
  const movsRanking = movs.filter((m) => m.ranking === ranking);
  const descPorBanco = new Map(desc.map((d) => [d.codigo_banco, d]));
  const principales = principalesMovimientos(movsRanking);
  const explicaciones = principales.map((m) => ({ m, ...explicarMovimiento(m, descPorBanco.get(m.codigo_banco), movsRanking) }));
  const seleccionado =
    movsRanking.find((m) => m.codigo_banco === bancoPedido) ??
    principales[0] ??
    [...movsRanking].sort((a, b) => compararDecimales(quitarSigno(b.var_saldo), quitarSigno(a.var_saldo)))[0];
  const descSeleccionado = seleccionado ? descPorBanco.get(seleccionado.codigo_banco) : undefined;

  // --- Bancos a comparar lado a lado ---------------------------------------------------
  const bancosUrl = leerBancos(sp.bancos, codigos);
  let bancosElegidos = bancosUrl;
  let avisoBancos = null;
  if (bancosElegidos === null) {
    bancosElegidos = [...movsRanking].sort((a, b) => a.posicion_actual - b.posicion_actual).slice(0, 3).map((m) => m.codigo_banco);
    avisoBancos = `Selección inicial: los 3 primeros de ${nombreRanking(ranking)}. Marque otros bancos y pulse "Comparar bancos".`;
  } else if (bancosElegidos.length > MAX_BANCOS) {
    avisoBancos = `Eligió ${bancosElegidos.length} bancos; se muestran solo los primeros ${MAX_BANCOS}.`;
    bancosElegidos = bancosElegidos.slice(0, MAX_BANCOS);
  } else if (bancosElegidos.length < MIN_BANCOS) {
    avisoBancos = `Elija al menos ${MIN_BANCOS} bancos para compararlos lado a lado.`;
  }

  // Enlaces que eligen un movimiento para la cascada (conservan la selección explícita de bancos).
  const sufijoBancos = bancosUrl ? `&bancos=${bancosElegidos.join(",")}` : "";
  const enlaceMovimiento = (rankingPlantilla) =>
    `/comparar?anterior=${anterior}&periodo=${actual}&ranking=${rankingPlantilla}&banco={codigo_banco}${sufijoBancos}#cascada`;

  // --- Resumen de los 6 rankings -------------------------------------------------------
  const significativos = movs.filter((m) => m.significativo);
  const rankingsConCambioLider = ORDEN_RANKINGS.filter((r) => movs.some((m) => m.ranking === r && m.cambio_de_lider === "SI"));
  const cambiosPosicion = movs.filter((m) => m.cambio_posicion !== 0).length;
  const consecutivos = movs[0]?.consecutivos;

  const filasSignificativas = significativos.map((m) => ({
    ...m,
    clave: `${m.ranking}-${m.codigo_banco}`,
    banco_texto: `${m.banco} (${m.codigo_banco})`,
  }));

  const filasRanking = movsRanking.map((m) => ({
    ...m,
    banco_texto: `${m.banco} (${m.codigo_banco})`,
    lider: m.cambio_de_lider === "SI" ? "Sí" : "No",
    es_significativo: m.significativo ? "Sí" : "No",
  }));

  // Datos del gráfico de posiciones también en tabla (alternativa accesible y cifras exactas).
  const filasPosiciones = todosBancos.map((b) => {
    const fila = { codigo_banco: b.codigo, banco_texto: `${b.nombre} (${b.codigo})` };
    for (const p of posiciones.filter((x) => x.codigo_banco === b.codigo)) fila[`p_${p.fecha}`] = p.posicion;
    return fila;
  });

  const textoPar = `${formatearFecha(anterior)} → ${formatearFecha(actual)}`;

  return (
    <>
      <EncabezadoPagina {...ENCABEZADO}>
        <BotonDescarga
          href="/api/exportar/movimientos"
          parametros={{ anterior, actual }}
          texto="Descargar reporte de movimientos"
          variante="primario"
          descripcion="Los 6 rankings del par de períodos elegido."
        />
      </EncabezadoPagina>

      <Filtros campos={camposFiltro} />

      <p className="mb-2 text-sm text-texto-suave">
        Comparando <strong className="text-texto">{textoPar}</strong>{" "}
        ({consecutivos ? "períodos consecutivos" : "períodos no consecutivos: se compara el primero con el último"}).
      </p>
      <nav aria-label="Secciones de la comparación" className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href="#resumen">Resumen</a>
        <a href="#ranking">Ranking {nombreRanking(ranking)}</a>
        <a href="#cascada">Cascada del movimiento</a>
        <a href="#entidades">Bancos lado a lado</a>
      </nav>

      {/* 1. Resumen de los 6 rankings ------------------------------------------------ */}
      <section id="resumen" aria-labelledby="titulo-resumen" className="mb-10 scroll-mt-24">
        <h2 id="titulo-resumen" className="mb-3">
          Resumen de los 6 rankings
        </h2>
        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <ReglaAplicada parametros={params} esAdministrador={perfil === "administrador"} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TarjetaIndicador
              titulo="Movimientos significativos"
              valor={String(significativos.length)}
              unidad={`de ${movs.length}`}
              detalle="Banco × ranking que cumplen la regla vigente."
            />
            <TarjetaIndicador
              titulo="Cambios de líder"
              valor={String(rankingsConCambioLider.length)}
              unidad={rankingsConCambioLider.length === 1 ? "ranking" : "rankings"}
              detalle={
                rankingsConCambioLider.length
                  ? `En ${unirLista(rankingsConCambioLider.map(nombreRanking))}.`
                  : "El líder se mantiene en los 6 rankings."
              }
            />
            <TarjetaIndicador
              titulo="Cambios de posición"
              valor={String(cambiosPosicion)}
              unidad={`de ${movs.length}`}
              detalle="Banco × ranking que suben o bajan al menos un puesto."
            />
          </div>
        </div>

        <div className="mt-4">
          <TablaOrdenable
            titulo={`Movimientos significativos · ${textoPar}. Haga clic en un banco para ver su explicación y su cascada.`}
            columnas={[
              { clave: "ranking", titulo: "Ranking", tipo: "ranking" },
              { clave: "banco_texto", titulo: "Banco", enlace: enlaceMovimiento("{ranking}") },
              { clave: "posicion_anterior", titulo: "Posición anterior", tipo: "entero" },
              { clave: "posicion_actual", titulo: "Posición actual", tipo: "entero" },
              { clave: "cambio_posicion", titulo: "Cambio", tipo: "movimiento", ayuda: "Cambio_Posicion = Posición anterior − Posición actual" },
              { clave: "var_saldo", titulo: "Var. saldo", tipo: "monto_signo" },
              { clave: "var_saldo_pct", titulo: "Var. saldo %", tipo: "porcentaje", decimales: 4 },
              { clave: "motivo", titulo: "Motivo", ordenable: false },
            ]}
            filas={filasSignificativas}
            claveFila="clave"
            compacta
            altoMaximo="28rem"
            mensajeVacio="Ningún movimiento cumple la regla vigente en este par de períodos."
          />
        </div>
      </section>

      {/* 2. Ranking elegido ---------------------------------------------------------- */}
      <section id="ranking" aria-labelledby="titulo-ranking" className="mb-10 scroll-mt-24">
        <h2 id="titulo-ranking" className="mb-3">
          Ranking {nombreRanking(ranking)} · {textoPar}
        </h2>

        <article className="tarjeta mb-4" aria-labelledby="titulo-explicacion">
          <h3 id="titulo-explicacion">Principales movimientos</h3>
          <p className="mt-2">{introduccionRanking(ranking, movsRanking, anterior, actual)}</p>
          <ul className="mt-3 space-y-3">
            {explicaciones.map((e) => (
              <li key={e.codigo_banco} className="border-l-2 border-borde pl-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  <span>{e.banco}</span>
                  <IndicadorMovimiento valor={e.m.cambio_posicion} significativo={e.m.significativo} />
                  <span className="etiqueta">{e.m.significativo ? "Significativo" : "Cambio de posición"}</span>
                  {e.m.cambio_de_lider === "SI" && <span className="etiqueta">Cambio de líder</span>}
                </p>
                <p className="mt-1 text-sm">{e.frases.join(" ")}</p>
              </li>
            ))}
          </ul>
        </article>

        <TablaOrdenable
          titulo={`Movimientos de ${nombreRanking(ranking)} · ${textoPar}. Filas resaltadas: movimiento significativo.`}
          columnas={[
            { clave: "posicion_actual", titulo: "Posición actual", tipo: "entero" },
            { clave: "banco_texto", titulo: "Banco", enlace: enlaceMovimiento(ranking) },
            { clave: "posicion_anterior", titulo: "Posición anterior", tipo: "entero" },
            { clave: "cambio_posicion", titulo: "Cambio", tipo: "movimiento", ayuda: "Cambio_Posicion = Posición anterior − Posición actual" },
            { clave: "saldo_anterior", titulo: `Saldo ${formatearFecha(anterior, "corta")}`, tipo: "monto" },
            { clave: "saldo_actual", titulo: `Saldo ${formatearFecha(actual, "corta")}`, tipo: "monto" },
            { clave: "var_saldo", titulo: "Var_Saldo", tipo: "monto_signo", ayuda: "Saldo actual − Saldo anterior" },
            { clave: "var_saldo_pct", titulo: "Var_Saldo_Pct", tipo: "porcentaje", decimales: 4, ayuda: "Var_Saldo / Saldo anterior × 100" },
            { clave: "lider", titulo: "Cambio de líder", alinear: "centro" },
            { clave: "es_significativo", titulo: "Significativo", alinear: "centro" },
            { clave: "motivo", titulo: "Motivo", ordenable: false },
          ]}
          filas={filasRanking}
          claveFila="codigo_banco"
          ordenInicial={{ clave: "posicion_actual", direccion: "asc" }}
          filaResaltada={movsRanking.filter((m) => m.significativo).map((m) => m.codigo_banco)}
          compacta
        />

        <div className="mt-4">
          <Grafico
            titulo={`Posición por mes en ${nombreRanking(ranking)}`}
            descripcion={`Una línea por banco; la 1.ª posición está arriba. Zona sombreada: ${textoPar}. Bancos destacados: los elegidos en "Bancos lado a lado".`}
            altura={440}
            opcion={opcionPosiciones({ fechas, filas: posiciones, resaltados: bancosElegidos, anterior, actual })}
          />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer">Ver los datos del gráfico de posiciones</summary>
            <div className="mt-2">
              <TablaOrdenable
                titulo={`Posición de cada banco en ${nombreRanking(ranking)} por período`}
                columnas={[
                  { clave: "banco_texto", titulo: "Banco" },
                  ...fechas.map((f) => ({ clave: `p_${f}`, titulo: formatearFecha(f, "corta"), tipo: "entero" })),
                ]}
                filas={filasPosiciones}
                claveFila="codigo_banco"
                ordenInicial={{ clave: `p_${fechas.at(-1)}`, direccion: "asc" }}
                compacta
              />
            </div>
          </details>
        </div>
      </section>

      {/* 3. Cascada del movimiento elegido ------------------------------------------ */}
      <section id="cascada" aria-labelledby="titulo-cascada" className="mb-10 scroll-mt-24">
        <h2 id="titulo-cascada" className="mb-1">
          Cascada del movimiento{seleccionado ? `: ${seleccionado.banco} en ${nombreRanking(ranking)}` : ""}
        </h2>
        <p className="mb-3 text-sm text-texto-suave">
          Cómo se pasa del saldo anterior al actual siguiendo cada préstamo por su número: los que se originaron, los que
          salieron y lo que amortizaron los que continúan. Elija otro banco en el filtro &quot;Movimiento a explicar&quot; o
          haciendo clic en su nombre en las tablas.
        </p>
        {seleccionado && descSeleccionado ? (
          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <Grafico
              titulo={`Variación de saldo de ${seleccionado.banco} (${seleccionado.codigo_banco}) · ${nombreRanking(ranking)}`}
              descripcion="Verde suma, rojo resta. El eje vertical no empieza en cero para que se vean las variaciones."
              altura={400}
              formatoValor="monto"
              opcion={opcionCascada({ m: seleccionado, d: descSeleccionado })}
            />
            <div className="flex flex-col gap-3">
              <div className="marco-tabla" role="region" aria-label="Cifras exactas de la cascada" tabIndex={0}>
                <table className="tabla-datos tabla-compacta">
                  <caption>Cifras exactas de la cascada</caption>
                  <thead>
                    <tr>
                      <th scope="col">Concepto</th>
                      <th scope="col" className="num">Préstamos</th>
                      <th scope="col" className="num">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row" className="text-left font-normal">Saldo {formatearFecha(anterior)}</th>
                      <td className="num">—</td>
                      <td className="num">{formatearMonto(seleccionado.saldo_anterior)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="text-left font-normal">Préstamos nuevos</th>
                      <td className="num">{descSeleccionado.prestamos_nuevos}</td>
                      <td className="num">{formatearMonto(descSeleccionado.saldo_nuevos, { signo: true })}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="text-left font-normal">Préstamos que salieron</th>
                      <td className="num">{descSeleccionado.prestamos_salidos}</td>
                      <td className="num">{formatearMonto(descSeleccionado.saldo_salidos, { signo: true })}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="text-left font-normal">Préstamos que continúan (amortización)</th>
                      <td className="num">{descSeleccionado.prestamos_continuan}</td>
                      <td className="num">{formatearMonto(descSeleccionado.variacion_continuan, { signo: true })}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="text-left">Variación total (Var_Saldo)</th>
                      <td className="num" />
                      <td className="num font-semibold">{formatearMonto(seleccionado.var_saldo, { signo: true })}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Saldo {formatearFecha(actual)}</td>
                      <td className="num" />
                      <td className="num">{formatearMonto(seleccionado.saldo_actual)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-texto-tenue">
                {descomposicionCuadra(descSeleccionado)
                  ? "✓ Comprobado al centavo: nuevos + salidos + continúan = Var_Saldo."
                  : "Atención: la descomposición no cuadra con Var_Saldo; revise la carga del corte."}{" "}
                Posición: {ordinal(seleccionado.posicion_anterior)} → {ordinal(seleccionado.posicion_actual)}.
              </p>
              <div className="tarjeta text-sm">
                <h3 className="mb-1">En palabras</h3>
                <p>{explicarMovimiento(seleccionado, descSeleccionado, movsRanking).frases.join(" ")}</p>
              </div>
            </div>
          </div>
        ) : (
          <EstadoVacio titulo="No hay descomposición para este movimiento">
            No hay detalle por préstamo para este banco y ranking.
          </EstadoVacio>
        )}
      </section>

      {/* 4. Bancos lado a lado ------------------------------------------------------- */}
      <SeccionEntidades
        anterior={anterior}
        actual={actual}
        ranking={ranking}
        banco={bancoPedido}
        bancosElegidos={bancosElegidos}
        aviso={avisoBancos}
        todosBancos={todosBancos}
        ordenRankings={ORDEN_RANKINGS}
        movimientos={movs}
        rankingsActual={rankingsActual}
      />

      <p className="mt-10 border-t border-borde pt-3 text-xs text-texto-tenue">
        {FUENTE} Períodos comparados: {textoPar}.
      </p>
    </>
  );
}

/** Aviso cuando la base de datos no responde (p. ej. no se ha ejecutado db:setup). */
function ErrorDatos({ detalle }) {
  return (
    <>
      <EncabezadoPagina {...ENCABEZADO} />
      <MensajeError
        titulo="No se pudieron leer los datos de la comparación"
        mensaje="La base de datos no respondió. Verifique que se ejecutó npm run db:setup y npm run db:seed, y vuelva a intentarlo."
        detalle={detalle}
        accion={{ href: "/comparar", texto: "Volver a intentar" }}
      />
    </>
  );
}
