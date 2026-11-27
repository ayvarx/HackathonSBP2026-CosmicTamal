// /perfil — Muestra la misma pantalla de acceso que /login.
// Responde 200 sin cookie: scripts/prueba-e2e.mjs usa esta ruta para saber si el servidor ya arrancó.
import AccesoTemporal from "@/components/AccesoTemporal";
import { datosPresentacion } from "@/app/login/datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso" };

export default async function PaginaPerfil() {
  return <AccesoTemporal presentacion={await datosPresentacion()} />;
}
