// app/layout.js — Estructura común de TODAS las pantallas:
//   cabecera (marca, perfil y menú) → franja fija (fuente, período, aviso) → contenido → pie.
import "./globals.css";
import Cabecera from "@/components/Cabecera";
import FranjaDatos from "@/components/FranjaDatos";
import PiePagina from "@/components/PiePagina";
import AsistenteFlotante from "@/components/AsistenteFlotante";
import { headers } from "next/headers";
import { obtenerPerfil } from "@/lib/auth";
import { fechasDisponibles } from "@/lib/consultas-rankings";

export const metadata = {
  title: {
    template: "%s · Rankings de crédito bancario",
    default: "Rankings de crédito bancario · Hackathon SBP 2026",
  },
  description:
    "Rankings de crédito por banco y actividad económica. Datos ficticios.",
};

// Los datos cambian cada vez que el administrador carga un corte: nada se guarda en caché.
export const dynamic = "force-dynamic";

/**
 * Último corte cargado (AAAAMMDD) para la franja de datos; null si no hay cortes.
 * Si la base no responde, la franja dice "sin cortes cargados" en vez de romper TODAS
 * las pantallas (cada página muestra su propio mensaje de error).
 */
async function obtenerPeriodoVigente() {
  try {
    return (await fechasDisponibles()).at(-1) ?? null;
  } catch (error) {
    console.error("[layout] No se pudo leer el último corte:", error.message);
    return null;
  }
}

export default async function RootLayout({ children }) {
  const perfil = await obtenerPerfil();
  const periodoVigente = await obtenerPeriodoVigente();
  // En el acceso (/login y /perfil) no se muestra el marco: ni cabecera, ni franja, ni pie.
  // La franja queda solo para lectores de pantalla (sr-only) con la fuente y el período.
  const ruta = ((await headers()).get("x-ruta") ?? "").split("?")[0];
  const esAcceso = ruta === "/login" || ruta === "/perfil";

  return (
    <html lang="es-PA">
      <body className={esAcceso ? "h-dvh overflow-hidden" : "flex min-h-dvh flex-col"}>
        <a href="#contenido" className="saltar-contenido">
          Saltar al contenido
        </a>
        <div className={esAcceso ? "sr-only" : "barra-superior-fija"}>
          {!esAcceso && <Cabecera perfil={perfil} />}
          <FranjaDatos periodoVigente={periodoVigente} />
        </div>
        <main id="contenido" className={esAcceso ? "h-dvh" : "contenedor w-full flex-1 py-8"}>
          {children}
        </main>
        {!esAcceso && <PiePagina perfil={perfil} />}
        {/* Asistente de IA: solo si el servidor tiene clave (la clave nunca llega al cliente). */}
        {!esAcceso && Boolean(process.env.ANTHROPIC_API_KEY) && <AsistenteFlotante perfil={perfil} />}
      </body>
    </html>
  );
}
