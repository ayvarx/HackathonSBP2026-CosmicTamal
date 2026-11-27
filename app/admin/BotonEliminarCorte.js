"use client";
// Eliminar un período cargado, con confirmación explícita: hay que escribir el período
// (AAAAMMDD) para habilitar el botón. La ruta /api/admin/cortes vuelve a exigir el perfil
// Administrador y la misma confirmación en el servidor.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearEntero } from "@/lib/formato";

export default function BotonEliminarCorte({ fecha, etiqueta, filas }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [estado, setEstado] = useState({ tipo: "inicial" });

  async function eliminar() {
    setEstado({ tipo: "procesando" });
    try {
      const consulta = new URLSearchParams({ periodo: fecha, confirmar: confirmacion.trim() });
      const respuesta = await fetch(`/api/admin/cortes?${consulta}`, { method: "DELETE" });
      const r = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !r?.ok) {
        setEstado({ tipo: "error", mensaje: r?.mensaje ?? `El servidor respondió con el código ${respuesta.status}.` });
        return;
      }
      setAbierto(false);
      router.refresh();
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo conectar con el servidor. Intente de nuevo." });
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="boton boton-secundario" onClick={() => setAbierto(true)}>
        Eliminar…
      </button>
    );
  }

  const coincide = confirmacion.trim() === fecha;
  const idCampo = `confirmar-${fecha}`;
  return (
    <div className="w-64 rounded-tarjeta border border-error-borde bg-error-fondo p-3 text-sm" role="group" aria-label={`Eliminar ${etiqueta}`}>
      <p className="font-semibold text-error-texto">¿Eliminar {etiqueta}?</p>
      <p className="mt-1">
        Se borrarán sus {formatearEntero(filas)} filas y se recalcularán los rankings y movimientos. No se puede deshacer.
      </p>
      <label className="etiqueta-campo mt-2" htmlFor={idCampo}>
        Escriba {fecha} para confirmar
      </label>
      <input
        id={idCampo}
        className="control codigo"
        inputMode="numeric"
        autoComplete="off"
        value={confirmacion}
        onChange={(evento) => setConfirmacion(evento.target.value)}
      />
      {estado.tipo === "error" && (
        <p role="alert" className="mt-2 text-error-texto">{estado.mensaje}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="boton" disabled={!coincide || estado.tipo === "procesando"} onClick={eliminar}>
          {estado.tipo === "procesando" ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
        <button
          type="button"
          className="boton boton-secundario"
          disabled={estado.tipo === "procesando"}
          onClick={() => {
            setAbierto(false);
            setConfirmacion("");
            setEstado({ tipo: "inicial" });
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
