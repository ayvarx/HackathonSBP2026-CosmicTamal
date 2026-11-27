"use client";
// Submenú de Administración. Marca la sección actual con aria-current (accesible).
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { ruta: "/admin", texto: "Cortes" },
  { ruta: "/admin/resumen", texto: "Qué cambió" },
  { ruta: "/admin/parametros", texto: "Parámetros" },
  { ruta: "/admin/catalogos", texto: "Catálogos" },
  { ruta: "/admin/bitacora", texto: "Bitácora" },
];

export default function NavegacionAdmin() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de Administración" className="mb-6 border-b border-borde">
      <ul className="-mb-px flex flex-wrap gap-1">
        {SECCIONES.map((s) => {
          const actual = s.ruta === "/admin" ? ruta === "/admin" : ruta.startsWith(s.ruta);
          return (
            <li key={s.ruta}>
              <Link
                href={s.ruta}
                aria-current={actual ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2 text-sm font-semibold no-underline ${
                  actual ? "border-primario text-primario" : "border-transparent text-texto-suave hover:text-primario"
                }`}
              >
                {s.texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
