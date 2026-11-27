"use client";
// ConmutadorPerfil — Selector compacto de perfil en la cabecera (muestra el perfil actual).
// Estilo ".app-perfil" del frontend de Amet (components/topbar.css).
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
    <form action={cambiarPerfil} onSubmit={alEnviar} className="app-perfil">
      <input type="hidden" name="volver" defaultValue={ruta} />
      <label htmlFor="conmutador-perfil">Perfil</label>
      <select
        id="conmutador-perfil"
        name="perfil"
        defaultValue={perfilActual}
        key={perfilActual}
      >
        {perfiles.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.nombre}
          </option>
        ))}
      </select>
      <button type="submit">Cambiar</button>
      <Link href={`/perfil?volver=${encodeURIComponent(ruta)}`}>
        ¿Qué puede hacer cada perfil?
      </Link>
    </form>
  );
}
