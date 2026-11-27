// /acceso-restringido — destino de exigirPerfil() cuando el perfil no alcanza.
// Recibe ?requiere=<perfil mínimo>&desde=<ruta que se intentó abrir>.
import AccesoRestringido from "@/components/AccesoRestringido";
import { esPerfilValido, obtenerPerfil, rutaInternaSegura } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso restringido" };

export default async function PaginaAccesoRestringido({ searchParams }) {
  const perfilActual = await obtenerPerfil();
  const { requiere, desde } = await searchParams;
  // Los parámetros vienen de la URL: se validan antes de usarlos.
  const minimo = esPerfilValido(requiere) ? requiere : "administrador";
  const ruta = rutaInternaSegura(typeof desde === "string" ? desde : "", "");

  return <AccesoRestringido perfilActual={perfilActual} requiere={minimo} desde={ruta || null} />;
}
