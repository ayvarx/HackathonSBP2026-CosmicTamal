// ConmutadorPerfil — Bloque de usuario de la cabecera: avatar con la inicial del perfil,
// el perfil actual ("Administrador", "Analista" o "Público") y el botón "Cerrar sesión".
// Si hay una cuenta con nombre, se muestra en pequeño debajo del perfil.
//
// Props:
//   nombrePerfil (string)  Nombre visible del perfil actual (p. ej. "Analista").
//   perfil (string)        'publico' | 'analista' | 'administrador'.
//   usuario (string|null)  Nombre de la cuenta; sin cuenta solo se muestra el perfil.
import { cerrarSesion } from "@/app/perfil/acciones";

export default function ConmutadorPerfil({ nombrePerfil, perfil = "publico", usuario = null }) {
  const perfilVisible = nombrePerfil || "Público";
  return (
    <form action={cerrarSesion} className={`app-perfil app-usuario-bloque rol-${perfil}`}>
      <span className="app-avatar" aria-hidden="true">{perfilVisible.charAt(0).toUpperCase()}</span>
      <span className="app-usuario">
        <strong>{perfilVisible}</strong>
        {usuario && <small className="text-xs text-white/75">{usuario}</small>}
      </span>
      <button type="submit" className="app-salir">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        Cerrar sesión
      </button>
    </form>
  );
}
