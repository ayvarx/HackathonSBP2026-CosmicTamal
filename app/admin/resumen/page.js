// Qué cambió con este corte (/admin/resumen?periodo=AAAAMMDD) — Se abre sola al terminar una carga.
// Muestra la cascada E1–E4 del período, los cambios de líder y los movimientos significativos
// frente al período anterior, cada uno con una explicación automática (plantillas fijas sobre
// la descomposición de saldo que calcula el motor SQL), y el enlace al reporte descargable.
import Link from "next/link";
import { redirect } from "next/navigation";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import TablaOrdenable from "@/components/TablaOrdenable";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import { exigirPerfil } from "@/lib/auth";
import { FILTROS } from "@/lib/consultas";
import { cortesCargados, esPeriodo, periodoMasReciente, restarMontos, resumenCorte } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha, formatearMonto, formatearMontoCompacto, nombreRanking } from "@/lib/formato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qué cambió con este corte" };

// Parámetros de la URL que solo sirven para el aviso de "recién cargado".
const PARAMETROS_AVISO = ["cargado", "archivo", "segundos", "reemplazado"];

const COLUMNAS_MOVIMIENTOS = [
  { clave: "ranking", titulo: "Ranking", tipo: "ranking" },
  { clave: "banco", titulo: "Banco" },
  { clave: "posicion_anterior", titulo: "Posición anterior", tipo: "entero" },
  { clave: "posicion_actual", titulo: "Posición actual", tipo: "entero" },
  { clave: "cambio_posicion", titulo: "Cambio", tipo: "movimiento", ayuda: "Posición anterior − posición actual: positivo = sube" },
  { clave: "saldo_anterior", titulo: "Saldo anterior", tipo: "monto" },
  { clave: "saldo_actual", titulo: "Saldo actual", tipo: "monto" },
  { clave: "var_saldo", titulo: "Variación", tipo: "monto_signo" },
  { clave: "var_saldo_pct", titulo: "Variación %", tipo: "porcentaje", decimales: 4 },
  { clave: "motivo", titulo: "Por qué es significativo", ordenable: false },
];

/** Fila de la tabla de la cascada: valor anterior, actual y diferencia. */
function FilaCascada({ concepto, anterior, actual, destacada = false }) {
  const diferencia = anterior === undefined || anterior === null ? null : actual - anterior;
  return (
    <tr className={destacada ? "fila-resaltada" : undefined}>
      <th scope="row" className="text-left font-normal">{concepto}</th>
      {anterior !== undefined && <td className="num">{anterior === null ? "—" : formatearEntero(anterior)}</td>}
      <td className="num">{formatearEntero(actual)}</td>
      {anterior !== undefined && (
        <td className="num">{diferencia === null ? "—" : `${diferencia > 0 ? "+" : ""}${formatearEntero(diferencia)}`}</td>
      )}
    </tr>
  );
}

