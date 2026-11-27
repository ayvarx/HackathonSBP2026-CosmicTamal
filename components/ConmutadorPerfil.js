// ConmutadorPerfil — Muestra la vista actual y el botón "Cerrar sesión".
//
// Props:
//   nombrePerfil (string)  Nombre visible de la vista actual (p. ej. "Analista").
import { cerrarSesion } from "@/app/perfil/acciones";

export default function ConmutadorPerfil({ nombrePerfil }) {
  return (
    <form action={cerrarSesion} className="app-perfil">
      <span>{nombrePerfil}</span>
      <button type="submit">Cerrar sesión</button>
    </form>
  );
}
