// Parámetros (/admin/parametros) — Umbrales de la regla de "movimiento significativo".
// La regla NO está fija en el código (sección 8 del reto): vive en la tabla parametros,
// el motor la lee al consultar y cada cambio queda en la bitácora.
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import { exigirPerfil } from "@/lib/auth";
import { parametros } from "@/lib/consultas";
import { efectoRegla, reglaSignificativo } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha, formatearFechaHora } from "@/lib/formato";
import FormularioParametro from "./FormularioParametro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parámetros" };

// Cómo se edita cada parámetro en pantalla (la validación real está en el servidor).
const CONTROL = {
  min_cambio_posicion: { titulo: "Cambio mínimo de posición", tipo: "entero", min: 1, max: 11, unidad: "posiciones" },
  marcar_cambio_lider: { titulo: "Marcar todo cambio de líder", tipo: "si_no" },
  min_var_saldo_pct: { titulo: "Variación mínima de saldo", tipo: "decimal", unidad: "%" },
};

/** "2026-11-27 15:04" (hora de la base) → texto en hora de Panamá si se puede interpretar. */
function momento(valor) {
  return valor ? formatearFechaHora(`${valor.replace(" ", "T")}:00Z`) : "—";
}

export default async function PaginaParametros() {
  await exigirPerfil("administrador");
  const [todos, regla, efecto] = await Promise.all([parametros(), reglaSignificativo(), efectoRegla()]);
  // Orden lógico de la regla (posición, líder, saldo); un parámetro nuevo va al final.
  const orden = Object.keys(CONTROL);
  const posicion = (clave) => (orden.includes(clave) ? orden.indexOf(clave) : orden.length);
  const lista = [...todos].sort((a, b) => posicion(a.clave) - posicion(b.clave));

  return (
    <>
      <EncabezadoPagina
        titulo="Parámetros de movimiento significativo"
        descripcion="Umbrales que definen cuándo un cambio entre dos períodos es significativo."
      />

      <p className="tarjeta mb-6 text-sm">
        <span className="font-semibold">Regla vigente:</span> {regla.texto}
      </p>

      <section aria-labelledby="titulo-parametros" className="mb-8">
        <h2 id="titulo-parametros" className="mb-3">Umbrales</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {lista.map((p) => (
            <FormularioParametro
              key={p.clave}
              clave={p.clave}
              valor={p.valor}
              descripcion={p.descripcion}
              control={CONTROL[p.clave] ?? { titulo: p.clave, tipo: "texto" }}
              actualizado={`${momento(p.actualizado_en)} · ${p.actualizado_por}`}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="titulo-efecto">
        <h2 id="titulo-efecto" className="mb-1">Efecto de la regla vigente</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Movimientos (banco × ranking) marcados en cada par de períodos consecutivos.
        </p>
        {efecto.length === 0 ? (
          <p className="tarjeta text-sm">Se necesitan al menos dos períodos cargados para comparar.</p>
        ) : (
          <div className="marco-tabla">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th scope="col">Comparación</th>
                  <th scope="col" className="num">Movimientos</th>
                  <th scope="col" className="num">Significativos</th>
                  <th scope="col" className="num">Por posición</th>
                  <th scope="col" className="num">Por cambio de líder</th>
                  <th scope="col" className="num">Por variación de saldo</th>
                  <th scope="col" className="num">Empiezan a tener saldo</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {efecto.map((e) => (
                  <tr key={`${e.anterior}-${e.actual}`}>
                    <td>{formatearFecha(e.anterior)} → {formatearFecha(e.actual)}</td>
                    <td className="num">{formatearEntero(e.total)}</td>
                    <td className="num font-semibold">{formatearEntero(e.significativos)}</td>
                    <td className="num">{formatearEntero(e.por_posicion)}</td>
                    <td className="num">{formatearEntero(e.por_lider)}</td>
                    <td className="num">{formatearEntero(e.por_saldo)}</td>
                    <td className="num">{formatearEntero(e.por_nuevo)}</td>
                    <td>
                      <Link href={`/admin/resumen?periodo=${e.actual}`}>Qué cambió</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
