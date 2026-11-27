// Detalle de préstamos (/rankings/detalle) — Solo Analista y Administrador.
//
// Muestra, préstamo por préstamo, de dónde sale una cifra del ranking: los préstamos del
// universo local válido de un banco y/o subactividad, y comprueba que su suma es
// EXACTAMENTE la cifra publicada (trazabilidad). Solo se muestran campos del préstamo,
// nunca nombres ni identificaciones del cliente.
//
// Filtros en la URL: ?periodo=AAAAMMDD&ranking=CLAVE&banco=101&subactividad=...&pagina=2
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import MensajeError from "@/components/MensajeError";
import Paginacion from "@/components/Paginacion";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil } from "@/lib/auth";
import { detallePrestamos, RANKINGS, rankings, subactividades } from "@/lib/consultas";
import { elegirPeriodo, fechasDisponibles, textoParametro, totalesRanking } from "@/lib/consultas-rankings";
import { compararDecimales, formatearEntero, formatearFecha, formatearMonto, nombreBanco, nombreSubactividad } from "@/lib/formato";
import NotaFuente from "../NotaFuente";
import { urlRankings } from "../urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle de préstamos" };

const POR_PAGINA = 50;

/** "20260929" → "2026-09-29": legible, sin ambigüedad día/mes y se ordena bien como texto. */
function fechaIso(aaaammdd) {
  return /^\d{8}$/.test(aaaammdd ?? "") ? `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6)}` : aaaammdd;
}

