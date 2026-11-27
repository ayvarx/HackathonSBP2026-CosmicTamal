// Portado del frontend de Amet: components/RankingsPage.jsx (cabecera y pestañas)
// Cabecera "Actividad económica" con los chips de cada ranking y el selector de período al lado,
// la línea "Incluye: subactividades" y las pestañas que cambian de vista.
// Cambios frente a Amet: los chips son enlaces (?ranking= en la URL) agrupados en Obligatorios,
// Recomendado y Bonus como pide la Sección 5, y las pestañas son "Tabla" y "Tarjetas" (?vista=).
// Componente de servidor. La pestaña de tarjetas está en TarjetasBancos.js.
//
// Props de RankingsPage:
//   grupos    [{ titulo, chips: [{ clave, texto, href, activo }] }]
//   selector  Elemento a la derecha de los chips (PeriodSelect).
//   incluye   [texto] subactividades del ranking elegido.
import Link from "next/link";
import "./rankings.css";

export default function RankingsPage({ grupos, selector, incluye = [] }) {
  return (
    <section className="rk-amet panel rk-actividad" aria-label="Elegir actividad económica y período">
      <span className="eyebrow">Actividad económica</span>
      <div className="fila-chips">
        <nav aria-label="Elegir ranking" className="rk-grupos">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="rk-grupo-titulo">{g.titulo}</p>
              <div className="chips grande">
                {g.chips.map((c) => (
                  <Link
                    key={c.clave}
                    href={c.href}
                    className={`chip ${c.activo ? "on" : ""}`}
                    aria-current={c.activo ? "page" : undefined}
                    scroll={false}
                  >
                    {c.texto}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        {selector}
      </div>
      {incluye.length > 0 && <p className="incluye">Incluye: {incluye.join(" · ")}</p>}
    </section>
  );
}

/**
 * Pestañas de vista (en Amet: "Posiciones" / "Composición").
 * @param {{pestanas: {id: string, titulo: string, href: string, activa: boolean}[]}} props
 */
export function PestanasVista({ pestanas }) {
  return (
    <nav className="rk-amet rk-pestanas" aria-label="Elegir vista">
      {pestanas.map((p) => (
        <Link key={p.id} href={p.href} className={p.activa ? "on" : ""} aria-current={p.activa ? "page" : undefined} scroll={false}>
          {p.titulo}
        </Link>
      ))}
    </nav>
  );
}
