// Qué cambió con este corte (/admin/resumen?periodo=AAAAMMDD) — Se abre sola al terminar una carga.
// Indicadores, cambios de líder y movimientos explicados; la cascada vive en /calidad y la
// tabla completa de movimientos en /comparar.
import Link from "next/link";
import { redirect } from "next/navigation";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import { exigirPerfil } from "@/lib/auth";
import { cortesCargados, esPeriodo, periodoMasReciente, restarMontos, resumenCorte } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha, nombreRanking, signoDecimal } from "@/lib/formato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qué cambió con este corte" };

// Parámetros de la URL que solo sirven para el aviso de "recién cargado".
const PARAMETROS_AVISO = ["cargado", "archivo", "segundos", "reemplazado"];

// Variación con flecha y cifra (▲ verde sube, ▼ rojo baja, = gris igual).
const flecha = (signo) => (signo > 0 ? "▲" : signo < 0 ? "▼" : "=");
const claseSigno = (signo) => (signo > 0 ? "movimiento-sube" : signo < 0 ? "movimiento-baja" : "movimiento-igual");
const millones = (valor, conSigno = false) => {
  const n = Number(valor) / 1e6;
  const texto = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n < 0 ? "-" : conSigno && n > 0 ? "+" : ""}${texto} M`;
};
function Variacion({ valor, tipo = "entero" }) {
  if (valor === null || valor === undefined) return null;
  const signo = signoDecimal(valor);
  const texto = tipo === "monto" ? millones(valor, true) : `${signo > 0 ? "+" : ""}${formatearEntero(valor)}`;
  return (
    <span className={`movimiento ${claseSigno(signo)} whitespace-nowrap`}>
      <span aria-hidden="true">{flecha(signo)}</span> {signo === 0 ? "" : texto}
    </span>
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
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={{ href: "/admin", texto: "Cargar un corte" }} />
      </>
    );
  }

  const resumen = await resumenCorte(periodo);
  if (!resumen) {
    return (
      <>
        <EncabezadoPagina titulo="Qué cambió con este corte" />
        <EstadoVacio titulo={`El período ${periodo} no está cargado`} accion={{ href: "/admin/resumen", texto: "Ver el período más reciente" }} />
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

  const tarjetas = [
    {
      titulo: "Filas leídas",
      href: `/calidad?periodo=${periodo}`,
      valor: formatearEntero(c.filas_leidas),
      variacion: ca ? <Variacion valor={Number(c.filas_leidas) - Number(ca.filas_leidas)} /> : null,
    },
    {
      titulo: "Universo válido",
      valor: formatearEntero(c.universo_local_valido),
      variacion: ca ? <Variacion valor={Number(c.universo_local_valido) - Number(ca.universo_local_valido)} /> : null,
    },
    {
      titulo: "Saldo válido",
      valor: millones(c.saldo_universo_local_valido),
      variacion: ca ? <Variacion valor={restarMontos(c.saldo_universo_local_valido, ca.saldo_universo_local_valido)} tipo="monto" /> : null,
    },
    {
      titulo: "Movimientos significativos",
      href: "/admin/parametros",
      valor: conAnterior ? `${formatearEntero(resumen.total_significativos)} de ${formatearEntero(resumen.total_movimientos)}` : "—",
      variacion: null,
    },
  ];

  return (
    <>
      <EncabezadoPagina titulo={`Qué cambió con el corte de ${resumen.etiqueta}`}>
        <div className="flex flex-wrap items-end justify-end gap-2 [&_form]:mb-0 [&_form]:border-0 [&_form]:bg-transparent [&_form]:p-0 [&_form]:shadow-none">
          <Filtros
            campos={[
              {
                nombre: "periodo",
                etiqueta: "Período",
                predeterminado: periodo,
                opciones: cortes.map((x) => ({ valor: x.fecha, texto: formatearFecha(x.fecha) })),
              },
            ]}
            reiniciar={["anterior", ...PARAMETROS_AVISO]}
            conLimpiar={false}
          />
          {conAnterior && (
            <BotonDescarga
              href="/api/exportar/movimientos"
              parametros={{ anterior: resumen.anterior, actual: periodo }}
              texto="Descargar movimientos"
              variante="primario"
            />
          )}
        </div>
      </EncabezadoPagina>

      {parametros.cargado === "1" && (
        <div role="status" className="mb-6 rounded-tarjeta border border-exito-borde bg-exito-fondo px-5 py-3 text-sm font-semibold">
          {parametros.reemplazado === "1" ? "Período reemplazado" : "Corte cargado"}
          {parametros.archivo ? <> · {parametros.archivo}</> : null}
          {parametros.segundos ? <> · {parametros.segundos} s</> : null}
        </div>
      )}

      <section aria-label="Resumen del período" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <article key={t.titulo} className="tarjeta flex h-full flex-col gap-1">
            <h2 className="text-sm font-semibold text-texto-suave">
              {t.href ? (
                <Link href={t.href} className="no-underline hover:underline">
                  {t.titulo} <span aria-hidden="true">→</span>
                </Link>
              ) : (
                t.titulo
              )}
            </h2>
            <p className="cifra text-2xl font-extrabold tracking-tight text-texto">{t.valor}</p>
            <p className="min-h-5 text-sm">{t.variacion}</p>
          </article>
        ))}
      </section>

      {!conAnterior ? (
        <EstadoVacio titulo="Sin período anterior para comparar" />
      ) : (
        <>
          <section aria-labelledby="titulo-lider" className="mb-8">
            <h2 id="titulo-lider" className="mb-3">Cambios de líder</h2>
            {resumen.cambios_lider.length === 0 ? (
              <p className="tarjeta text-sm">
                <span className="movimiento movimiento-igual"><span aria-hidden="true">=</span> 0</span>
              </p>
            ) : (
              <ul className="tarjeta divide-y divide-borde p-0">
                {resumen.cambios_lider.map((l) => (
                  <li key={l.ranking} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2 text-sm">
                    <span className="min-w-28 font-semibold">{l.nombre}</span>
                    <span className="movimiento movimiento-sube whitespace-nowrap">
                      <span aria-hidden="true">▲</span> {l.nuevo.banco}
                    </span>
                    {l.sale && (
                      <span className="movimiento movimiento-baja whitespace-nowrap">
                        <span aria-hidden="true">▼</span> {l.sale.banco}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {resumen.principales.length > 0 && (
            <section aria-labelledby="titulo-principales" className="mb-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="titulo-principales">Movimientos</h2>
                <Link href={`/comparar?anterior=${resumen.anterior}&periodo=${periodo}`} className="text-sm">
                  Ver los {formatearEntero(resumen.total_significativos)} en Comparar <span aria-hidden="true">→</span>
                </Link>
              </div>
              <ol className="tarjeta divide-y divide-borde p-0">
                {resumen.principales.map((m) => {
                  const sp = Number(m.cambio_posicion) || 0;
                  return (
                    <li
                      key={`${m.ranking}|${m.codigo_banco}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-sm"
                    >
                      <span className="whitespace-nowrap font-semibold">{m.banco}</span>
                      <span className="whitespace-nowrap text-texto-suave">{nombreRanking(m.ranking)}</span>
                      <span className="cifra whitespace-nowrap">
                        {m.posicion_anterior ?? "—"} → {m.posicion_actual ?? "—"}{" "}
                        <span className={`movimiento ${claseSigno(sp)}`}>
                          <span aria-hidden="true">{flecha(sp)}</span> {sp === 0 ? "" : Math.abs(sp)}
                        </span>
                      </span>
                      <span className="cifra ml-auto">
                        <Variacion valor={m.var_saldo} tipo="monto" />
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </>
      )}
    </>
  );
}
