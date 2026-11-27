// app/layout.js — Estructura común de TODAS las pantallas:
//   cabecera (marca, perfil y menú) → franja fija (fuente, período, aviso) → contenido → pie.
import "./globals.css";
import Cabecera from "@/components/Cabecera";
import FranjaDatos from "@/components/FranjaDatos";
import PiePagina from "@/components/PiePagina";
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
  // En el acceso temporal (/login y /perfil) no se muestran el menú ni el perfil.
  const ruta = ((await headers()).get("x-ruta") ?? "").split("?")[0];
  const esAcceso = ruta === "/login" || ruta === "/perfil";

  return (
    <html lang="es-PA">
      <body className="flex min-h-screen flex-col">
        <a href="#contenido" className="saltar-contenido">
          Saltar al contenido
        </a>
        <div className="barra-superior-fija">
          {!esAcceso && <Cabecera perfil={perfil} />}
          <FranjaDatos periodoVigente={periodoVigente} />
        </div>
        <main id="contenido" className="contenedor flex-1 py-8">
          {children}
        </main>
        <PiePagina perfil={perfil} />
      </body>
    </html>
  );
}
