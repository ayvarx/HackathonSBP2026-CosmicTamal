// ReglaAplicada — Muestra la regla de "movimiento significativo" con los parámetros VIGENTES.
//
// La sección 8 pide que la regla sea configurable, no fija en el código. Los valores salen
// de la tabla `parametros` (los cambia el Administrador) y el motor SQL los usa para marcar
// cada movimiento; aquí solo se explican en lenguaje claro. Componente de servidor.
import Link from "next/link";

// Mismos valores por defecto que usa movimientos() en lib/consultas.js si falta un parámetro.
const PREDETERMINADOS = { min_cambio_posicion: "2", marcar_cambio_lider: "si", min_var_saldo_pct: "10" };

export default function ReglaAplicada({ parametros = [], esAdministrador = false }) {
  const porClave = Object.fromEntries(parametros.map((p) => [p.clave, p]));
  const valor = (clave) => porClave[clave]?.valor ?? PREDETERMINADOS[clave];
  const liderActivo = valor("marcar_cambio_lider") === "si";
  // Fecha de la última modificación de cualquiera de los parámetros (texto 'AAAA-MM-DD HH:MI').
  const ultima = parametros.reduce((max, p) => (p.actualizado_en > (max?.actualizado_en ?? "") ? p : max), null);

  return (
    <section className="tarjeta" aria-labelledby="titulo-regla">
      <h2 id="titulo-regla" className="text-base font-semibold">
        Regla aplicada: ¿cuándo un movimiento es significativo?
      </h2>
      <p className="mt-1 text-sm text-texto-suave">Basta con que el banco cumpla una de estas condiciones:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Sube o baja <strong className="cifra">{valor("min_cambio_posicion")}</strong> o más posiciones
          <span className="text-texto-tenue"> (|Cambio_Posicion| ≥ {valor("min_cambio_posicion")})</span>.
        </li>
        <li>
          {liderActivo ? (
            <>Gana o pierde el primer lugar del ranking (cambio de líder).</>
          ) : (
            <span className="text-texto-tenue">Cambio de líder: desactivado (no se marca por sí solo).</span>
          )}
        </li>
        <li>
          Su saldo varía <strong className="cifra">{valor("min_var_saldo_pct")} %</strong> o más
          <span className="text-texto-tenue"> (|Var_Saldo_Pct| ≥ {valor("min_var_saldo_pct")})</span>.
        </li>
        <li>Empieza a tener saldo en el ranking (su saldo anterior era 0.00).</li>
      </ul>
      <p className="mt-3 text-xs text-texto-tenue">
        Parámetros vigentes
        {ultima ? ` · última actualización ${ultima.actualizado_en} por ${ultima.actualizado_por}` : ""}. Los cambia el
        perfil Administrador{" "}
        {esAdministrador ? <Link href="/admin">en Administración</Link> : "en Administración"}; el motor vuelve a marcar
        los movimientos con los valores nuevos sin cambiar el código.
      </p>
    </section>
  );
}
