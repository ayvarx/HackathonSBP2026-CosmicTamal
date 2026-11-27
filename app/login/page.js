// /login — Acceso temporal: elegir una de las tres vistas (Público, Analista, Administrador).
import AccesoTemporal from "@/components/AccesoTemporal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso" };

export default function PaginaLogin() {
  return <AccesoTemporal />;
}