export default async function PaginaResumenCorte({ searchParams }) {
  await exigirPerfil("administrador");
  const parametros = await searchParams;

  const periodo = esPeriodo(parametros.periodo) ? parametros.periodo : await periodoMasReciente();
  if (!periodo) {
    return (
      <>
        <EncabezadoPagina titulo="Qué cambió con este corte" />
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={{ href: "/admin", texto: "Cargar un corte" }}>
          Cuando cargue un archivo AT03, aquí verá la cascada de exclusiones, los cambios de líder y los
          movimientos significativos frente al período anterior.
        </EstadoVacio>
      </>
    );
  }

  const resumen = await resumenCorte(periodo);
  if (!resumen) {
    return (
      <>
        <EncabezadoPagina titulo="Qué cambió con este corte" />
        <EstadoVacio titulo={`El período ${periodo} no está cargado`} accion={{ href: "/admin/resumen", texto: "Ver el período más reciente" }}>
          Revise el período elegido o cárguelo desde la pestaña Cortes.
        </EstadoVacio>
      </>
    );
  }

  // La URL siempre lleva el período y su anterior, así la franja superior muestra "anterior → actual".
  if (parametros.periodo !== periodo || (parametros.anterior || null) !== (resumen.anterior || null)) {
    const consulta = new URLSearchParams({ periodo });
    if (resumen.anterior) consulta.set("anterior", resumen.anterior);
    for (const clave of PARAMETROS_AVISO) if (parametros[clave]) consulta.set(clave, String(parametros[clave]));
    redirect(`/admin/resumen?${consulta}`);
  }

  const cortes = await cortesCargados();
  const { cascada: c, cascada_anterior: ca } = resumen;
  const conAnterior = Boolean(resumen.anterior);
  const filasTabla = resumen.significativos.map((m) => ({ ...m, clave: `${m.ranking}|${m.codigo_banco}` }));

  return (
    <>
      <EncabezadoPagina
        titulo={`Qué cambió con el corte de ${resumen.etiqueta}`}
        descripcion={
          conAnterior
            ? `${resumen.etiqueta} frente a ${resumen.etiqueta_anterior}.`
            : `${resumen.etiqueta} es el primer período cargado.`
        }
      >
        {conAnterior && (
          <BotonDescarga
            href="/api/exportar/movimientos"
            parametros={{ anterior: resumen.anterior, actual: periodo }}
            texto="Descargar reporte de movimientos"
            variante="primario"
            descripcion="Posiciones, variación de saldo, cambio de líder y marca de significativo."
          />
        )}
      </EncabezadoPagina>

      {parametros.cargado === "1" && (
        <div role="status" className="mb-6 rounded-tarjeta border border-exito-borde bg-exito-fondo px-5 py-4 text-sm">
          <p className="font-semibold">
            {parametros.reemplazado === "1" ? "Período reemplazado" : "Corte cargado"} correctamente
            {parametros.archivo ? <> desde «{parametros.archivo}»</> : null}.
          </p>
          <p className="mt-1">
            Se validó el archivo, se guardaron sus filas y los rankings, movimientos y reconciliaciones se recalcularon
            automáticamente{parametros.segundos ? ` en ${parametros.segundos} s` : ""}, sin editar código.
          </p>
        </div>
      )}

      <Filtros
        campos={[
          {
            nombre: "periodo",
            etiqueta: "Período a revisar",
            predeterminado: periodo,
            opciones: cortes.map((x) => ({ valor: x.fecha, texto: `${formatearFecha(x.fecha)} (${x.fecha})` })),
          },
        ]}
        reiniciar={["anterior", ...PARAMETROS_AVISO]}
        conLimpiar={false}
      />

      {/* Indicadores principales */}
      <section aria-label="Resumen del período" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaIndicador
          titulo="Filas leídas"
          valor={formatearEntero(c.filas_leidas)}
          detalle={`Excluidas en la cascada E1–E4: ${formatearEntero(c.filas_leidas - c.universo_local_valido)}`}
        />
        <TarjetaIndicador
          titulo="Universo local válido"
          valor={formatearEntero(c.universo_local_valido)}
          unidad="préstamos"
          detalle={ca ? `${resumen.etiqueta_anterior}: ${formatearEntero(ca.universo_local_valido)}` : "Préstamos que pasan los cuatro filtros."}
        />
        <TarjetaIndicador
          titulo="Saldo del universo válido"
          valor={formatearMontoCompacto(c.saldo_universo_local_valido)}
          movimiento={ca ? { valor: restarMontos(c.saldo_universo_local_valido, ca.saldo_universo_local_valido), tipo: "monto" } : undefined}
          detalle={`Exacto: ${formatearMonto(c.saldo_universo_local_valido)}`}
        />
        <TarjetaIndicador
          titulo="Movimientos significativos"
          valor={conAnterior ? formatearEntero(resumen.total_significativos) : "—"}
          unidad={conAnterior ? `de ${formatearEntero(resumen.total_movimientos)}` : undefined}
          detalle={conAnterior ? `Cambios de líder: ${resumen.cambios_lider.length}` : "Se calculan al cargar el siguiente período."}
          enlace={{ href: "/admin/parametros", texto: "Ajustar la regla" }}
        />
      </section>

      {/* Cascada E1–E4 */}
      <section aria-labelledby="titulo-cascada" className="mb-8">
        <h2 id="titulo-cascada" className="mb-1">Cascada de exclusiones E1–E4</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Cada fila excluida se cuenta una vez, en el primer filtro que incumple:{" "}
          filas leídas = E1 + E2 + E3 + E4 + universo local válido →{" "}
          <span className="font-semibold">{c.cuadre_cascada === "SI" ? "cuadra" : "NO cuadra"}</span>.
        </p>
        <div className="marco-tabla max-w-3xl">
          <table className="tabla-datos">
            <caption>Conteos de {resumen.etiqueta}{ca ? ` frente a ${resumen.etiqueta_anterior}` : ""}</caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                {ca && <th scope="col" className="num">{formatearFecha(resumen.anterior, "corta")}</th>}
                <th scope="col" className="num">{formatearFecha(periodo, "corta")}</th>
                {ca && <th scope="col" className="num">Diferencia</th>}
              </tr>
            </thead>
            <tbody>
              <FilaCascada concepto="Filas leídas" anterior={ca ? ca.filas_leidas : undefined} actual={c.filas_leidas} />
              {FILTROS.map((f, i) => {
                const campo = ["e1_duplicados", "e2_destino_extranjero", "e3_saldo_no_positivo", "e4_actividad_no_catalogada"][i];
                return <FilaCascada key={f.clave} concepto={`${f.clave} — ${f.nombre}`} anterior={ca ? ca[campo] : undefined} actual={c[campo]} />;
              })}
              <FilaCascada concepto="Universo local válido" anterior={ca ? ca.universo_local_valido : undefined} actual={c.universo_local_valido} destacada />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm">
          <Link href={`/calidad?periodo=${periodo}`}>Ver el reporte de calidad completo y las filas excluidas</Link>
        </p>
      </section>

      {!conAnterior ? (
        <EstadoVacio titulo="Sin período anterior para comparar">
          Cuando cargue el siguiente corte mensual, aquí aparecerán los movimientos de posición, los cambios de líder y
          su explicación.
        </EstadoVacio>
      ) : (
        <>
          {/* Cambios de líder */}
          <section aria-labelledby="titulo-lider" className="mb-8">
            <h2 id="titulo-lider" className="mb-3">Cambios de líder</h2>
            {resumen.cambios_lider.length === 0 ? (
              <p className="tarjeta text-sm">
                No hubo cambios de líder: los {resumen.significativos_por_ranking.length} rankings conservan al mismo banco en el primer lugar.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {resumen.cambios_lider.map((l) => (
                  <li key={l.ranking} className="tarjeta text-sm">
                    <p className="font-semibold">{l.nombre}</p>
                    <p className="mt-1">
                      <span className="movimiento movimiento-sube"><span aria-hidden="true">▲</span> Nuevo líder:</span>{" "}
                      {l.nuevo.banco} ({l.nuevo.codigo_banco}), saldo {formatearMonto(l.nuevo.saldo_actual)}.
                    </p>
                    {l.sale && (
                      <p className="mt-1">
                        <span className="movimiento movimiento-baja"><span aria-hidden="true">▼</span> Deja el primer lugar:</span>{" "}
                        {l.sale.banco} ({l.sale.codigo_banco}), ahora en el {l.sale.posicion_actual}.º lugar.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Explicación automática de los principales movimientos */}
          <section aria-labelledby="titulo-principales" className="mb-8">
            <h2 id="titulo-principales" className="mb-1">Principales movimientos explicados</h2>
            <p className="mb-3 text-sm text-texto-suave">
              {resumen.regla.texto}
            </p>
            {resumen.principales.length === 0 ? (
              <p className="tarjeta text-sm">Con la regla vigente no hay movimientos significativos entre estos dos períodos.</p>
            ) : (
              <ol className="space-y-3">
                {resumen.principales.map((m) => (
                  <li key={`${m.ranking}|${m.codigo_banco}`} className="tarjeta text-sm">
                    <p className="font-semibold">{m.explicacion.titular}</p>
                    <p className="mt-1">{m.explicacion.saldo}</p>
                    {m.explicacion.causa && <p className="mt-1 text-texto-suave">{m.explicacion.causa}</p>}
                    {m.explicacion.motivo && <p className="mt-1 text-xs text-texto-tenue">{m.explicacion.motivo}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Todos los movimientos significativos */}
          <section aria-labelledby="titulo-significativos" className="mb-8">
            <h2 id="titulo-significativos" className="mb-1">Todos los movimientos significativos</h2>
            <p className="mb-3 text-sm text-texto-suave">
              Por ranking:{" "}
              {resumen.significativos_por_ranking.map((r) => `${r.nombre} ${r.significativos}`).join(" · ")}.
            </p>
            <TablaOrdenable
              titulo={`Movimientos significativos de ${resumen.etiqueta_anterior} a ${resumen.etiqueta}`}
              columnas={COLUMNAS_MOVIMIENTOS}
              filas={filasTabla}
              claveFila="clave"
              mensajeVacio="Con la regla vigente no hay movimientos significativos."
              compacta
              altoMaximo="32rem"
            />

            {resumen.significativos.length > 0 && (
              <details className="tarjeta mt-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Ver la explicación de cada movimiento significativo ({formatearEntero(resumen.significativos.length)})
                </summary>
                {resumen.significativos_por_ranking
                  .filter((r) => r.significativos > 0)
                  .map((r) => (
                    <div key={r.ranking} className="mt-3">
                      <h3 className="mb-1">{nombreRanking(r.ranking)}</h3>
                      <ul className="list-disc space-y-1 pl-5">
                        {resumen.significativos
                          .filter((m) => m.ranking === r.ranking)
                          .map((m) => (
                            <li key={m.codigo_banco}>{m.explicacion.texto}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </details>
            )}
          </section>
        </>
      )}
    </>
  );
}
