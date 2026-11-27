"use client";
// Portado del frontend de Amet: components/PeriodSelect.jsx
// Selector del período de corte. En Amet cambiaba un estado de React; aquí escribe ?periodo=
// en la URL (el servidor arma cada destino conservando los demás filtros) para que el enlace
// se pueda compartir y la página de servidor vuelva a consultar.
//
// Props:
//   periods   [{ valor: "20260930", texto: "septiembre de 2026" }] del más reciente al más antiguo.
//   value     Período mostrado.
//   destinos  { "20260930": "/rankings?periodo=20260930&ranking=..." } URL de cada período.
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PeriodSelect({ periods, value, destinos, disabled }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  return (
    <label className="field">
      <span>Período de corte{pendiente ? " · actualizando…" : ""}</span>
      <select
        value={value || ""}
        onChange={(event) => {
          const destino = destinos[event.target.value];
          if (destino) iniciarTransicion(() => router.replace(destino, { scroll: false }));
        }}
        disabled={disabled || !periods.length}
      >
        {!periods.length && <option value="">Sin períodos disponibles</option>}
        {periods.map((period) => (
          <option key={period.valor} value={period.valor}>
            {period.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
