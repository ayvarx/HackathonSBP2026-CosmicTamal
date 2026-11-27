// Qué cambió con este corte (/admin/resumen?periodo=AAAAMMDD) — Se abre sola al terminar una carga.
// Indicadores, cambios de líder y movimientos explicados; la cascada vive en /calidad y la
// tabla completa de movimientos en /comparar.
import Link from "next/link";
import { redirect } from "next/navigation";
import BotonDescarga from "@/components/BotonDescarga";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import Filtros from "@/components/Filtros";
import TarjetaIndicador from "@/components/TarjetaIndicador";
import { exigirPerfil } from "@/lib/auth";
import { cortesCargados, esPeriodo, periodoMasReciente, restarMontos, resumenCorte } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha, formatearMonto, formatearMontoCompacto } from "@/lib/formato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qué cambió con este corte" };

// Parámetros de la URL que solo sirven para el aviso de "recién cargado".
const PARAMETROS_AVISO = ["cargado", "archivo", "segundos", "reemplazado"];

export default async function PaginaResumenCorte({ searchParams }) {
  await exigirPerfil("administrador");
  const parametros = await searchParams;

  const periodo = esPeriodo(parametros.periodo) ? parametros.periodo : await periodoMasReciente();
  if (!periodo) {
    return (
      <>
        <EncabezadoPagina titulo="Qué cambió con este corte" />
        <EstadoVacio titulo="Aún no hay cortes cargados" accion={{ href: "/admin", texto: "Cargar un corte" }}>
          Cargue un corte para ver sus cambios.
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
            texto="Descargar movimientos"
            variante="primario"
          />
        )}
      </EncabezadoPagina>

      {parametros.cargado === "1" && (
        <div role="status" className="mb-6 rounded-tarjeta border border-exito-borde bg-exito-fondo px-5 py-4 text-sm">
          <p className="font-semibold">
            {parametros.reemplazado === "1" ? "Período reemplazado" : "Corte cargado"} correctamente
            {parametros.archivo ? <> desde «{parametros.archivo}»</> : null}.
          </p>
          {parametros.segundos && <p className="mt-1">Recalculado en {parametros.segundos} s.</p>}
        </div>
      )}

      <Filtros
        campos={[
          {
            nombre: "periodo",
            etiqueta: "Período a revisar",
            predeterminado: periodo,
            opciones: cortes.map((x) => ({ valor: x.fecha, texto: formatearFecha(x.fecha) })),
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
          detalle={`Excluidas: ${formatearEntero(c.filas_leidas - c.universo_local_valido)}`}
          enlace={{ href: `/calidad?periodo=${periodo}`, texto: "Ver calidad" }}
        />
        <TarjetaIndicador
          titulo="Universo local válido"
          valor={formatearEntero(c.universo_local_valido)}
          unidad="préstamos"
          detalle={ca ? `${resumen.etiqueta_anterior}: ${formatearEntero(ca.universo_local_valido)}` : undefined}
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
          detalle={conAnterior ? `Cambios de líder: ${resumen.cambios_lider.length}` : undefined}
          enlace={{ href: "/admin/parametros", texto: "Ajustar la regla" }}
        />
      </section>

      {!conAnterior ? (
        <EstadoVacio titulo="Sin período anterior para comparar">
          Los movimientos aparecerán al cargar el siguiente corte.
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
            <h2 id="titulo-principales" className="mb-3">Movimientos explicados</h2>
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

          {/* La tabla completa de movimientos significativos vive en Comparar. */}
          <p className="mb-8 text-sm">
            <Link href={`/comparar?anterior=${resumen.anterior}&periodo=${periodo}`}>
              Ver los {formatearEntero(resumen.total_significativos)} movimientos significativos en Comparar
            </Link>
          </p>
        </>
      )}
    </>
  );
}
