// Indicadores (/indicadores) — análisis adicionales sobre el universo local válido:
// morosidad, escalera de vencimientos, tasa ponderada y concentración.
// No sustituyen a los seis rankings del reto. Todo se calcula en SQL (db/03_indicadores.sql).
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import Filtros from "@/components/Filtros";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil } from "@/lib/auth";
import { formatearEntero, formatearFecha, formatearMonto, formatearPorcentaje, nombreRanking, ORDEN_RANKINGS } from "@/lib/formato";
import {
  bancosDisponibles, carteraPorBanco, concentracionPorBanco, concentracionPorRanking, escaleraVencimientos,
  evolucionIndicadores, indicadorCartera, matrizBancoActividad, participacionEnRanking, periodosDisponibles,
  vencimientosPorBanco,
} from "@/lib/consultas-indicadores";
import {
  BarrasApiladasVencimientos, BarrasMorosidad, EscaleraTramos, LineaMorosidad, MapaArbol, MapaCalor,
} from "./GraficosIndicadores";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Indicadores" };

function Nota({ children }) {
  return <p className="mt-1 text-sm text-texto-suave"><strong>Cómo se calcula:</strong> {children}</p>;
}

function Seccion({ id, titulo, nota, children }) {
  return (
    <section aria-labelledby={id} className="mt-10 space-y-4">
      <div>
        <h2 id={id}>{titulo}</h2>
        {nota && <Nota>{nota}</Nota>}
      </div>
      {children}
    </section>
  );
}

