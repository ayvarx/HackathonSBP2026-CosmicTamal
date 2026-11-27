// Estructura común de Administración: submenú (Cortes, Qué cambió, Parámetros, Catálogos, Bitácora).
// El perfil se exige aquí Y en cada página: el layout no vuelve a ejecutarse al navegar
// entre subpáginas, así que cada página hace su propia comprobación en el servidor.
import { exigirPerfil } from "@/lib/auth";
import NavegacionAdmin from "./NavegacionAdmin";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }) {
  await exigirPerfil("administrador");
  return (
    <>
      <NavegacionAdmin />
      {children}
    </>
  );
}
