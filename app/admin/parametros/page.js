// Parámetros (/admin/parametros) — Umbrales de la regla de "movimiento significativo".
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import { exigirPerfil } from "@/lib/auth";
import { parametros } from "@/lib/consultas";
import { efectoRegla } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha } from "@/lib/formato";
import FormularioParametro from "./FormularioParametro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parámetros" };

// Cómo se edita cada parámetro en pantalla (la validación real está en el servidor).
const CONTROL = {
  min_cambio_posicion: { titulo: "Cambio mínimo de posición", tipo: "entero", min: 1, max: 11, unidad: "posiciones" },
  marcar_cambio_lider: { titulo: "Marcar cambio de líder", tipo: "si_no" },
  min_var_saldo_pct: { titulo: "Variación mínima de saldo (%)", tipo: "decimal", unidad: "%" },
};

/** "min_var_saldo_pct" → "Min var saldo pct" (para un parámetro nuevo sin etiqueta propia). */
function etiquetaLegible(clave) {
  const texto = String(clave).replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function PaginaParametros() {
  await exigirPerfil("administrador");
  const [todos, efecto] = await Promise.all([parametros(), efectoRegla()]);
  // Orden lógico de la regla (posición, líder, saldo); un parámetro nuevo va al final.
  const orden = Object.keys(CONTROL);
  const posicion = (clave) => (orden.includes(clave) ? orden.indexOf(clave) : orden.length);
  const lista = [...todos].sort((a, b) => posicion(a.clave) - posicion(b.clave));

  return (
    <>
      <EncabezadoPagina titulo="Parámetros de movimiento significativo" />

      <section aria-labelledby="titulo-parametros" className="mb-8">
        <h2 id="titulo-parametros" className="mb-3">Umbrales</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {lista.map((p) => (
            <FormularioParametro
              key={p.clave}
              clave={p.clave}
              valor={p.valor}
              control={CONTROL[p.clave] ?? { titulo: etiquetaLegible(p.clave), tipo: "texto" }}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="titulo-efecto">
        <h2 id="titulo-efecto" className="mb-3">Efecto de la regla vigente</h2>
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
                    <td className="whitespace-nowrap">{formatearFecha(e.anterior)} → {formatearFecha(e.actual)}</td>
                    <td className="num">{formatearEntero(e.total)}</td>
                    <td className="num font-semibold">{formatearEntero(e.significativos)}</td>
                    <td className="num">{formatearEntero(e.por_posicion)}</td>
                    <td className="num">{formatearEntero(e.por_lider)}</td>
                    <td className="num">{formatearEntero(e.por_saldo)}</td>
                    <td className="num">{formatearEntero(e.por_nuevo)}</td>
                    <td className="whitespace-nowrap">
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
