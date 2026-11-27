"use client";
// ConmutadorPerfil — Selector compacto de perfil en la cabecera (muestra el perfil actual).
// Envía el formulario a la acción de servidor cambiarPerfil, que firma la cookie.
// Funciona aun sin JavaScript (formulario normal con botón "Cambiar").
//
// Uso (ya incluido en Cabecera; no hace falta usarlo en las páginas):
//   <ConmutadorPerfil perfilActual="analista"
//                     perfiles={[{ valor: "publico", nombre: "Público" }, ...]} />
//
// Props:
//   perfilActual (string)  Perfil vigente según la cookie (lo calcula el servidor).
//   perfiles     Lista de { valor, nombre }.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cambiarPerfil } from "@/app/perfil/acciones";

export default function ConmutadorPerfil({ perfilActual, perfiles }) {
  const ruta = usePathname();

  // Justo antes de enviar, se toma la URL completa (con filtros) para volver al mismo lugar.
  function alEnviar(evento) {
    const campo = evento.currentTarget.elements.namedItem("volver");
    if (campo) campo.value = window.location.pathname + window.location.search;
  }

  return (
    <form action={cambiarPerfil} onSubmit={alEnviar} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="volver" defaultValue={ruta} />
      <label htmlFor="conmutador-perfil" className="text-sobre-primario-suave">
        Perfil
      </label>
      <select
        id="conmutador-perfil"
        name="perfil"
        defaultValue={perfilActual}
        key={perfilActual}
        className="min-h-8 rounded-control border border-sobre-primario-suave bg-primario-oscuro px-2 py-1 font-semibold text-sobre-primario"
      >
        {perfiles.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.nombre}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="min-h-8 cursor-pointer rounded-control border border-sobre-primario-suave px-3 py-1 font-semibold text-sobre-primario hover:bg-primario-oscuro"
      >
        Cambiar
      </button>
      <Link href={`/perfil?volver=${encodeURIComponent(ruta)}`} className="text-sobre-primario-suave underline hover:text-sobre-primario">
        ¿Qué puede hacer cada perfil?
      </Link>
    </form>
  );
}
