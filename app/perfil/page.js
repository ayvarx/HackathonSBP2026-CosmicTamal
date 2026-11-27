// /perfil — Muestra el mismo acceso temporal que /login (tres botones, uno por vista).
// Responde 200 sin cookie: scripts/prueba-e2e.mjs usa esta ruta para saber si el servidor ya arrancó.
import AccesoTemporal from "@/components/AccesoTemporal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso" };

export default function PaginaPerfil() {
  return <AccesoTemporal />;
}