export default async function PaginaIndicadores({ searchParams }) {
  await exigirPerfil("publico");
  const parametros = await searchParams;

  const encabezado = (
    <EncabezadoPagina
      titulo="Indicadores complementarios"
      descripcion="Morosidad, vencimientos, tasa de interés y concentración del crédito. No sustituyen a los seis rankings del reto."
    />
  );

  let datos;
  try {
    datos = await cargarDatos(parametros);
  } catch (error) {
    return (
      <>
        {encabezado}
        <MensajeError titulo="No se pudieron calcular los indicadores" mensaje="Revise la conexión con la base de datos e intente de nuevo." detalle={String(error?.message ?? error)} />
      </>
    );
  }
  if (!datos) {
    return (
      <>
        {encabezado}
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={{ href: "/admin", texto: "Ir a la carga de cortes" }}>
          Los indicadores se calculan cuando se carga al menos un corte AT03.
        </EstadoVacio>
      </>
    );
  }

  const {
    fecha, banco, ranking, periodos, bancos, cartera, porBanco, evolucion, tramos, apiladas,
    concRanking, partRanking, concBanco, matriz,
  } = datos;
  const nombreBancoElegido = bancos.find((b) => b.codigo_banco === banco)?.nombre;
  const alcance = [nombreBancoElegido ?? "todo el sistema", ranking ? nombreRanking(ranking) : null].filter(Boolean).join(" · ");
  const rankingsEnMatriz = ORDEN_RANKINGS.filter((r) => matriz.some((m) => m.ranking === r));
  const nombresBancos = [...new Set(matriz.map((m) => m.banco))];

  return (
    <>
      {encabezado}
      <Filtros
        campos={[
          { nombre: "periodo", etiqueta: "Período", predeterminado: fecha, opciones: periodos.map((p) => ({ valor: p, texto: formatearFecha(p, "mes") })) },
          { nombre: "banco", etiqueta: "Banco", textoTodos: "Todos los bancos", opciones: bancos.map((b) => ({ valor: b.codigo_banco, texto: `${b.codigo_banco} · ${b.nombre}` })) },
          { nombre: "ranking", etiqueta: "Ranking", textoTodos: "Todos los rankings", opciones: ORDEN_RANKINGS.map((r) => ({ valor: r, texto: nombreRanking(r) })) },
        ]}
      />
      <p className="mt-3 text-sm text-texto-suave">
        Cartera analizada: <strong>{alcance}</strong>, corte de {formatearFecha(fecha, "mes")}. Universo local válido (después de las exclusiones E1 a E4).
      </p>

      {!cartera ? (
        <div className="mt-6">
          <EstadoVacio titulo="Sin cartera para esta combinación">
            {nombreBancoElegido ?? "El banco"} no tiene saldo en {ranking ? nombreRanking(ranking) : "este período"} en el corte elegido.
          </EstadoVacio>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TarjetaIndicador titulo="Saldo de la cartera" valor={formatearMonto(cartera.saldo)} detalle={`${formatearEntero(cartera.operaciones)} operaciones válidas`} />
            <TarjetaIndicador titulo="Morosidad" valor={formatearPorcentaje(cartera.morosidad_pct)} detalle={`Saldo vencido: ${formatearMonto(cartera.vencido)}`} />
            <TarjetaIndicador titulo="Mora mayor a 90 días" valor={formatearPorcentaje(cartera.mora_90_pct)} detalle={`Saldo: ${formatearMonto(cartera.saldo_mora_90)}`} />
            <TarjetaIndicador titulo="Tasa promedio ponderada" valor={formatearPorcentaje(cartera.tasa_ponderada)} detalle="Anual, ponderada por saldo" />
          </div>
          <Nota>
            morosidad = saldo vencido (suma de los 7 tramos Monto_Vencido_*) ÷ saldo. Mora mayor a 90 días = saldo de los préstamos con Dias_Mora mayor a 90 ÷ saldo.
            Tasa ponderada = Σ(Tasa_Interes × Saldo) ÷ Σ Saldo. Todo con decimales exactos.
          </Nota>
          <p className="mt-2 text-sm text-texto-suave">
            Comprobación del diccionario: saldo por vencer {formatearMonto(cartera.por_vencer)} + saldo vencido {formatearMonto(cartera.vencido)} = saldo {formatearMonto(cartera.saldo)}.{" "}
            Préstamos donde la suma de los 16 tramos no es igual al Saldo: <strong>{formatearEntero(cartera.filas_descuadradas)}</strong>.
          </p>
        </>
      )}

      <Seccion
        id="morosidad"
        titulo={`Morosidad por banco${ranking ? ` en ${nombreRanking(ranking)}` : ""}`}
        nota="para cada banco, saldo vencido ÷ saldo de su cartera local válida (o de la actividad elegida) en el corte."
      >
        <BarrasMorosidad filas={porBanco} bancoElegido={banco} />
        <TablaOrdenable
          titulo={`Morosidad y tasa por banco · ${formatearFecha(fecha, "mes")}`}
          columnas={[
            { clave: "banco", titulo: "Banco" },
            { clave: "saldo", titulo: "Saldo", tipo: "monto" },
            { clave: "vencido", titulo: "Saldo vencido", tipo: "monto" },
            { clave: "morosidad_pct", titulo: "Morosidad", tipo: "porcentaje" },
            { clave: "mora_90_pct", titulo: "Mora > 90 días", tipo: "porcentaje" },
            { clave: "tasa_ponderada", titulo: "Tasa ponderada", tipo: "porcentaje" },
          ]}
          filas={porBanco}
          claveFila="codigo_banco"
          ordenInicial={{ clave: "morosidad_pct", direccion: "desc" }}
          filaResaltada={banco}
          compacta
        />
        <LineaMorosidad puntos={evolucion.map((e) => ({ etiqueta: formatearFecha(e.fecha, "mes"), morosidad_pct: e.morosidad_pct }))} />
        <TablaOrdenable
          titulo={`Evolución por período · ${alcance}`}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha" },
            { clave: "saldo", titulo: "Saldo", tipo: "monto" },
            { clave: "vencido", titulo: "Saldo vencido", tipo: "monto" },
            { clave: "morosidad_pct", titulo: "Morosidad", tipo: "porcentaje" },
            { clave: "tasa_ponderada", titulo: "Tasa ponderada", tipo: "porcentaje" },
          ]}
          filas={evolucion}
          claveFila="fecha"
          ordenInicial={{ clave: "fecha", direccion: "asc" }}
          compacta
        />
      </Seccion>

      <Seccion
        id="vencimientos"
        titulo="Escalera de vencimientos"
        nota="se suma, en cada uno de los 16 tramos del AT03, el capital de los préstamos válidos: 9 tramos de Monto_por_Vencer_* (plazo restante) y 7 de Monto_Vencido_* (días de atraso). El porcentaje es el tramo ÷ saldo."
      >
        {cartera ? (
          <>
            <EscaleraTramos tramos={tramos} />
            <TablaOrdenable
              titulo={`Saldo por tramo · ${alcance}`}
              columnas={[
                { clave: "tipo", titulo: "Tipo", ordenable: false },
                { clave: "etiqueta", titulo: "Tramo", ordenable: false },
                { clave: "monto", titulo: "Monto", tipo: "monto", ordenable: false },
                { clave: "pct_saldo", titulo: "% del saldo", tipo: "porcentaje", ordenable: false },
              ]}
              filas={tramos}
              claveFila="clave"
              compacta
            />
          </>
        ) : null}
        <BarrasApiladasVencimientos filas={apiladas} />
        <p className="text-sm text-texto-suave">
          Bloques: por vencer hasta 1 año (tramos de 30 días a 1 año), de 1 a 5 años, a más de 5 años (5 a 10 y más de 10), vencido hasta 90 días y vencido a más de 90 días.
        </p>
      </Seccion>

      <Seccion
        id="concentracion"
        titulo="Concentración del mercado por ranking"
        nota="participación de cada banco = su saldo en la actividad ÷ saldo de los 12 bancos en esa actividad. HHI (índice de Herfindahl-Hirschman) = suma de las participaciones al cuadrado en %, de 0 a 10,000; con 12 bancos el mínimo es 833. Menos de 1,500 = baja, de 1,500 a 2,500 = moderada, más de 2,500 = alta. Top 3 = participación conjunta de los tres mayores."
      >
        <TablaOrdenable
          titulo={`HHI y participación de los 3 mayores · ${formatearFecha(fecha, "mes")}`}
          columnas={[
            { clave: "ranking", titulo: "Ranking", tipo: "ranking" },
            { clave: "lider", titulo: "Líder" },
            { clave: "saldo_total", titulo: "Saldo de la actividad", tipo: "monto" },
            { clave: "hhi", titulo: "HHI", tipo: "monto" },
            { clave: "top3_pct", titulo: "Top 3", tipo: "porcentaje" },
            { clave: "nivel_concentracion", titulo: "Concentración" },
          ]}
          filas={concRanking}
          claveFila="ranking"
          filaResaltada={ranking}
          ordenInicial={{ clave: "hhi", direccion: "desc" }}
          compacta
        />
        {partRanking && (
          <TablaOrdenable
            titulo={`Participación de cada banco en ${nombreRanking(ranking)}`}
            columnas={[
              { clave: "posicion", titulo: "Posición", tipo: "entero" },
              { clave: "banco", titulo: "Banco" },
              { clave: "saldo", titulo: "Saldo", tipo: "monto" },
              { clave: "participacion_pct", titulo: "Participación", tipo: "porcentaje" },
            ]}
            filas={partRanking}
            claveFila="codigo_banco"
            ordenInicial={{ clave: "posicion", direccion: "asc" }}
            filaResaltada={banco}
            compacta
          />
        )}
      </Seccion>

      <Seccion
        id="concentracion-banco"
        titulo="Concentración de la cartera de cada banco"
        nota="para cada banco, HHI propio = suma de los pesos de sus 6 macroactividades al cuadrado (en %). El mínimo posible con 6 actividades es 1,667; 10,000 significaría todo el crédito en una sola actividad. El peso es el saldo de la actividad ÷ cartera local válida del banco (la ponderación de los rankings)."
      >
        <TablaOrdenable
          titulo={`Concentración por actividad de cada banco · ${formatearFecha(fecha, "mes")}`}
          columnas={[
            { clave: "banco", titulo: "Banco" },
            { clave: "saldo_total", titulo: "Cartera local válida", tipo: "monto" },
            { clave: "hhi_cartera", titulo: "HHI de la cartera", tipo: "monto" },
            { clave: "macro_principal", titulo: "Actividad principal", tipo: "ranking" },
            { clave: "peso_macro_principal_pct", titulo: "Peso de la actividad principal", tipo: "porcentaje" },
          ]}
          filas={concBanco}
          claveFila="codigo_banco"
          ordenInicial={{ clave: "hhi_cartera", direccion: "desc" }}
          filaResaltada={banco}
          compacta
        />
        <MapaCalor celdas={matriz} rankings={rankingsEnMatriz} bancos={nombresBancos} />
        <MapaArbol filas={banco ? matriz.filter((m) => m.codigo_banco === banco) : matriz} bancoElegido={banco} />
      </Seccion>
    </>
  );
}