export default async function PaginaDetalle({ searchParams }) {
  // El detalle es un permiso de Analista (ver_detalle): se verifica en el servidor.
  await exigirPerfil("analista");
  const parametros = await searchParams;
  const pedido = {
    periodo: textoParametro(parametros.periodo),
    ranking: textoParametro(parametros.ranking).toUpperCase(),
    banco: textoParametro(parametros.banco),
    subactividad: textoParametro(parametros.subactividad),
    pagina: Math.max(1, Number.parseInt(textoParametro(parametros.pagina), 10) || 1),
  };

  const encabezado = (descripcion, volver) => (
    <EncabezadoPagina titulo="Préstamos que sustentan la cifra" descripcion={descripcion}>
      {volver && (
        <Link href={volver} className="boton boton-secundario">
          ← Volver al ranking
        </Link>
      )}
    </EncabezadoPagina>
  );

  let datos;
  try {
    const fechas = await fechasDisponibles();
    const periodo = elegirPeriodo(pedido.periodo, fechas);
    if (periodo.fecha) {
      const info = RANKINGS.find((r) => r.clave === pedido.ranking) ?? RANKINGS[0];
      const [filasRanking, desglose] = await Promise.all([
        rankings({ fecha: periodo.fecha, ranking: info.clave }),
        subactividades({ fecha: periodo.fecha }),
      ]);
      // Banco y subactividad solo se aceptan si existen (así la consulta nunca recibe basura).
      const banco = filasRanking.some((f) => f.codigo_banco === pedido.banco) ? pedido.banco : "";
      const subsRanking = [...new Set(desglose.filter((d) => d.ranking === info.clave).map((d) => d.subactividad))];
      const subactividad = subsRanking.includes(pedido.subactividad) ? pedido.subactividad : "";
      const [detalle, totales] = await Promise.all([
        detallePrestamos({
          fecha: periodo.fecha,
          ranking: info.clave,
          banco: banco || undefined,
          subactividad: subactividad || undefined,
          pagina: pedido.pagina,
          tamano: POR_PAGINA,
        }),
        totalesRanking({ fecha: periodo.fecha, ranking: info.clave }),
      ]);
      datos = { fechas, periodo, info, filasRanking, desglose, banco, subactividad, detalle, totales };
    } else {
      datos = { fechas, periodo };
    }
  } catch (error) {
    return (
      <>
        {encabezado("Lista de préstamos del universo local válido que forman cada saldo del ranking.")}
        <MensajeError
          titulo="No se pudo leer el detalle de préstamos"
          mensaje="La base de datos no respondió. Vuelva a intentarlo en unos segundos."
          detalle={error?.message}
          accion={{ href: "/rankings", texto: "Volver a Rankings" }}
        />
      </>
    );
  }

  if (!datos.periodo.fecha) {
    return (
      <>
        {encabezado("Lista de préstamos del universo local válido que forman cada saldo del ranking.")}
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={{ href: "/rankings", texto: "Ir a Rankings" }}>
          Cuando se cargue un corte AT03 podrá revisar aquí los préstamos que forman cada cifra.
        </EstadoVacio>
      </>
    );
  }

  const { fechas, periodo, info, filasRanking, desglose, banco, subactividad, detalle, totales } = datos;
  const fecha = periodo.fecha;
  const ranking = info.clave;
  const nombrePorCodigo = new Map(filasRanking.map((f) => [f.codigo_banco, f.banco]));

  // Cifra publicada con la que debe cuadrar la suma de los préstamos, según los filtros.
  let esperado;
  if (banco && subactividad) {
    const d = desglose.find((x) => x.ranking === ranking && x.codigo_banco === banco && x.subactividad === subactividad);
    esperado = { saldo: d?.saldo ?? "0.00", operaciones: d?.operaciones ?? 0, texto: `saldo de ${nombreSubactividad(subactividad)} de ${nombrePorCodigo.get(banco)} en el desglose por subactividad` };
  } else if (banco) {
    const f = filasRanking.find((x) => x.codigo_banco === banco);
    esperado = { saldo: f.saldo_actividad, operaciones: f.operaciones_validas, texto: `Saldo_Actividad de ${f.banco} en el ranking ${info.nombre} (posición ${f.posicion})` };
  } else if (subactividad) {
    const s = totales.subactividades.find((x) => x.subactividad === subactividad);
    esperado = { saldo: s?.saldo ?? "0.00", operaciones: s?.operaciones ?? 0, texto: `saldo de ${nombreSubactividad(subactividad)} de los 12 bancos` };
  } else {
    esperado = { saldo: totales.total.saldo, operaciones: totales.total.operaciones, texto: `saldo total del ranking ${info.nombre} (12 bancos)` };
  }
  // Comparación exacta del texto decimal (sin punto flotante) y del número de préstamos.
  const cuadra = compararDecimales(detalle.saldo_total, esperado.saldo) === 0 && detalle.total_operaciones === esperado.operaciones;

  const totalPaginas = Math.max(1, Math.ceil(detalle.total_operaciones / POR_PAGINA));
  const filas = detalle.filas.map((p) => ({
    Numero_Prestamo: p.numero_prestamo,
    Banco: nombreBanco(p.codigo_banco, nombrePorCodigo.get(p.codigo_banco)),
    Subactividad: p.subactividad,
    Tipo_Actividad: p.tipo_actividad,
    Facilidad: p.facilidad_crediticia,
    Saldo: p.saldo,
    Tasa: p.tasa_interes,
    Dias_Mora: p.dias_mora,
    Inicio: fechaIso(p.fecha_inicial_prestamo),
    Vencimiento: fechaIso(p.fecha_vencimiento),
    Origen: `${p.archivo} · fila ${p.fila_archivo}`,
  }));
  const volver = urlRankings({ periodo: fecha, ranking, banco, subactividad });
  const alcance = [banco ? nombrePorCodigo.get(banco) : "12 bancos", subactividad ? nombreSubactividad(subactividad) : info.nombre].join(" · ");

  return (
    <>
      {encabezado(
        <>
          Préstamos del universo local válido de <strong>{alcance}</strong> en {formatearFecha(fecha)} (Fecha = {fecha}), del
          mayor al menor saldo. Solo campos del préstamo: no se muestran nombres ni identificaciones del cliente.
        </>,
        volver,
      )}

      <Filtros
        campos={[
          {
            nombre: "periodo",
            etiqueta: "Período",
            predeterminado: fecha,
            opciones: [...fechas].reverse().map((f) => ({ valor: f, texto: `${formatearFecha(f)} (${f})` })),
          },
          {
            nombre: "ranking",
            etiqueta: "Ranking",
            predeterminado: ranking,
            opciones: RANKINGS.map((r) => ({ valor: r.clave, texto: r.nombre })),
          },
          {
            nombre: "banco",
            etiqueta: "Banco",
            textoTodos: "Todos los bancos",
            opciones: [...filasRanking]
              .sort((a, b) => a.codigo_banco.localeCompare(b.codigo_banco))
              .map((f) => ({ valor: f.codigo_banco, texto: nombreBanco(f.codigo_banco, f.banco) })),
          },
          {
            nombre: "subactividad",
            etiqueta: "Subactividad",
            textoTodos: "Todas las subactividades",
            dependeDe: "ranking",
            predeterminado: "",
            opciones: [...new Map(desglose.map((d) => [`${d.ranking}|${d.subactividad}`, d])).values()].map((d) => ({
              valor: d.subactividad,
              texto: nombreSubactividad(d.subactividad),
              grupo: d.ranking,
            })),
          },
        ]}
      />

      {/* Cuadre: la suma de TODOS los préstamos filtrados (todas las páginas) contra la cifra publicada */}
      <section
        aria-labelledby="titulo-cuadre"
        className={`mb-6 rounded-tarjeta border px-5 py-4 ${cuadra ? "border-exito-borde bg-exito-fondo" : "border-error-borde bg-error-fondo"}`}
      >
        <h2 id="titulo-cuadre" className="text-base">
          <span aria-hidden="true">{cuadra ? "✓ " : "✗ "}</span>
          {cuadra ? "La suma cuadra al centavo con el ranking" : "La suma NO cuadra con el ranking"}
        </h2>
        <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">Suma de los préstamos listados</dt>
          <dd className="cifra">
            {formatearMonto(detalle.saldo_total)} en {formatearEntero(detalle.total_operaciones)} préstamos (todas las páginas)
          </dd>
          <dt className="font-semibold">Cifra publicada</dt>
          <dd className="cifra">
            {formatearMonto(esperado.saldo)} en {formatearEntero(esperado.operaciones)} préstamos: {esperado.texto}
          </dd>
        </dl>
      </section>

      <TablaOrdenable
        titulo={`Préstamos · ${alcance} · ${formatearFecha(fecha)} · página ${Math.min(pedido.pagina, totalPaginas)} de ${totalPaginas}`}
        columnas={[
          { clave: "Numero_Prestamo", titulo: "Número de préstamo", tipo: "codigo" },
          { clave: "Banco", titulo: "Banco" },
          { clave: "Subactividad", titulo: "Subactividad", tipo: "subactividad" },
          { clave: "Tipo_Actividad", titulo: "Actividad CINU", tipo: "codigo", ayuda: "Tipo_Actividad: llave contra el catálogo CINU/SB109" },
          { clave: "Facilidad", titulo: "Facilidad SB21", tipo: "codigo", ayuda: "Facilidad_Crediticia (07 = tarjeta de crédito)" },
          { clave: "Saldo", titulo: "Saldo", tipo: "monto" },
          { clave: "Tasa", titulo: "Tasa de interés", tipo: "porcentaje", decimales: 2 },
          { clave: "Dias_Mora", titulo: "Días de mora", tipo: "entero" },
          { clave: "Inicio", titulo: "Inicio", tipo: "codigo" },
          { clave: "Vencimiento", titulo: "Vencimiento", tipo: "codigo" },
          { clave: "Origen", titulo: "Archivo y fila", ayuda: "Línea física del archivo (el encabezado es la línea 1)" },
        ]}
        filas={filas}
        claveFila="Numero_Prestamo"
        mensajeVacio={
          detalle.total_operaciones > 0
            ? "Esa página no existe. Use la paginación para volver a una página con datos."
            : "No hay préstamos para estos filtros (el saldo publicado es 0.00)."
        }
        compacta
      />
      <Paginacion paginaActual={pedido.pagina} totalPaginas={totalPaginas} totalFilas={detalle.total_operaciones} porPagina={POR_PAGINA} />

      <NotaFuente fecha={fecha} anterior={null} />
    </>
  );
}
