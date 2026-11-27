// /login — Inicio de sesión con usuario y clave, visitante o acceso rápido por vista.
import AccesoTemporal from "@/components/AccesoTemporal";
import { datosPresentacion } from "@/app/login/datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso" };

export default async function PaginaLogin() {
  return <AccesoTemporal presentacion={await datosPresentacion()} />;
}
