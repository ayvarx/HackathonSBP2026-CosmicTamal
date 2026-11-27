// LogoAnimado — Logotipo animado (portado de Amet): radar con ondas, barrido giratorio,
// puntos que se encienden y barras de ranking que crecen. SVG animado con CSS (components/topbar.css).
// Props: size (número), decorativo (true oculta el logo a lectores de pantalla), id (prefijo único si hay varios).
export default function LogoAnimado({ size = 110, decorativo = false, id = "la" }) {
  return (
    <svg className="logo-animado" viewBox="0 0 120 120" width={size} height={size} {...(decorativo ? { "aria-hidden": true } : { role: "img", "aria-label": "Rankings de crédito bancario" })}>
      <defs>
        <linearGradient id={`${id}-fondo`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#419A33" />
          <stop offset="0.6" stopColor="#106003" />
          <stop offset="1" stopColor="#052200" />
        </linearGradient>
        <linearGradient id={`${id}-barra`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6fdee" />
          <stop offset="1" stopColor="#a6dc82" />
        </linearGradient>
        {/* Cola del barrido: intensa junto a la línea y transparente hacia atrás */}
        <linearGradient id={`${id}-cola`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#e4fbd0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#e4fbd0" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-recorte`}><rect x="4" y="4" width="112" height="112" rx="30" /></clipPath>
      </defs>

      <rect x="4" y="4" width="112" height="112" rx="30" fill={`url(#${id}-fondo)`} />
      <ellipse cx="60" cy="30" rx="46" ry="22" fill="#ffffff" fillOpacity="0.1" />

      <g clipPath={`url(#${id}-recorte)`}>
        {/* Anillos fijos y cruz del radar */}
        <g fill="none" stroke="#c6f2ad" strokeOpacity="0.55" strokeWidth="1.4">
          <circle cx="60" cy="60" r="44" />
          <circle cx="60" cy="60" r="30" />
          <circle cx="60" cy="60" r="16" />
          <line x1="14" y1="60" x2="106" y2="60" strokeOpacity="0.35" />
          <line x1="60" y1="14" x2="60" y2="106" strokeOpacity="0.35" />
        </g>

        {/* Ondas que salen del centro */}
        <circle className="la-onda la-o1" cx="60" cy="60" r="44" fill="none" stroke="#e4fbd0" strokeWidth="1.8" />
        <circle className="la-onda la-o2" cx="60" cy="60" r="44" fill="none" stroke="#e4fbd0" strokeWidth="1.8" />

        {/* Barrido: cuña con cola que gira alrededor del centro */}
        <g className="la-barrido">
          <path d="M60 60 L60 16 A44 44 0 0 0 22 38 Z" fill={`url(#${id}-cola)`} transform="rotate(0 60 60)" />
          <line x1="60" y1="60" x2="60" y2="16" stroke="#f6fdee" strokeWidth="2.4" strokeLinecap="round" />
        </g>

        {/* Puntos detectados */}
        <circle className="la-blip la-p1" cx="84" cy="42" r="3.2" fill="#ffffff" />
        <circle className="la-blip la-p2" cx="38" cy="82" r="2.8" fill="#ffffff" />
        <circle className="la-blip la-p3" cx="78" cy="84" r="2.4" fill="#ffffff" />

        {/* Barras de ranking, sobre el radar */}
        <g className="la-barras">
          <rect className="la-barra la-b1" x="34" y="78" width="13" height="22" rx="3" fill={`url(#${id}-barra)`} />
          <rect className="la-barra la-b2" x="54" y="66" width="13" height="34" rx="3" fill={`url(#${id}-barra)`} />
          <rect className="la-barra la-b3" x="74" y="52" width="13" height="48" rx="3" fill={`url(#${id}-barra)`} />
        </g>
      </g>
    </svg>
  );
}
