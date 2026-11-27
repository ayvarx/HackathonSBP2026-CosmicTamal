// SeccionEntidades — Compara de 2 a 4 bancos lado a lado en los 6 rankings. Componente de servidor.
//
// La selección se hace con un formulario GET normal (casillas "bancos"): funciona sin
// JavaScript y la URL resultante se puede compartir. Los demás filtros viajan en campos ocultos.
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

  return (
    <section id="entidades" aria-labelledby="titulo-entidades" className="scroll-mt-24">
      <h2 id="titulo-entidades">Bancos lado a lado</h2>
      <p className="mt-1 max-w-3xl text-sm text-texto-suave">
        Posición, movimiento y saldo de cada banco elegido en los 6 rankings, entre {formatearFecha(anterior)} y{" "}
        {formatearFecha(actual)}.
      </p>

      <form method="get" action="/comparar#entidades" className="tarjeta mt-4">
        <input type="hidden" name="anterior" value={anterior} />
        <input type="hidden" name="periodo" value={actual} />
        <input type="hidden" name="ranking" value={ranking} />
        {banco && <input type="hidden" name="banco" value={banco} />}
        <fieldset>
          <legend className="etiqueta-campo">
            Elija de {MIN_BANCOS} a {MAX_BANCOS} bancos
          </legend>
          <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            {todosBancos.map((b) => (
              <label key={b.codigo} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="bancos" value={b.codigo} defaultChecked={bancosElegidos.includes(b.codigo)} />
                <span>
                  <span className="cifra text-texto-tenue">{b.codigo}</span> {b.nombre}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="boton">
            Comparar bancos
          </button>
          {aviso && (
            <p className="text-sm text-aviso-texto" role="status">
              {aviso}
            </p>
          )}
        </div>
      </form>

      {elegidos.length >= 1 && (
        <>
          <div className="marco-tabla mt-4" role="region" aria-label="Bancos lado a lado en los 6 rankings" tabIndex={0}>
            <table className="tabla-datos">
              <caption>
                Bancos lado a lado · {formatearFecha(anterior)} → {formatearFecha(actual)}. Posición actual, cambio de
                posición, saldo actual y ponderación.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Ranking</th>
                  {elegidos.map((b, i) => (
                    <th key={b.codigo} scope="col" className="num">
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
                    <th scope="row" className="text-left font-semibold">
                      {nombreRanking(r)}
                    </th>
                    {elegidos.map((b) => {
                      const m = movimiento.get(`${r}|${b.codigo}`);
                      const fila = filaRanking.get(`${r}|${b.codigo}`);
                      if (!m) return <td key={b.codigo} className="num">—</td>;
                      return (
                        <td key={b.codigo} className="num align-top">
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
                      <td key={b.codigo} className="num cifra">
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
              titulo={`Saldo por ranking de los bancos elegidos · ${formatearFecha(actual)}`}
              descripcion="Barras agrupadas por ranking; las cifras exactas están en la tabla de arriba."
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
