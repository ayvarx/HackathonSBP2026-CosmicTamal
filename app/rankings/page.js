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
import { alcanzaPerfil, exigirPerfil } from "@/lib/auth";
import { movimientos, RANKINGS, rankings, reconciliaciones, subactividades } from "@/lib/consultas";
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
import NotaFuente from "./NotaFuente";
import { urlRankings } from "./urls";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Rankings" };

const TIPO_RANKING = {
  obligatorio: { grupo: "Obligatorios", texto: "Ranking obligatorio" },
  recomendado: { grupo: "Recomendado", texto: "Ranking recomendado adicional" },
  bonus: { grupo: "Bonus", texto: "Ranking bonus" },
};

/** Une las palabras con espacios irrompibles para que el nombre del banco no se parta en la tabla. */
const sinCortes = (texto) => String(texto).replace(/ /g, " ");

// Colores de las subactividades en las tarjetas de Amet (tonos del tema "Radar", bien distintos entre sí).
const COLORES_SUBACTIVIDAD = ["#083502", "#287f1d", "#b5e1af", "#28e90e", "#59b84c", "#698b64", "#68c85b", "#3b8c30"];
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
  const [filas, desglose, movs, totales, conciliacion, sb21, historico, todos] = await Promise.all([
    rankings({ fecha, ranking: info.clave }),
    subactividades({ fecha, ranking: info.clave }),
    anterior ? movimientos({ anterior, actual: fecha, ranking: info.clave }) : Promise.resolve([]),
    totalesRanking({ fecha, ranking: info.clave }),
    reconciliaciones(fecha),
    info.clave === "CONSUMO" ? reclasificacionSB21(fecha) : Promise.resolve(null),
    conTarjetas
      ? Promise.all(cortesTarjeta.map(async (f) => ({ fecha: f, filas: await rankings({ fecha: f, ranking: info.clave }) })))
      : Promise.resolve([]),
    conTarjetas ? rankings({ fecha }) : Promise.resolve([]),
  ]);
  return { fechas, periodo, info, filas, desglose, movs, totales, conciliacion, sb21, historico, todos };
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
      descripcion="Posición, saldo, cartera local válida y ponderación de los 12 bancos en cada actividad económica."
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
          mensaje="La base de datos no respondió. Verifique que esté configurada (npm run db:setup) y vuelva a intentarlo."
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
          Los rankings se calculan a partir de los archivos AT03. Cuando un administrador cargue el primer corte,
          aquí aparecerán las posiciones de los 12 bancos.
        </EstadoVacio>
      </>
    );
  }

  const { info, filas, desglose, movs, totales, conciliacion, sb21 } = datos;
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
    { clave: "Posicion", titulo: "Posición", tipo: "entero", alinear: "centro", ayuda: "Posicion: 1 = mayor saldo; empate por código de banco" },
    { clave: "Banco", titulo: "Banco", enlace: enlaceBanco, ayuda: "Pulse el nombre para ver la ficha del banco" },
    { clave: "Saldo_Actividad", titulo: "Saldo de la actividad", tipo: "monto", ayuda: "Saldo_Actividad: suma del saldo del banco en este ranking" },
    { clave: "Total_Cartera_Local_Valida", titulo: "Cartera local válida", tipo: "monto", ayuda: "Total_Cartera_Local_Valida: todo el universo local válido del banco (6 actividades)" },
    { clave: "Ponderacion_Pct", titulo: "Ponderación", tipo: "porcentaje", decimales: 4, ayuda: "Ponderacion_Pct = Saldo de la actividad ÷ Cartera local válida × 100" },
    {
      clave: "Operaciones_Validas",
      titulo: "Operaciones válidas",
      tipo: "entero",
      ayuda: esAnalista ? "Pulse para ver los préstamos que suman el saldo" : "Préstamos que suman el saldo",
      ...(esAnalista ? { enlace: enlaceDetalle } : {}),
    },
    { clave: "Cambio_Posicion", titulo: "Movimiento", tipo: "movimiento", ayuda: anterior ? `Cambio de posición frente a ${textoAnterior}` : "Sin período anterior" },
    { clave: "Posicion_Anterior", titulo: "Posición anterior", tipo: "entero", alinear: "centro" },
    { clave: "Var_Saldo_Pct", titulo: "Var. saldo", tipo: "porcentaje", decimales: 4, ayuda: "Var_Saldo_Pct frente al período anterior" },
    { clave: "Significativo", titulo: "Signif.", alinear: "centro", ayuda: "Movimiento significativo según la regla configurable; pulse el banco para ver el motivo" },
  ];

  // ---------- Desglose por subactividad (con la reconciliación 1 a la vista) ----------
  const subVisibles = subactividad ? [subactividad] : nombresSub;
  const saldoSub = new Map(desglose.map((d) => [`${d.codigo_banco}|${d.subactividad}`, d]));
  const cuadreR1 = new Map(
    conciliacion.detalle
      .filter((d) => d.reconciliacion === 1 && d.ranking === ranking)
      .map((d) => [d.codigo_banco, d.cuadra === "SI" ? "Cuadra" : "No cuadra"]),
  );
  const sb21PorBanco = new Map((sb21?.bancos ?? []).map((b) => [b.codigo_banco, b]));
  const filasDesglose = filas.map((f) => {
    const fila = { Posicion: f.posicion, Codigo_Banco: f.codigo_banco, Banco: sinCortes(f.banco) };
    subVisibles.forEach((s, i) => {
      fila[`sub_${i}`] = saldoSub.get(`${f.codigo_banco}|${s}`)?.saldo ?? "0.00";
    });
    fila.Saldo_Actividad = f.saldo_actividad;
    fila.Reconciliacion = cuadreR1.get(f.codigo_banco) ?? null;
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
    ...subVisibles.map((s, i) => ({ clave: `sub_${i}`, titulo: nombreSubactividad(s), tipo: "monto", ayuda: `Saldo de la subactividad ${s}` })),
    { clave: "Saldo_Actividad", titulo: "Saldo de la actividad", tipo: "monto", ayuda: "Suma de todas las subactividades del ranking" },
    { clave: "Reconciliacion", titulo: "Reconciliación 1", alinear: "centro", ayuda: "Suma de subactividades = saldo de la actividad, al centavo" },
    ...(sb21
      ? [{ clave: "Reclasificado", titulo: "Movido a Tarjeta (SB21)", tipo: "monto", ayuda: "Ya incluido en Tarjeta y restado de Crédito personal" }]
      : []),
  ];

  // Gráfico apilado: una barra por banco, un segmento por subactividad.
  const opcionApilada = {
    legend: { top: 0, type: "scroll" },
    grid: { left: 8, right: 24, top: 40, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: filas.map((f) => `${f.posicion}. ${f.banco}`) },
    series: subVisibles.map((s) => ({
      name: nombreSubactividad(s),
      type: "bar",
      stack: "total",
      data: filas.map((f) => aNumeroParaGrafico(saldoSub.get(`${f.codigo_banco}|${s}`)?.saldo ?? "0")),
    })),
  };

  const filaBanco = banco ? filas.find((f) => f.codigo_banco === banco) : null;
  const movBanco = banco ? movPorBanco.get(banco) : null;
  const tipo = TIPO_RANKING[info.tipo];

  // ---------- Cabecera de actividad y pestañas (componentes de Amet) ----------
  const base = { periodo: fecha, ranking, subactividad, vista }; // filtros actuales SIN banco
  const gruposChips = ["obligatorio", "recomendado", "bonus"].map((t) => ({
    titulo: TIPO_RANKING[t].grupo,
    chips: RANKINGS.filter((r) => r.tipo === t).map((r) => ({
      clave: r.clave,
      texto: r.nombre,
      href: urlRankings({ periodo: fecha, ranking: r.clave, banco, vista }),
      activo: r.clave === ranking,
    })),
  }));
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

  return (
    <>
      <EncabezadoPagina
        titulo={`Ranking ${info.nombre}`}
        descripcion={
          <>
            {tipo.texto} · corte de <strong>{formatearFecha(fecha)}</strong> (Fecha = {fecha})
            {anterior ? <> · movimientos frente a {textoAnterior}</> : <> · primer corte cargado, sin período anterior para comparar</>}.
          </>
        }
      >
        <BotonDescarga
          href="/api/exportar/rankings"
          parametros={{ fecha, ranking }}
          texto="Descargar ranking"
          variante="primario"
          descripcion="Entregable 2, columnas oficiales."
        />
        <BotonDescarga
          href="/api/exportar/subactividades"
          parametros={{ fecha, ranking }}
          texto="Descargar desglose"
          descripcion="Entregable 3, por subactividad."
        />
      </EncabezadoPagina>

      {/* Cabecera de actividad (Amet): chips de los 6 rankings agrupados en obligatorios, recomendado
          y bonus (Sección 5) y, al lado, el selector del período de corte. */}
      <RankingsPage
        grupos={gruposChips}
        selector={selectorPeriodo}
        incluye={nombresSub.map((s) => nombreSubactividad(s))}
      />

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

      {avisos.length > 0 && (
        <div className="mb-6">
          <MensajeError titulo="Algunos filtros de la dirección no son válidos" mensaje={avisos.join(" ")} />
        </div>
      )}

      {/* Conmutador de vista (pestañas de Amet): tabla + gráfico de esta aplicación o tarjetas por banco. */}
      <PestanasVista pestanas={pestanas} />

      {/* Ficha del banco elegido (vista de tabla; en la de tarjetas la reemplaza BancoDetalle) */}
      {filaBanco && !conTarjetas && (
        <section aria-labelledby="titulo-ficha" className="mb-8">
          <h2 id="titulo-ficha" className="mb-3">
            {nombreBanco(filaBanco.codigo_banco, filaBanco.banco)} en {info.nombre}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TarjetaIndicador
              titulo="Posición"
              valor={`${filaBanco.posicion} de ${filas.length}`}
              movimiento={{ valor: movBanco ? movBanco.cambio_posicion : null, significativo: Boolean(movBanco?.significativo) }}
              detalle={
                movBanco
                  ? `Antes: posición ${movBanco.posicion_anterior} en ${textoAnterior}.${movBanco.motivo ? ` ${movBanco.motivo}.` : ""}`
                  : undefined
              }
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
              detalle={`Saldo de la actividad ÷ cartera local válida del banco (${formatearMonto(filaBanco.total_cartera_local_valida)}) × 100.`}
            />
            <TarjetaIndicador
              titulo="Operaciones válidas"
              valor={formatearEntero(filaBanco.operaciones_validas)}
              unidad="préstamos"
              detalle="Préstamos del universo local válido que suman el saldo."
              enlace={
                esAnalista
                  ? { href: urlRankings({ periodo: fecha, ranking, banco, subactividad }, "/rankings/detalle"), texto: "Ver los préstamos" }
                  : undefined
              }
            />
          </div>
          <p className="mt-2 text-sm">
            <Link href={urlRankings(base)} scroll={false}>
              Quitar la selección del banco
            </Link>
          </p>
        </section>
      )}

      {conTarjetas ? (
        /* Vista de tarjetas (Amet): una tarjeta por banco con la composición de su saldo. */
        <section aria-labelledby="titulo-tarjetas" className="mb-10">
          <h2 id="titulo-tarjetas" className="mb-3">Tarjetas de los 12 bancos · {formatearFecha(fecha)}</h2>
          <TarjetasBancos tarjetas={tarjetas} detalle={detalleTarjeta} />
        </section>
      ) : (
        /* Gráfico + tabla ordenable de los 12 bancos */
        <section aria-labelledby="titulo-posiciones" className="mb-10">
          <h2 id="titulo-posiciones" className="mb-3">Posiciones de los 12 bancos</h2>
          {/* La tabla va a todo el ancho (tiene la cifra oficial y 11 columnas); el gráfico, debajo. */}
          <TablaOrdenable
            titulo={`Ranking ${info.nombre} · ${formatearFecha(fecha)}`}
            columnas={columnasRanking}
            filas={filasTabla}
            claveFila="Codigo_Banco"
            ordenInicial={{ clave: "Posicion", direccion: "asc" }}
            filaResaltada={banco || undefined}
            filaTotal={{ Banco: "Total de los 12 bancos", Saldo_Actividad: totales.total.saldo, Operaciones_Validas: totales.total.operaciones }}
            compacta
          />
          <p className="mb-4 mt-2 text-xs text-texto-tenue">
            Movimiento = posición anterior − posición actual (positivo sube, negativo baja). Pulse un encabezado para ordenar.
          </p>
          <GraficoRanking
            titulo={`Saldo de ${info.nombre} por banco · ${formatearFecha(fecha)}`}
            descripcion="Barras en orden de posición. La cifra exacta está en la tabla."
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
        </section>
      )}

      {/* Desglose por subactividad */}
      <section aria-labelledby="titulo-desglose" className="mb-10">
        <h2 id="titulo-desglose" className="mb-1">Desglose por subactividad</h2>
        <p className="mb-3 max-w-3xl text-sm text-texto-suave">
          {subactividad
            ? `Saldo de ${nombreSubactividad(subactividad)} por banco. `
            : `Las ${nombresSub.length} subactividades de ${info.nombre}. `}
          La columna «Reconciliación 1» confirma que la suma de las subactividades es igual al saldo de la actividad.
        </p>

        {sb21 && (
          <div className="tarjeta mb-4 border-primario bg-primario-suave text-sm" role="note">
            <p className="font-semibold">Regla SB21 aplicada en Tarjeta</p>
            <p className="mt-1">
              Los préstamos con actividad CINU de Crédito personal y facilidad crediticia <span className="font-mono">07</span>{" "}
              (tarjeta de crédito, tabla SB21) se cuentan en <strong>Tarjeta</strong> y se restan de{" "}
              <strong>Crédito personal</strong>, para que ninguna operación se cuente dos veces. En {formatearFecha(fecha)} se
              reclasificaron <strong>{formatearEntero(sb21.total.operaciones)}</strong> préstamos por{" "}
              <strong className="cifra">{formatearMonto(sb21.total.saldo)}</strong>
              {filaBanco && (
                <>
                  {" "}({formatearEntero(sb21PorBanco.get(banco)?.operaciones ?? 0)} préstamos y{" "}
                  {formatearMonto(sb21PorBanco.get(banco)?.saldo ?? "0")} de {filaBanco.banco})
                </>
              )}
              . La regla solo mueve saldo entre subactividades: el saldo total de Consumo de cada banco no cambia.
            </p>
          </div>
        )}

        <div className="grid gap-6">
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
          {/* En la vista de tarjetas la composición ya se ve en cada tarjeta: no se repite el gráfico apilado. */}
          {!conTarjetas && (
            <Grafico
              titulo={`Composición de ${info.nombre} por subactividad · ${formatearFecha(fecha)}`}
              descripcion="Barras apiladas: cada color es una subactividad. Pulse la leyenda para ocultar o mostrar una."
              opcion={opcionApilada}
              altura={Math.max(340, filas.length * 34 + 60)}
              formatoValor="monto"
            />
          )}
        </div>
      </section>

      {/* Detalle que sustenta la cifra (Analista y Administrador) */}
      <section aria-labelledby="titulo-detalle" className="tarjeta mb-6">
        <h2 id="titulo-detalle">Préstamos que sustentan la cifra</h2>
        {esAnalista ? (
          <>
            <p className="mt-1 max-w-3xl text-sm text-texto-suave">
              Lista paginada de los préstamos del universo local válido que suman el saldo
              {banco ? ` de ${filaBanco?.banco}` : " de los 12 bancos"}
              {subactividad ? ` en ${nombreSubactividad(subactividad)}` : ` en ${info.nombre}`}. Incluye la comprobación de que la
              suma cuadra con el ranking. No muestra datos personales del cliente.
            </p>
            <Link href={urlRankings({ periodo: fecha, ranking, banco, subactividad }, "/rankings/detalle")} className="boton mt-3">
              Ver el detalle de préstamos
            </Link>
          </>
        ) : (
          <p className="mt-1 max-w-3xl text-sm text-texto-suave">
            El detalle préstamo por préstamo está disponible para los perfiles Analista y Administrador.{" "}
            <Link href={`/perfil?volver=${encodeURIComponent(urlRankings({ ...base, banco }))}`}>
              Cambiar de perfil
            </Link>
          </p>
        )}
      </section>

      <NotaFuente fecha={fecha} anterior={anterior} />
    </>
  );
}
