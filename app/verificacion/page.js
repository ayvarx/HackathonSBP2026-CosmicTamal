// Verificación (/verificacion) — los seis puntos que revisa el jurado, juntos y para un período.
// Pública. Cada sección tiene ancla (#p1 ... #p6) para llegar al dato en pocos segundos.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import Filtros from "@/components/Filtros";
import TablaOrdenable from "@/components/TablaOrdenable";
import BotonDescarga from "@/components/BotonDescarga";
import EmbudoCascada from "../calidad/EmbudoCascada";
import { exigirPerfil } from "@/lib/auth";
import { calidad, periodos, RANKINGS, rankings, reconciliaciones } from "@/lib/consultas";
import { elegirPeriodo, reclasificacionSb21, totalesPorSubactividad } from "@/lib/consultas-calidad";
import { CARACTER_RANKING, formatearEntero, formatearFecha, formatearMonto, nombreRanking, nombreSubactividad } from "@/lib/formato";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Verificación" };

const PUNTOS = [
  ["p1", "1. Calidad"],
  ["p2", "2. Rankings obligatorios"],
  ["p3", "3. Comercio y Consumo"],
  ["p4", "4. Cartera y ponderación"],
  ["p5", "5. Subactividades y SB21"],
  ["p6", "6. Períodos y reconciliaciones"],
];

