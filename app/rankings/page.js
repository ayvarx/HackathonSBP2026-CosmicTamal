// Rankings (/rankings) — Posición de los 12 bancos en cada actividad económica.
//
// Filtros en la URL (se pueden compartir con un enlace):
//   ?periodo=AAAAMMDD  corte a mostrar (por defecto el más reciente)
//   &ranking=CLAVE     uno de los 6 rankings (por defecto HIPOTECARIO)
//   &banco=101         resalta un banco y muestra su ficha
//   &subactividad=...  limita el desglose a una subactividad
//   &vista=tarjetas    vista de tarjetas por banco (frontend de Amet); por defecto, la tabla
//
// Fusión de los dos frontends: la tabla ordenable, el gráfico, el desglose con la nota SB21, la
// ficha y las descargas son de esta aplicación; la cabecera de actividad, el selector de período,
// las tarjetas por banco (BancoCard) y el detalle del banco (BancoDetalle) vienen de Amet (_amet/).
//
// Todas las cifras vienen del motor SQL (lib/consultas.js); esta página solo las ordena
// y las formatea para mostrarlas. Componente de servidor.
import Link from "next/link";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import Grafico from "@/components/Grafico";
import MensajeError from "@/components/MensajeError";
import TablaOrdenable from "@/components/TablaOrdenable";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import AlternarVista from "./AlternarVista";
import { alcanzaPerfil, exigirPerfil } from "@/lib/auth";
import { movimientos, RANKINGS, rankings, subactividades } from "@/lib/consultas";
import {
  elegirPeriodo,
  fechasDisponibles,
  reclasificacionSB21,
  textoParametro,
  totalesRanking,
} from "@/lib/consultas-rankings";
import {
  aNumeroParaGrafico,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearPorcentaje,
  nombreBanco,
  nombreSubactividad,
  signoDecimal,
} from "@/lib/formato";
import BancoDetalle from "./_amet/BancoDetalle";
import { descargasBanco } from "./_amet/descargaBanco";
import PeriodSelect from "./_amet/PeriodSelect";
import RankingsPage, { PestanasVista } from "./_amet/RankingsPage";
import TarjetasBancos from "./_amet/TarjetasBancos";
import GraficoRanking from "./GraficoRanking";
import TablaConColumnas from "./TablaConColumnas";
import { urlRankings } from "./urls";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Rankings" };

/** Une las palabras con espacios irrompibles para que el nombre del banco no se parta en la tabla. */
const sinCortes = (texto) => String(texto).replace(/ /g, " ");

// Colores de las subactividades en las tarjetas de Amet (tonos del tema "Radar", bien distintos entre sí).
const COLORES_SUBACTIVIDAD = ["#106003", "#7EAC39", "#052200", "#419A33", "#136749", "#608D1A", "#297D5F", "#094000", "#267F18"];
const MAX_CORTES_TARJETA = 6;

/** Lee todo lo que la pantalla necesita. Si falla la base, la página muestra un error claro. */
async function cargarDatos(pedido, conTarjetas) {
  const fechas = await fechasDisponibles();
  const periodo = elegirPeriodo(pedido.periodo, fechas);
  if (!periodo.fecha) return { fechas, periodo };

  // Un ranking desconocido en la URL no rompe la página: se usa el primero y se avisa.
  const info = RANKINGS.find((r) => r.clave === pedido.ranking) ?? RANKINGS[0];
  const { fecha, anterior } = periodo;
  // Vista de tarjetas: saldo y posición del ranking en los cortes hasta el elegido, y los 6 rankings del corte.
  const cortesTarjeta = fechas.slice(0, fechas.indexOf(fecha) + 1).slice(-MAX_CORTES_TARJETA);
  const [filas, desglose, movs, totales, sb21, historico, todos] = await Promise.all([
    rankings({ fecha, ranking: info.clave }),
    subactividades({ fecha, ranking: info.clave }),
    anterior ? movimientos({ anterior, actual: fecha, ranking: info.clave }) : Promise.resolve([]),
    totalesRanking({ fecha, ranking: info.clave }),
    info.clave === "CONSUMO" ? reclasificacionSB21(fecha) : Promise.resolve(null),
    conTarjetas
      ? Promise.all(cortesTarjeta.map(async (f) => ({ fecha: f, filas: await rankings({ fecha: f, ranking: info.clave }) })))
      : Promise.resolve([]),
    conTarjetas ? rankings({ fecha }) : Promise.resolve([]),
  ]);
  return { fechas, periodo, info, filas, desglose, movs, totales, sb21, historico, todos };
}

