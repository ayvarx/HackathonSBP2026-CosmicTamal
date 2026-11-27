// Indicadores (/indicadores) — análisis adicionales sobre el universo local válido:
// saldo con mora, escalera de vencimientos, tasa ponderada y concentración.
// Todo se calcula en SQL (db/03_indicadores.sql).
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
import AlternarVista from "./AlternarVista";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Indicadores" };

function Nota({ children }) {
  return <p className="mt-1 text-sm text-texto-suave">{children}</p>;
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
      descripcion="Saldo con mora, vencimientos, tasa de interés y concentración del crédito."
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
        Cartera analizada: <strong>{alcance}</strong>, corte de {formatearFecha(fecha, "mes")}. Universo local válido.
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
            <TarjetaIndicador titulo="Saldo con mora (> 0 días)" valor={formatearPorcentaje(cartera.mora_pct)} detalle={`Saldo: ${formatearMonto(cartera.saldo_mora)}`} />
            <TarjetaIndicador titulo="Saldo con mora mayor a 90 días" valor={formatearPorcentaje(cartera.mora_90_pct)} detalle={`Saldo: ${formatearMonto(cartera.saldo_mora_90)}`} />
            <TarjetaIndicador titulo="Tasa promedio ponderada" valor={formatearPorcentaje(cartera.tasa_ponderada)} detalle="Anual, ponderada por saldo" />
          </div>
          <Nota>
            Ambos indicadores = saldo de los préstamos con días de mora (más de 0 o más de 90) ÷ saldo de la cartera.
          </Nota>
        </>
      )}

      <Seccion
        id="morosidad"
        titulo={`Saldo con mora por banco${ranking ? ` en ${nombreRanking(ranking)}` : ""}`}
        nota="Saldo de los préstamos con días de mora ÷ saldo de la cartera local válida del banco."
      >
        <AlternarVista
          grafico={<BarrasMorosidad filas={porBanco} bancoElegido={banco} />}
          tabla={
            <TablaOrdenable
              titulo={`Saldo con mora y tasa por banco · ${formatearFecha(fecha, "mes")}`}
              columnas={[
                { clave: "banco", titulo: "Banco" },
                { clave: "saldo", titulo: "Saldo", tipo: "monto" },
                { clave: "saldo_mora", titulo: "Saldo con mora (> 0 días)", tipo: "monto" },
                { clave: "mora_pct", titulo: "% con mora (> 0 días)", tipo: "porcentaje" },
                { clave: "mora_90_pct", titulo: "% con mora > 90 días", tipo: "porcentaje" },
                { clave: "tasa_ponderada", titulo: "Tasa ponderada", tipo: "porcentaje" },
              ]}
              filas={porBanco}
              claveFila="codigo_banco"
              ordenInicial={{ clave: "mora_pct", direccion: "desc" }}
              filaResaltada={banco}
              compacta
            />
          }
        />
        <AlternarVista
          grafico={<LineaMorosidad puntos={evolucion.map((e) => ({ etiqueta: formatearFecha(e.fecha, "mes"), mora_pct: e.mora_pct, mora_90_pct: e.mora_90_pct }))} />}
          tabla={
            <TablaOrdenable
              titulo={`Evolución por período · ${alcance}`}
              columnas={[
                { clave: "fecha", titulo: "Período", tipo: "fecha" },
                { clave: "saldo", titulo: "Saldo", tipo: "monto" },
                { clave: "saldo_mora", titulo: "Saldo con mora (> 0 días)", tipo: "monto" },
                { clave: "mora_pct", titulo: "% con mora (> 0 días)", tipo: "porcentaje" },
                { clave: "mora_90_pct", titulo: "% con mora > 90 días", tipo: "porcentaje" },
                { clave: "tasa_ponderada", titulo: "Tasa ponderada", tipo: "porcentaje" },
              ]}
              filas={evolucion}
              claveFila="fecha"
              ordenInicial={{ clave: "fecha", direccion: "asc" }}
              compacta
            />
          }
        />
      </Seccion>

      <Seccion
        id="vencimientos"
        titulo="Escalera de vencimientos"
        nota="Capital por tramo de plazo restante (por vencer) y de días de atraso (vencido)."
      >
        {cartera ? (
          <>
            <AlternarVista
              grafico={<EscaleraTramos tramos={tramos} />}
              tabla={
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
              }
            />
            <p className="text-sm text-texto-suave">
              Monto por vencer {formatearMonto(cartera.por_vencer)} + monto vencido {formatearMonto(cartera.vencido)} = saldo {formatearMonto(cartera.saldo)}.{" "}
              Préstamos con tramos descuadrados: <strong>{formatearEntero(cartera.filas_descuadradas)}</strong>.
            </p>
          </>
        ) : null}
        <AlternarVista
          grafico={<BarrasApiladasVencimientos filas={apiladas} />}
          tabla={
            <TablaOrdenable
              titulo={`Perfil de vencimiento por banco (% de su saldo) · ${formatearFecha(fecha, "mes")}`}
              columnas={[
                { clave: "banco", titulo: "Banco" },
                { clave: "hasta_1a", titulo: "Por vencer hasta 1 año", tipo: "porcentaje" },
                { clave: "de_1_a_5a", titulo: "Por vencer de 1 a 5 años", tipo: "porcentaje" },
                { clave: "mas_5a", titulo: "Por vencer a más de 5 años", tipo: "porcentaje" },
                { clave: "vencido_hasta_90", titulo: "Vencido hasta 90 días", tipo: "porcentaje" },
                { clave: "vencido_mas_90", titulo: "Vencido a más de 90 días", tipo: "porcentaje" },
              ]}
              filas={apiladas}
              claveFila="codigo_banco"
              filaResaltada={banco}
              compacta
            />
          }
        />
        <p className="text-sm text-texto-suave">
          Bloques: por vencer hasta 1 año (tramos de 30 días a 1 año), de 1 a 5 años, a más de 5 años (5 a 10 y más de 10), vencido hasta 90 días y vencido a más de 90 días.
        </p>
      </Seccion>

      <Seccion
        id="concentracion"
        titulo="Concentración del mercado por ranking"
        nota="HHI = suma de las participaciones al cuadrado (en %): menos de 1,500 baja, 1,500 a 2,500 moderada, más de 2,500 alta."
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
        nota="HHI de la cartera = suma de los pesos de sus 6 actividades al cuadrado (en %); 10,000 es todo en una sola actividad."
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
