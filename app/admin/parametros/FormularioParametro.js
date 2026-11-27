"use client";
// Edita un parámetro (POST /api/admin/parametros) y refresca la página.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormularioParametro({ clave, valor, control }) {
  const router = useRouter();
  const [texto, setTexto] = useState(valor);
  const [estado, setEstado] = useState({ tipo: "inicial" });
  const id = `parametro-${clave}`;

  async function guardar(evento) {
    evento.preventDefault();
    setEstado({ tipo: "guardando" });
    try {
      const respuesta = await fetch("/api/admin/parametros", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clave, valor: texto }),
      });
      const r = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !r?.ok) {
        setEstado({ tipo: "error", mensaje: r?.mensaje ?? `El servidor respondió con el código ${respuesta.status}.` });
        return;
      }
      setTexto(r.parametro.valor);
      setEstado({ tipo: "ok", mensaje: "Guardado. La nueva regla ya se aplica." });
      router.refresh();
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo conectar con el servidor. Intente de nuevo." });
    }
  }

  return (
    <form className="tarjeta flex flex-col gap-2" onSubmit={guardar}>
      <label htmlFor={id} className="font-semibold">{control.titulo}</label>
      <div className="flex items-center gap-2">
        {control.tipo === "si_no" ? (
          <select id={id} className="control" value={texto} onChange={(e) => setTexto(e.target.value)}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        ) : (
          <input
            id={id}
            className="control cifra"
            type="text"
            inputMode={control.tipo === "entero" ? "numeric" : "decimal"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-describedby={control.tipo === "entero" || control.tipo === "decimal" ? `${id}-ayuda` : undefined}
          />
        )}
        {control.unidad && <span className="text-sm text-texto-suave">{control.unidad}</span>}
        <button type="submit" className="boton ml-auto" disabled={estado.tipo === "guardando" || texto === valor}>
          {estado.tipo === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {(control.tipo === "entero" || control.tipo === "decimal") && (
        <p id={`${id}-ayuda`} className="text-xs text-texto-tenue">
          {control.tipo === "entero" ? `Entre ${control.min} y ${control.max}.` : "Por ejemplo 10 o 7.5."}
        </p>
      )}
      <p aria-live="polite" className="text-sm">
        {estado.tipo === "ok" && <span className="font-semibold text-sube">{estado.mensaje}</span>}
        {estado.tipo === "error" && <span role="alert" className="font-semibold text-error-texto">{estado.mensaje}</span>}
      </p>
    </form>
  );
}