export default async function PaginaRankings({ searchParams }) {
  // Control de acceso en el servidor ANTES de consultar datos.
  const perfil = await exigirPerfil("publico");
  const parametros = await searchParams;
  const pedido = {
    periodo: textoParametro(parametros.periodo),
    ranking: textoParametro(parametros.ranking).toUpperCase(),
    banco: textoParametro(parametros.banco),
    subactividad: textoParametro(parametros.subactividad),
    vista: textoParametro(parametros.vista).toLowerCase(),
  };
  const conTarjetas = pedido.vista === "tarjetas";
  const vista = conTarjetas ? "tarjetas" : ""; // la tabla es la vista por defecto (sin parámetro)

  const encabezadoBase = (
    <EncabezadoPagina
      titulo="Rankings de crédito"
    />
  );

  let datos;
  try {
    datos = await cargarDatos(pedido, conTarjetas);
  } catch (error) {
    return (
      <>
        {encabezadoBase}
        <MensajeError
          titulo="No se pudieron leer los rankings"
          mensaje="La base de datos no respondió. Vuelva a intentarlo en unos segundos."
          detalle={error?.message}
          accion={{ href: "/rankings", texto: "Reintentar" }}
        />
      </>
    );
  }

  const { periodo } = datos;
  if (!periodo.fecha) {
    return (
      <>
        {encabezadoBase}
        <EstadoVacio
          titulo="Aún no hay cortes cargados"
          accion={alcanzaPerfil(perfil, "administrador") ? { href: "/admin", texto: "Cargar un corte AT03" } : undefined}
        >
          Aquí aparecerán las posiciones de los 12 bancos.
        </EstadoVacio>
      </>
    );
  }

  const { info, filas, desglose, movs, totales, sb21 } = datos;
  const { fecha, anterior } = periodo;
  const ranking = info.clave;
  const esAnalista = alcanzaPerfil(perfil, "analista");

  // Validación de filtros: un valor que no existe se ignora y se avisa (nunca rompe la página).
  const avisos = [];
  if (periodo.invalido) avisos.push(`El período «${pedido.periodo}» no está cargado; se muestra el más reciente.`);
  if (pedido.ranking && pedido.ranking !== ranking) avisos.push(`El ranking «${pedido.ranking}» no existe; se muestra ${info.nombre}.`);
  const banco = filas.some((f) => f.codigo_banco === pedido.banco) ? pedido.banco : "";
  if (pedido.banco && !banco) avisos.push(`El banco «${pedido.banco}» no está en el catálogo; se muestran todos.`);
  const nombresSub = [...new Set(desglose.map((d) => d.subactividad))];
  const subactividad = nombresSub.includes(pedido.subactividad) ? pedido.subactividad : "";
  if (pedido.subactividad && !subactividad) {
    avisos.push(`La subactividad «${pedido.subactividad}» no pertenece a ${info.nombre}; se muestran todas.`);
  }

  // ---------- Tabla principal: 12 bancos con su movimiento frente al período anterior ----------
  const movPorBanco = new Map(movs.map((m) => [m.codigo_banco, m]));
  const filasTabla = filas.map((f) => {
    const m = movPorBanco.get(f.codigo_banco);
    return {
      Posicion: f.posicion,
      Codigo_Banco: f.codigo_banco,
      Banco: sinCortes(nombreBanco(f.codigo_banco, f.banco)),
      Saldo_Actividad: f.saldo_actividad,
      Total_Cartera_Local_Valida: f.total_cartera_local_valida,
      Ponderacion_Pct: f.ponderacion_pct,
      Operaciones_Validas: f.operaciones_validas,
      Posicion_Anterior: m?.posicion_anterior ?? null,
      Cambio_Posicion: m ? m.cambio_posicion : null,
      Var_Saldo_Pct: m?.var_saldo_pct ?? null,
      // Texto corto para que la tabla quepa; el motivo completo se ve en la ficha del banco.
      Significativo: m ? (m.significativo ? "Sí" : "No") : null,
    };
  });

  const enlaceBanco = urlRankings({ periodo: fecha, ranking, subactividad }) + "&banco={Codigo_Banco}";
  const enlaceDetalle = urlRankings({ periodo: fecha, ranking, subactividad }, "/rankings/detalle") + "&banco={Codigo_Banco}";
  const textoAnterior = anterior ? formatearFecha(anterior) : null;

  const columnasRanking = [
    { clave: "Posicion", titulo: "Posición", tipo: "entero", alinear: "centro", ayuda: "1 = mayor saldo" },
    { clave: "Banco", titulo: "Banco", enlace: enlaceBanco, ayuda: "Pulse el nombre para ver la ficha del banco" },
    { clave: "Saldo_Actividad", titulo: "Saldo de la actividad", tipo: "monto", ayuda: "Saldo del banco en esta actividad" },
    { clave: "Total_Cartera_Local_Valida", titulo: "Cartera local válida", tipo: "monto", ayuda: "Cartera local del banco en las 6 actividades" },
    { clave: "Ponderacion_Pct", titulo: "Ponderación", tipo: "porcentaje", decimales: 4, ayuda: "Peso de la actividad en la cartera del banco" },
    {
      clave: "Operaciones_Validas",
      titulo: "Operaciones válidas",
      tipo: "entero",
      ayuda: esAnalista ? "Pulse para ver los préstamos que suman el saldo" : "Préstamos que suman el saldo",
      ...(esAnalista ? { enlace: enlaceDetalle } : {}),
    },
    { clave: "Cambio_Posicion", titulo: "Movimiento", tipo: "movimiento", ayuda: anterior ? `Cambio de posición frente a ${textoAnterior}` : "Sin período anterior" },
    { clave: "Posicion_Anterior", titulo: "Posición anterior", tipo: "entero", alinear: "centro" },
    { clave: "Var_Saldo_Pct", titulo: "Var. saldo %", tipo: "porcentaje", decimales: 4, ayuda: "Frente al período anterior" },
    { clave: "Significativo", titulo: "Signif.", alinear: "centro", ayuda: "Movimiento significativo" },
  ];

  // ---------- Desglose por subactividad ----------
  const subVisibles = subactividad ? [subactividad] : nombresSub;
  const saldoSub = new Map(desglose.map((d) => [`${d.codigo_banco}|${d.subactividad}`, d]));
  const sb21PorBanco = new Map((sb21?.bancos ?? []).map((b) => [b.codigo_banco, b]));
  const filasDesglose = filas.map((f) => {
    const fila = { Posicion: f.posicion, Codigo_Banco: f.codigo_banco, Banco: sinCortes(f.banco) };
    subVisibles.forEach((s, i) => {
      fila[`sub_${i}`] = saldoSub.get(`${f.codigo_banco}|${s}`)?.saldo ?? "0.00";
    });
    fila.Saldo_Actividad = f.saldo_actividad;
    if (sb21) fila.Reclasificado = sb21PorBanco.get(f.codigo_banco)?.saldo ?? "0.00";
    return fila;
  });
  const totalSub = new Map(totales.subactividades.map((s) => [s.subactividad, s]));
  const filaTotalDesglose = { Banco: "Total de los 12 bancos", Saldo_Actividad: totales.total.saldo };
  subVisibles.forEach((s, i) => {
    filaTotalDesglose[`sub_${i}`] = totalSub.get(s)?.saldo ?? "0.00";
  });
  if (sb21) filaTotalDesglose.Reclasificado = sb21.total.saldo;

  const columnasDesglose = [
    { clave: "Posicion", titulo: "Posición", tipo: "entero", alinear: "centro" },
    { clave: "Banco", titulo: "Banco", enlace: enlaceBanco },
    ...subVisibles.map((s, i) => ({ clave: `sub_${i}`, titulo: nombreSubactividad(s), tipo: "monto" })),
    { clave: "Saldo_Actividad", titulo: "Saldo de la actividad", tipo: "monto" },
    ...(sb21
      ? [{ clave: "Reclasificado", titulo: "Movido a Tarjeta (SB21)", tipo: "monto" }]
      : []),
  ];

  // Gráfico apilado: una barra por banco, un segmento por subactividad.
  const opcionApilada = {
    color: COLORES_SUBACTIVIDAD,
    legend: { top: 0, type: "scroll" },
    tooltip: { trigger: "axis", confine: true, axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 24, top: 40, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: filas.map((f) => `${f.posicion}. ${f.banco}`) },
    series: subVisibles.map((s) => ({
      name: nombreSubactividad(s),
      type: "bar",
      stack: "total",
      barMaxWidth: 28,
      itemStyle: { borderRadius: 0 },
      data: filas.map((f) => aNumeroParaGrafico(saldoSub.get(`${f.codigo_banco}|${s}`)?.saldo ?? "0")),
    })),
  };

  const filaBanco = banco ? filas.find((f) => f.codigo_banco === banco) : null;
  const movBanco = banco ? movPorBanco.get(banco) : null;

  // ---------- Cabecera de actividad y pestañas (componentes de Amet) ----------
  const base = { periodo: fecha, ranking, subactividad, vista }; // filtros actuales SIN banco
  const gruposChips = [
    {
      titulo: "rankings",
      chips: RANKINGS.map((r) => ({
        clave: r.clave,
        texto: r.nombre,
        href: urlRankings({ periodo: fecha, ranking: r.clave, banco, vista }),
        activo: r.clave === ranking,
      })),
    },
  ];
  const selectorPeriodo = (
    <PeriodSelect
      periods={[...datos.fechas].reverse().map((f) => ({ valor: f, texto: `${formatearFecha(f)} (${f})` }))}
      value={fecha}
      destinos={Object.fromEntries(datos.fechas.map((f) => [f, urlRankings({ ...base, periodo: f, banco })]))}
    />
  );
  const pestanas = [
    { id: "tabla", titulo: "Tabla y gráfico", href: urlRankings({ ...base, vista: "", banco }), activa: !conTarjetas },
    { id: "tarjetas", titulo: "Tarjetas por banco", href: urlRankings({ ...base, vista: "tarjetas", banco }), activa: conTarjetas },
  ];

  // ---------- Vista de tarjetas: una por banco con su composición (BancoCard) ----------
  const colorDe = (s) => COLORES_SUBACTIVIDAD[nombresSub.indexOf(s) % COLORES_SUBACTIVIDAD.length];
  const partesDe = (codigo) =>
    nombresSub
      .map((s) => ({ nombre: nombreSubactividad(s), valor: saldoSub.get(`${codigo}|${s}`)?.saldo ?? "0.00", color: colorDe(s) }))
      .filter((p) => signoDecimal(p.valor) > 0);
  const tarjetas = conTarjetas
    ? filas.map((f) => ({
        codigo: f.codigo_banco,
        posicion: f.posicion,
        banco: f.banco,
        saldo: f.saldo_actividad,
        serie: datos.historico.map((h) => ({
          periodo: h.fecha,
          etiqueta: formatearFecha(h.fecha, "corta"),
          valor: h.filas.find((x) => x.codigo_banco === f.codigo_banco)?.saldo_actividad ?? "0.00",
        })),
        partes: partesDe(f.codigo_banco),
        seleccionada: f.codigo_banco === banco,
        hrefSeleccion: urlRankings(f.codigo_banco === banco ? base : { ...base, banco: f.codigo_banco }),
        descargas: descargasBanco({ fecha, ranking, codigo: f.codigo_banco }),
      }))
    : [];
  const detalleTarjeta =
    conTarjetas && filaBanco ? (
      <BancoDetalle
        banco={nombreBanco(filaBanco.codigo_banco, filaBanco.banco)}
        posicion={filaBanco.posicion}
        actividad={info.nombre}
        saldo={filaBanco.saldo_actividad}
        ponderacion={filaBanco.ponderacion_pct}
        operaciones={filaBanco.operaciones_validas}
        lider={filas[0].saldo_actividad}
        partes={partesDe(banco)}
        posicionesPeriodos={datos.historico.map((h) => ({
          periodo: h.fecha,
          etiqueta: formatearFecha(h.fecha, "corta"),
          posicion: h.filas.find((x) => x.codigo_banco === banco)?.posicion,
        }))}
        otras={RANKINGS.map((r) => {
          const fila = datos.todos.find((x) => x.ranking === r.clave && x.codigo_banco === banco);
          return {
            clave: r.clave,
            nombre: r.nombre,
            posicion: fila?.posicion,
            saldo: fila?.saldo_actividad ?? "0.00",
            activa: r.clave === ranking,
            href: urlRankings({ periodo: fecha, ranking: r.clave, banco, vista }),
          };
        })}
        hrefCerrar={urlRankings(base)}
      >
        {movBanco && (
          <span>
            Frente a {textoAnterior}: posición {movBanco.posicion_anterior} → {movBanco.posicion_actual}, saldo{" "}
            <span className="cifra">{formatearMonto(movBanco.var_saldo, { signo: true })}</span>.
            {movBanco.significativo ? ` Movimiento significativo: ${movBanco.motivo}.` : ""}
          </span>
        )}
        {esAnalista && (
          <Link href={urlRankings({ periodo: fecha, ranking, banco, subactividad }, "/rankings/detalle")} className="bd-cerrar">
            Ver los préstamos
          </Link>
        )}
      </BancoDetalle>
    ) : null;

  const hrefDetalle = urlRankings({ periodo: fecha, ranking, banco, subactividad }, "/rankings/detalle");
  const tablaRanking = (
    <TablaConColumnas
      ocultasInicial={["Posicion_Anterior", "Significativo"]}
      fijas={["Posicion", "Banco"]}
      titulo={`Ranking ${info.nombre} · ${formatearFecha(fecha)}`}
      columnas={columnasRanking}
      filas={filasTabla}
      claveFila="Codigo_Banco"
      ordenInicial={{ clave: "Posicion", direccion: "asc" }}
      filaResaltada={banco || undefined}
      filaTotal={{ Banco: "Total de los 12 bancos", Saldo_Actividad: totales.total.saldo, Operaciones_Validas: totales.total.operaciones }}
      compacta
    />
  );
  const graficoRanking = (
    <GraficoRanking
      barras={filas.map((f) => ({
        codigo: f.codigo_banco,
        etiqueta: f.banco,
        saldo: f.saldo_actividad,
        posicion: f.posicion,
        ponderacion: f.ponderacion_pct,
      }))}
      resaltado={banco}
      rutaBase={urlRankings({ periodo: fecha, ranking, subactividad })}
    />
  );
  const tablaDesglose = (
    <TablaOrdenable
      titulo={`Desglose de ${info.nombre} por subactividad · ${formatearFecha(fecha)}`}
      columnas={columnasDesglose}
      filas={filasDesglose}
      claveFila="Codigo_Banco"
      ordenInicial={{ clave: "Posicion", direccion: "asc" }}
      filaResaltada={banco || undefined}
      filaTotal={filaTotalDesglose}
      compacta
    />
  );
  const graficoDesglose = (
    <Grafico opcion={opcionApilada} altura={Math.max(340, filas.length * 34 + 60)} formatoValor="monto" />
  );
  const descargaDesglose = (
    <BotonDescarga href="/api/exportar/subactividades" parametros={{ fecha, ranking }} texto="Descargar desglose" />
  );

  return (
    <>
      <EncabezadoPagina
        titulo={`Ranking ${info.nombre}`}
        descripcion={
          <>
            {formatearFecha(fecha)}
            {anterior ? <> · comparado con {textoAnterior}</> : null}
          </>
        }
      />

      {/* Chips de los 6 rankings, período y filtros en un solo recuadro. */}
      <RankingsPage grupos={gruposChips} selector={selectorPeriodo}>
        <Filtros
          campos={[
            {
              nombre: "banco",
              etiqueta: "Banco",
              textoTodos: "Todos los bancos",
              opciones: [...filas]
                .sort((a, b) => a.codigo_banco.localeCompare(b.codigo_banco))
                .map((f) => ({ valor: f.codigo_banco, texto: nombreBanco(f.codigo_banco, f.banco) })),
            },
            {
              nombre: "subactividad",
              etiqueta: "Subactividad",
              textoTodos: "Todas las subactividades",
              opciones: nombresSub.map((s) => ({ valor: s, texto: nombreSubactividad(s) })),
            },
          ]}
        />
      </RankingsPage>

      {avisos.length > 0 && (
        <div className="mb-6">
          <MensajeError titulo="Algunos filtros de la dirección no son válidos" mensaje={avisos.join(" ")} />
        </div>
      )}

      <PestanasVista pestanas={pestanas} />

      {/* Ficha del banco elegido (vista de tabla; en la de tarjetas la reemplaza BancoDetalle) */}
      {filaBanco && !conTarjetas && (
        <section aria-labelledby="titulo-ficha" className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-ficha">
              {nombreBanco(filaBanco.codigo_banco, filaBanco.banco)} en {info.nombre}
            </h2>
            <Link href={urlRankings(base)} scroll={false} className="text-sm">
              Quitar la selección
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TarjetaIndicador
              titulo="Posición"
              valor={`${filaBanco.posicion} de ${filas.length}`}
              movimiento={{ valor: movBanco ? movBanco.cambio_posicion : null, significativo: Boolean(movBanco?.significativo) }}
              detalle={movBanco ? `Antes: posición ${movBanco.posicion_anterior} en ${textoAnterior}.` : undefined}
            />
            <TarjetaIndicador
              titulo="Saldo de la actividad"
              valor={formatearMonto(filaBanco.saldo_actividad)}
              movimiento={movBanco ? { valor: movBanco.var_saldo, tipo: "monto" } : undefined}
              detalle={movBanco ? `Saldo en ${textoAnterior}: ${formatearMonto(movBanco.saldo_anterior)}` : undefined}
            />
            <TarjetaIndicador
              titulo="Ponderación"
              valor={formatearPorcentaje(filaBanco.ponderacion_pct)}
              detalle={`Cartera local: ${formatearMonto(filaBanco.total_cartera_local_valida)}`}
            />
            <TarjetaIndicador
              titulo="Operaciones válidas"
              valor={formatearEntero(filaBanco.operaciones_validas)}
              unidad="préstamos"
              enlace={esAnalista ? { href: hrefDetalle, texto: "Ver los préstamos" } : undefined}
            />
          </div>
        </section>
      )}

      {conTarjetas ? (
        <section aria-labelledby="titulo-tarjetas" className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-tarjetas">Tarjetas de los 12 bancos · {formatearFecha(fecha)}</h2>
            <BotonDescarga href="/api/exportar/rankings" parametros={{ fecha, ranking }} texto="Descargar ranking" variante="primario" />
          </div>
          <TarjetasBancos tarjetas={tarjetas} detalle={detalleTarjeta} />
        </section>
      ) : (
        <AlternarVista
          id="titulo-posiciones"
          titulo="Posiciones de los 12 bancos"
          tabla={tablaRanking}
          grafico={graficoRanking}
          acciones={
            <>
              {esAnalista && (
                <Link href={hrefDetalle} className="boton boton-secundario">
                  Ver los préstamos
                </Link>
              )}
              <BotonDescarga href="/api/exportar/rankings" parametros={{ fecha, ranking }} texto="Descargar ranking" variante="primario" />
            </>
          }
        />
      )}

      {sb21 && (
        <p className="tarjeta mb-4 text-sm" role="note">
          En {formatearFecha(fecha)} pasaron de Crédito personal a Tarjeta{" "}
          <strong>{formatearEntero(sb21.total.operaciones)}</strong> préstamos de tarjeta de crédito por{" "}
          <strong className="cifra">{formatearMonto(sb21.total.saldo)}</strong>.
        </p>
      )}

      {/* Desglose por subactividad: en la vista de tarjetas la composición ya está en cada tarjeta (solo tabla). */}
      <AlternarVista
        id="titulo-desglose"
        titulo={subactividad ? `Desglose: ${nombreSubactividad(subactividad)}` : "Desglose por subactividad"}
        tabla={tablaDesglose}
        grafico={conTarjetas ? null : graficoDesglose}
        acciones={descargaDesglose}
      />
    </>
  );
}
