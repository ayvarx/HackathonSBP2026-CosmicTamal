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
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil } from "@/lib/auth";
import {
  descomposicion,
  movimientos,
  periodos,
  RANKINGS,
  rankings,
} from "@/lib/consultas";
import { compararDecimales, formatearFecha, formatearPorcentaje, nombreRanking } from "@/lib/formato";
import { cambioLider, montoCompacto, principalesMovimientos, quitarSigno, unirLista } from "./explicacion";
import { opcionCascada, opcionPosiciones } from "./graficos";
import SeccionEntidades, { MAX_BANCOS, MIN_BANCOS } from "./SeccionEntidades";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Comparar" };

const ORDEN_RANKINGS = RANKINGS.map((r) => r.clave);
const ENCABEZADO = {
  titulo: "Comparar períodos y bancos",
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
          {listaPeriodos.length === 0 ? null : `Solo está cargado ${formatearFecha(listaPeriodos[0].fecha)}.`}
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
    const [movs, desc, rankingsActual, ...posicionesPorFecha] = await Promise.all([
      movimientos({ anterior, actual }),
      descomposicion({ anterior, actual, ranking }),
      rankings({ fecha: actual }),
      ...fechas.map((fecha) => rankings({ fecha, ranking })),
    ]);
    datos = { movs, desc, rankingsActual, posiciones: posicionesPorFecha.flat() };
  } catch (error) {
    return <ErrorDatos detalle={error?.message} />;
  }
  const { movs, desc, rankingsActual, posiciones } = datos;

  if (movs.length === 0) {
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <Filtros campos={camposFiltro} />
        <EstadoVacio titulo="No hay movimientos para ese par de períodos">
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
  const grupos = principalesMovimientos(movsRanking);
  const seleccionado =
    movsRanking.find((m) => m.codigo_banco === bancoPedido) ??
    grupos.significativos[0] ??
    grupos.otros[0] ??
    [...movsRanking].sort((a, b) => compararDecimales(quitarSigno(b.var_saldo), quitarSigno(a.var_saldo)))[0];
  const descSeleccionado = seleccionado ? descPorBanco.get(seleccionado.codigo_banco) : undefined;

  // --- Bancos a comparar lado a lado ---------------------------------------------------
  const bancosUrl = leerBancos(sp.bancos, codigos);
  let bancosElegidos = bancosUrl;
  let avisoBancos = null;
  if (bancosElegidos === null) {
    bancosElegidos = [...movsRanking].sort((a, b) => a.posicion_actual - b.posicion_actual).slice(0, 3).map((m) => m.codigo_banco);
    avisoBancos = null;
  } else if (bancosElegidos.length > MAX_BANCOS) {
    avisoBancos = `Eligió ${bancosElegidos.length} bancos; se muestran solo los primeros ${MAX_BANCOS}.`;
    bancosElegidos = bancosElegidos.slice(0, MAX_BANCOS);
  } else if (bancosElegidos.length < MIN_BANCOS) {
    avisoBancos = `Elija al menos ${MIN_BANCOS} bancos.`;
  }

  // Enlaces que eligen un movimiento para la cascada (conservan la selección explícita de bancos).
  const sufijoBancos = bancosUrl ? `&bancos=${bancosElegidos.join(",")}` : "";
  const enlaceMovimiento = (rankingPlantilla) =>
    `/comparar?anterior=${anterior}&periodo=${actual}&ranking=${rankingPlantilla}&banco={codigo_banco}${sufijoBancos}#cascada`;

  // --- Resumen de los 6 rankings -------------------------------------------------------
  const significativos = movs.filter((m) => m.significativo);
  const rankingsConCambioLider = ORDEN_RANKINGS.filter((r) => movs.some((m) => m.ranking === r && m.cambio_de_lider === "SI"));
  const cambiosPosicion = movs.filter((m) => m.cambio_posicion !== 0).length;

  const filasSignificativas = significativos.map((m) => ({
    ...m,
    clave: `${m.ranking}-${m.codigo_banco}`,
    banco_texto: `${m.banco} (${m.codigo_banco})`,
  }));

  const filasRanking = movsRanking.map((m) => ({
    ...m,
    banco_texto: `${m.banco} (${m.codigo_banco})`,
    lider: m.cambio_de_lider === "SI" ? "Sí" : "No",
  }));

  const liderNuevo = cambioLider(movsRanking);
  const textoPar = `${formatearFecha(anterior)} → ${formatearFecha(actual)}`;

  const conteos = [
    { titulo: "Movimientos significativos", valor: significativos.length, unidad: `de ${movs.length}` },
    {
      titulo: "Cambios de líder",
      valor: rankingsConCambioLider.length,
      unidad: rankingsConCambioLider.length ? unirLista(rankingsConCambioLider.map(nombreRanking)) : "",
    },
    { titulo: "Cambios de posición", valor: cambiosPosicion, unidad: `de ${movs.length}` },
  ];

  return (
    <>
      <EncabezadoPagina {...ENCABEZADO} />

      <Filtros campos={camposFiltro} />

      {/* 1. Resumen de los 6 rankings ------------------------------------------------ */}
      <section id="resumen" aria-labelledby="titulo-resumen" className="mb-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-resumen">Resumen de los 6 rankings · {textoPar}</h2>
          <BotonDescarga
            href="/api/exportar/movimientos"
            parametros={{ anterior, actual }}
            texto="Descargar movimientos"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {conteos.map((c) => (
            <article key={c.titulo} className="tarjeta">
              <h3 className="text-sm font-semibold text-texto-suave">{c.titulo}</h3>
              <p className="cifra text-2xl font-extrabold text-texto">
                {c.valor}
                <span className="ml-1 text-sm font-normal text-texto-suave">{c.unidad}</span>
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4">
          <TablaOrdenable
            titulo="Movimientos significativos"
            columnas={[
              { clave: "ranking", titulo: "Ranking", tipo: "ranking" },
              { clave: "banco_texto", titulo: "Banco", enlace: enlaceMovimiento("{ranking}") },
              { clave: "posicion_anterior", titulo: "Posición anterior", tipo: "entero" },
              { clave: "posicion_actual", titulo: "Posición actual", tipo: "entero" },
              { clave: "cambio_posicion", titulo: "Cambio", tipo: "movimiento" },
              { clave: "var_saldo", titulo: "Var. saldo", tipo: "monto_signo" },
              { clave: "var_saldo_pct", titulo: "Var. saldo %", tipo: "porcentaje", decimales: 4 },
            ]}
            filas={filasSignificativas}
            claveFila="clave"
            compacta
            mensajeVacio="Ningún movimiento significativo."
          />
        </div>
      </section>

      {/* 2. Ranking elegido ---------------------------------------------------------- */}
      <section id="ranking" aria-labelledby="titulo-ranking" className="mb-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titulo-ranking">Ranking {nombreRanking(ranking)}</h2>
          {liderNuevo && (
            <p className="cifra text-sm font-semibold">
              <span className="text-[#106003]">▲ {liderNuevo.nuevo}</span>
              <span className="text-texto-tenue"> · </span>
              <span className="text-[#b42318]">▼ {liderNuevo.anterior}</span>
            </p>
          )}
        </div>

        {[
          { titulo: "Significativos", lista: grupos.significativos },
          { titulo: "Cambios de posición", lista: grupos.otros },
        ]
          .filter((g) => g.lista.length)
          .map((g) => (
            <div key={g.titulo} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-texto-suave">{g.titulo}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.lista.map((m) => (
                  <TarjetaMovimiento
                    key={m.codigo_banco}
                    m={m}
                    d={descPorBanco.get(m.codigo_banco)}
                    href={enlaceMovimiento(ranking).replace("{codigo_banco}", m.codigo_banco)}
                  />
                ))}
              </ul>
            </div>
          ))}

        <TablaOrdenable
          titulo={`Movimientos de ${nombreRanking(ranking)}`}
          columnas={[
            { clave: "posicion_actual", titulo: "Posición actual", tipo: "entero" },
            { clave: "banco_texto", titulo: "Banco", enlace: enlaceMovimiento(ranking) },
            { clave: "posicion_anterior", titulo: "Posición anterior", tipo: "entero" },
            { clave: "cambio_posicion", titulo: "Cambio", tipo: "movimiento" },
            { clave: "saldo_anterior", titulo: `Saldo ${formatearFecha(anterior, "corta")}`, tipo: "monto" },
            { clave: "saldo_actual", titulo: `Saldo ${formatearFecha(actual, "corta")}`, tipo: "monto" },
            { clave: "var_saldo", titulo: "Var. saldo", tipo: "monto_signo" },
            { clave: "var_saldo_pct", titulo: "Var. saldo %", tipo: "porcentaje", decimales: 4 },
            { clave: "lider", titulo: "Cambio de líder", alinear: "centro" },
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
            altura={440}
            opcion={opcionPosiciones({ fechas, filas: posiciones, resaltados: bancosElegidos, anterior, actual })}
          />
        </div>
      </section>

      {/* 3. Cascada del movimiento elegido ------------------------------------------ */}
      <section id="cascada" aria-labelledby="titulo-cascada" className="mb-8 scroll-mt-24">
        <h2 id="titulo-cascada" className="mb-3">
          Cascada del movimiento{seleccionado ? `: ${seleccionado.banco} en ${nombreRanking(ranking)}` : ""}
        </h2>
        {seleccionado && descSeleccionado ? (
          <Grafico altura={400} formatoValor="monto" opcion={opcionCascada({ m: seleccionado, d: descSeleccionado })} />
        ) : (
          <EstadoVacio titulo="No hay descomposición para este movimiento">
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
    </>
  );
}

/** Flecha y color según el signo: ▲ verde sube, ▼ rojo baja, = gris sin cambio. */
function flechaDe(signo) {
  if (signo > 0) return { flecha: "▲", color: "text-[#106003]" };
  if (signo < 0) return { flecha: "▼", color: "text-[#b42318]" };
  return { flecha: "=", color: "text-texto-tenue" };
}

/** Signo de un decimal en texto, sin aritmética de punto flotante. */
function signoTexto(texto) {
  const t = String(texto ?? "0");
  if (/^-/.test(t)) return /[1-9]/.test(t) ? -1 : 0;
  return /[1-9]/.test(t) ? 1 : 0;
}

/** "▲ +418.6 M" con su color. */
function Cambio({ valor, texto }) {
  const { flecha, color } = flechaDe(signoTexto(valor));
  return <span className={`whitespace-nowrap ${color}`}>{flecha} {texto}</span>;
}

/** Tarjeta compacta de un movimiento: "7 → 3 ▲ 4", variación de saldo y su descomposición. */
function TarjetaMovimiento({ m, d, href }) {
  const { flecha, color } = flechaDe(Math.sign(m.cambio_posicion));
  const tieneSaldoPct = m.var_saldo_pct !== null && m.var_saldo_pct !== undefined;
  const cifras = d
    ? [
        { rotulo: "Nuevos", valor: d.saldo_nuevos },
        { rotulo: "Salieron", valor: d.saldo_salidos },
        { rotulo: "Amortización", valor: d.variacion_continuan },
      ]
    : [];
  return (
    <li className="tarjeta flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={href} className="whitespace-nowrap font-semibold">
          {m.banco}
        </a>
        {m.cambio_de_lider === "SI" && <span className="etiqueta">Cambio de líder</span>}
      </div>
      <p className="cifra text-2xl font-extrabold text-texto">
        {m.posicion_anterior} → {m.posicion_actual}{" "}
        <span className={`text-base font-semibold ${color}`}>
          {flecha} {Math.abs(m.cambio_posicion)}
        </span>
      </p>
      <p className="cifra text-sm font-semibold">
        <Cambio valor={m.var_saldo} texto={montoCompacto(m.var_saldo)} />
        {tieneSaldoPct && (
          <>
            <span className="text-texto-tenue"> · </span>
            <Cambio valor={m.var_saldo_pct} texto={formatearPorcentaje(m.var_saldo_pct, 2, { signo: true })} />
          </>
        )}
      </p>
      {cifras.length > 0 && (
        <dl className="mt-1 grid grid-cols-3 gap-2 border-t border-borde pt-2 text-xs">
          {cifras.map((c) => (
            <div key={c.rotulo}>
              <dt className="text-texto-tenue">{c.rotulo}</dt>
              <dd className="cifra font-semibold">
                <Cambio valor={c.valor} texto={montoCompacto(c.valor)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/** Aviso cuando la base de datos no responde (p. ej. no se ha ejecutado db:setup). */
function ErrorDatos({ detalle }) {
  return (
    <>
      <EncabezadoPagina {...ENCABEZADO} />
      <MensajeError
        titulo="No se pudieron leer los datos de la comparación"
        detalle={detalle}
        accion={{ href: "/comparar", texto: "Volver a intentar" }}
      />
    </>
  );
}