// Tabla de un ranking: posición, banco, saldo, ponderación y operaciones.
function TablaRanking({ clave, filas }) {
  return (
    <div>
      <h3 className="mb-1">
        {nombreRanking(clave)} <span className="text-sm font-normal text-texto-suave">({CARACTER_RANKING[clave]})</span>
      </h3>
      <TablaOrdenable
        titulo={`Ranking ${nombreRanking(clave)}`}
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

export default async function PaginaVerificacion({ searchParams }) {
  await exigirPerfil("publico");
  const sp = await searchParams;
  const pedido = (Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo) || "";

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
  const detalleRec = recActual.detalle.map((x, i) => ({ ...x, clave: `${x.reconciliacion}-${x.ranking}-${x.codigo_banco}-${i}` }));
  const resumenSub = subs.map((s) => ({ ...s, clave: `${s.ranking}-${s.subactividad}` }));

  return (
    <>
      <EncabezadoPagina
        titulo="Verificación y reconciliaciones"
        descripcion={`Los seis puntos de control del reto, juntos, para ${formatearFecha(fecha)}. Cada cifra sale del motor SQL y se puede contrastar con las exportaciones.`}
      >
        <BotonDescarga href="/api/exportar/rankings" parametros={{ periodo: fecha }} texto="Rankings del período" />
      </EncabezadoPagina>

      <Filtros
        campos={[{ nombre: "periodo", etiqueta: "Período", predeterminado: fecha, opciones: lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) })) }]}
        conLimpiar={false}
      />

      <nav aria-label="Puntos de verificación" className="mt-4 flex flex-wrap gap-2">
        {PUNTOS.map(([id, texto]) => (
          <a key={id} href={`#${id}`} className="boton boton-secundario">{texto}</a>
        ))}
      </nav>

      <section id="p1" className="mt-8 scroll-mt-24" aria-labelledby="h-p1">
        <h2 id="h-p1">1. Reporte de calidad</h2>
        <p className="mb-3 text-texto-suave">Conteos E1–E4 y universo local válido de {formatearFecha(fecha)}. El detalle y las filas excluidas están en <a href={`/calidad?periodo=${fecha}`}>Calidad de datos</a>.</p>
        <EmbudoCascada q={q} />
      </section>

      <section id="p2" className="mt-8 scroll-mt-24" aria-labelledby="h-p2">
        <h2 id="h-p2">2. Rankings obligatorios</h2>
        <p className="mb-3 text-texto-suave">Hipotecario, Construcción, Industria y Agropecuario: posición y saldo de los 12 bancos.</p>
        <div className="grid gap-6 xl:grid-cols-2">
          {RANKINGS.filter((r) => r.tipo === "obligatorio").map((r) => <TablaRanking key={r.clave} clave={r.clave} filas={porRanking(r.clave)} />)}
        </div>
      </section>

      <section id="p3" className="mt-8 scroll-mt-24" aria-labelledby="h-p3">
        <h2 id="h-p3">3. Comercio y Consumo</h2>
        <p className="mb-3 text-texto-suave">Rankings recomendado (Comercio) y bonus (Consumo).</p>
        <div className="grid gap-6 xl:grid-cols-2">
          {RANKINGS.filter((r) => r.tipo !== "obligatorio").map((r) => <TablaRanking key={r.clave} clave={r.clave} filas={porRanking(r.clave)} />)}
        </div>
      </section>

      <section id="p4" className="mt-8 scroll-mt-24" aria-labelledby="h-p4">
        <h2 id="h-p4">4. Total de cartera local válida y ponderación</h2>
        <p className="mb-3 text-texto-suave">
          El denominador es el total de cartera local válida del banco con las 6 actividades, el mismo en todos los rankings.
          Ponderación = saldo de la actividad ÷ total de cartera del banco × 100, redondeada a 4 decimales.
        </p>
        <TablaOrdenable
          titulo="Total de cartera local válida y ponderación por ranking"
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
        <p className="mt-2 text-sm text-texto-suave">
          Por el redondeo, las 6 ponderaciones de un banco pueden diferir de 100.0000 en la cuarta cifra. Saldo del universo local válido: {formatearMonto(q.saldo_universo_local_valido)}.
        </p>
      </section>

      <section id="p5" className="mt-8 scroll-mt-24" aria-labelledby="h-p5">
        <h2 id="h-p5">5. Desglose por subactividad y reclasificación SB21</h2>
        <div className="tarjeta mb-4">
          <p>
            <strong>Regla SB21:</strong> un préstamo cuyo CINU es de &laquo;Crédito personal&raquo; pero con Facilidad Crediticia 07 (tarjeta de crédito) se reclasifica a &laquo;Tarjeta&raquo;, siempre dentro de Consumo.
          </p>
          <p className="mt-2">
            En {formatearFecha(fecha)} la regla movió <strong>{formatearMonto(sb21.saldo_movido)}</strong> de saldo y <strong>{formatearEntero(sb21.operaciones_movidas)}</strong> operaciones de Crédito personal a Tarjeta.
          </p>
          <p className="mt-1 text-sm text-texto-suave">
            Resultado: Tarjeta = {formatearMonto(sb21.tarjeta_saldo)} ({formatearEntero(sb21.tarjeta_operaciones)} operaciones); Crédito personal = {formatearMonto(sb21.credito_personal_saldo)} ({formatearEntero(sb21.credito_personal_operaciones)} operaciones).
          </p>
        </div>
        <TablaOrdenable
          titulo="Saldo y operaciones por subactividad (suma de los 12 bancos)"
          claveFila="clave"
          compacta
          altoMaximo="32rem"
          filas={resumenSub}
          columnas={[
            { clave: "ranking", titulo: "Ranking", tipo: "ranking", alinear: "izquierda" },
            { clave: "subactividad", titulo: "Subactividad", tipo: "subactividad", alinear: "izquierda" },
            { clave: "saldo", titulo: "Saldo", tipo: "monto" },
            { clave: "operaciones", titulo: "Operaciones", tipo: "entero" },
          ]}
        />
        <p className="mt-2 text-sm text-texto-suave">
          Por banco: descargue <a href={`/api/exportar/subactividades?periodo=${fecha}`}>el desglose completo</a> ({nombreSubactividad("Tarjeta")} incluida).
        </p>
      </section>

      <section id="p6" className="mt-8 scroll-mt-24" aria-labelledby="h-p6">
        <h2 id="h-p6">6. Períodos procesados y reconciliaciones</h2>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-texto-suave">
          {recActual.resumen.map((r) => (
            <li key={r.reconciliacion}><strong>Reconciliación {r.reconciliacion}:</strong> {r.descripcion}</li>
          ))}
        </ul>
        <TablaOrdenable
          titulo={`${lista.length} períodos procesados y estado de las reconciliaciones`}
          claveFila="fecha"
          filaResaltada={fecha}
          filas={filasPeriodos}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "filas_leidas", titulo: "Filas leídas", tipo: "entero" },
            { clave: "universo_local_valido", titulo: "Universo válido", tipo: "entero" },
            { clave: "rec1", titulo: "Reconciliación 1", tipo: "texto", alinear: "centro" },
            { clave: "rec2", titulo: "Reconciliación 2", tipo: "texto", alinear: "centro" },
            { clave: "rec3", titulo: "Reconciliación 3", tipo: "texto", alinear: "centro" },
          ]}
        />
        <p className="mt-2 text-sm text-texto-suave">&laquo;Cuadra&raquo; significa diferencia exacta de 0.00 (comparación en NUMERIC, sin decimales flotantes). Entre paréntesis: comprobaciones que cuadran / total.</p>
        <details className="mt-4">
          <summary className="cursor-pointer font-medium">Ver las comprobaciones de {formatearFecha(fecha)} una por una ({detalleRec.length})</summary>
          <div className="mt-3">
            <TablaOrdenable
              titulo={`Detalle de reconciliaciones de ${formatearFecha(fecha)}`}
              claveFila="clave"
              compacta
              altoMaximo="28rem"
              filas={detalleRec}
              columnas={[
                { clave: "reconciliacion", titulo: "Rec.", tipo: "entero" },
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

      <section className="mt-10" aria-labelledby="h-como">
        <h2 id="h-como">Cómo se calcula</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li><strong>E1, duplicados:</strong> dentro de cada período, si un número de préstamo se repite, se conserva la primera aparición y las demás se excluyen.</li>
          <li><strong>E2, destino extranjero:</strong> se excluye toda fila cuyo destino no sea L (local).</li>
          <li><strong>E3, saldo no positivo:</strong> se excluyen saldos iguales o menores que cero.</li>
          <li><strong>E4, actividad no catalogada:</strong> se excluye la fila cuyo Tipo_Actividad no está en el catálogo CINU/SB109. Lo que queda es el universo local válido.</li>
          <li><strong>Clasificación:</strong> el Tipo_Actividad (código CINU) decide la actividad económica y la subactividad, solo con los catálogos suministrados.</li>
          <li><strong>Regla SB21:</strong> Crédito personal con facilidad 07 pasa a Tarjeta, dentro de Consumo.</li>
          <li><strong>Ranking:</strong> por actividad, los 12 bancos se ordenan de mayor a menor saldo; la posición 1 es la de mayor saldo.</li>
          <li><strong>Ponderación:</strong> saldo de la actividad del banco ÷ total de su cartera local válida (las 6 actividades) × 100, a 4 decimales.</li>
          <li><strong>Reconciliaciones:</strong> 1) subactividades = actividad; 2) las 6 actividades = total de cartera del banco; 3) los 12 totales = saldo del universo. Todas al centavo.</li>
        </ol>
      </section>
    </>
  );
}
