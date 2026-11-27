// SeccionEntidades — Compara de 2 a 4 bancos lado a lado en los 6 rankings. Componente de servidor.
//
// La selección se hace con fichas (enlaces) que activan o desactivan cada banco en la URL:
// funciona sin JavaScript y la URL resultante se puede compartir.
import Link from "next/link";
import Grafico from "@/components/Grafico";
import IndicadorMovimiento from "@/components/IndicadorMovimiento";
import { formatearFecha, formatearMonto, formatearPorcentaje, nombreRanking } from "@/lib/formato";
import { ordinal } from "./explicacion";
import { COLORES, opcionEntidades } from "./graficos";

export const MIN_BANCOS = 2;
export const MAX_BANCOS = 4;

export default function SeccionEntidades({
  anterior,
  actual,
  ranking,
  banco,
  bancosElegidos,
  aviso,
  todosBancos,
  ordenRankings,
  movimientos,
  rankingsActual,
}) {
  const movimiento = new Map(movimientos.map((m) => [`${m.ranking}|${m.codigo_banco}`, m]));
  const filaRanking = new Map(rankingsActual.map((r) => [`${r.ranking}|${r.codigo_banco}`, r]));
  const elegidos = bancosElegidos
    .map((codigo) => todosBancos.find((b) => b.codigo === codigo))
    .filter(Boolean);
  const enlaceCon = (lista) => {
    const q = new URLSearchParams({ anterior, periodo: actual, ranking });
    if (banco) q.set("banco", banco);
    q.set("bancos", lista.join(","));
    return `/comparar?${q.toString()}#entidades`;
  };

  return (
    <section id="entidades" aria-labelledby="titulo-entidades" className="scroll-mt-24">
      <h2 id="titulo-entidades">Bancos lado a lado</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={`Elija de ${MIN_BANCOS} a ${MAX_BANCOS} bancos`}>
        {todosBancos.map((b) => {
          const activo = bancosElegidos.includes(b.codigo);
          const lleno = !activo && bancosElegidos.length >= MAX_BANCOS;
          const clase = `whitespace-nowrap rounded-full border px-3 py-1 text-sm no-underline ${
            activo
              ? "border-[#106003] bg-[#106003] font-semibold text-white"
              : "border-borde bg-superficie text-texto hover:border-[#106003]"
          }`;
          if (lleno) {
            return (
              <span key={b.codigo} className={`${clase} cursor-not-allowed opacity-50`} aria-disabled="true">
                {b.nombre}
              </span>
            );
          }
          const lista = activo ? bancosElegidos.filter((c) => c !== b.codigo) : [...bancosElegidos, b.codigo];
          return (
            <Link key={b.codigo} href={enlaceCon(lista)} scroll={false} aria-pressed={activo} className={clase}>
              {b.nombre}
            </Link>
          );
        })}
        {aviso && (
          <span className="text-sm text-aviso-texto" role="status">
            {aviso}
          </span>
        )}
      </div>

      {elegidos.length >= 1 && (
        <>
          <div className="marco-tabla mt-4" role="region" aria-label="Bancos lado a lado en los 6 rankings" tabIndex={0}>
            <table className="tabla-datos w-full">
              <caption className="sr-only">Bancos lado a lado en los 6 rankings</caption>
              <thead>
                <tr>
                  <th scope="col">Ranking</th>
                  {elegidos.map((b, i) => (
                    <th key={b.codigo} scope="col" className="num whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ background: COLORES[i % COLORES.length] }}
                      />
                      {b.nombre} <span className="font-normal text-texto-tenue">({b.codigo})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenRankings.map((r) => (
                  <tr key={r} className={r === ranking ? "fila-resaltada" : undefined}>
                    <th scope="row" className="whitespace-nowrap text-left font-semibold">
                      {nombreRanking(r)}
                    </th>
                    {elegidos.map((b) => {
                      const m = movimiento.get(`${r}|${b.codigo}`);
                      const fila = filaRanking.get(`${r}|${b.codigo}`);
                      if (!m) return <td key={b.codigo} className="num">—</td>;
                      return (
                        <td key={b.codigo} className="num whitespace-nowrap align-top">
                          <div className="flex items-baseline justify-end gap-2">
                            <span className="cifra text-base font-semibold">{ordinal(m.posicion_actual)}</span>
                            <IndicadorMovimiento valor={m.cambio_posicion} compacto significativo={m.significativo} />
                          </div>
                          <div className="cifra text-xs text-texto-suave">{formatearMonto(m.saldo_actual)}</div>
                          {fila && (
                            <div className="text-xs text-texto-tenue">
                              Ponderación {formatearPorcentaje(fila.ponderacion_pct)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total cartera local válida</td>
                  {elegidos.map((b) => {
                    // El denominador es el mismo en los 6 rankings de un banco (sección 4, paso 7).
                    const fila = rankingsActual.find((x) => x.codigo_banco === b.codigo);
                    return (
                      <td key={b.codigo} className="num cifra whitespace-nowrap">
                        {fila ? formatearMonto(fila.total_cartera_local_valida) : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4">
            <Grafico
              titulo={`Saldo por ranking · ${formatearFecha(actual)}`}
              altura={380}
              formatoValor="monto"
              opcion={opcionEntidades({ bancos: elegidos, ordenRankings, movimientos })}
            />
          </div>
        </>
      )}
    </section>
  );
}
