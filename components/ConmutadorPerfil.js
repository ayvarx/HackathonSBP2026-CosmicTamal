// ConmutadorPerfil — Bloque de usuario de la cabecera (diseño de Amet): avatar con inicial,
// nombre de usuario (o "Visitante"), vista actual y botón "Cerrar sesión".
//
// Props:
//   nombrePerfil (string)  Nombre visible de la vista actual (p. ej. "Analista").
//   perfil (string)        'publico' | 'analista' | 'administrador' (color de la etiqueta).
//   usuario (string|null)  Nombre de la cuenta; sin cuenta se muestra "Visitante".
import { cerrarSesion } from "@/app/perfil/acciones";

export default function ConmutadorPerfil({ nombrePerfil, perfil = "publico", usuario = null }) {
  const nombre = usuario || "Visitante";
  return (
    <form action={cerrarSesion} className="app-perfil app-usuario-bloque">
      <span className="app-avatar" aria-hidden="true">{nombre.charAt(0).toUpperCase()}</span>
      <span className="app-usuario">
        <strong>{nombre}</strong>
        <small className={`app-rol rol-${perfil}`}>{nombrePerfil}</small>
      </span>
      <button type="submit" className="app-salir">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        Cerrar sesión
      </button>
    </form>
  );
}