// Lee y valida los filtros de la URL y trae todos los datos de la pantalla.
async function cargarDatos(parametros) {
  const periodos = await periodosDisponibles();
  if (periodos.length === 0) return null;
  const bancos = await bancosDisponibles();
  // Un valor inválido en la URL se ignora (período más reciente, sin banco, sin ranking).
  const fecha = periodos.includes(parametros?.periodo) ? parametros.periodo : periodos[periodos.length - 1];
  const banco = bancos.some((b) => b.codigo_banco === parametros?.banco) ? parametros.banco : "";
  const ranking = ORDEN_RANKINGS.includes(parametros?.ranking) ? parametros.ranking : "";

  const [cartera, porBanco, evolucion, tramos, apiladas, concRanking, concBanco, matriz] = await Promise.all([
    indicadorCartera({ fecha, banco, ranking }),
    carteraPorBanco({ fecha, ranking }),
    evolucionIndicadores({ banco, ranking }),
    escaleraVencimientos({ fecha, banco, ranking }),
    vencimientosPorBanco({ fecha, ranking }),
    concentracionPorRanking({ fecha }),
    concentracionPorBanco({ fecha }),
    matrizBancoActividad({ fecha }),
  ]);
  const partRanking = ranking ? await participacionEnRanking({ fecha, ranking }) : null;
  return { fecha, banco, ranking, periodos, bancos, cartera, porBanco, evolucion, tramos, apiladas, concRanking, partRanking, concBanco, matriz };
}
