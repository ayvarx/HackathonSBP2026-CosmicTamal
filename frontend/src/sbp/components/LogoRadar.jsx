// Logotipo de "Radar de Crédito": cuadro azul con volumen, radar con barrido y barras de ranking.
// Recreado en SVG a partir de la propuesta de logo (no es el archivo original).
export default function LogoRadar({ size = 42 }) {
  return (
    <svg
      className="logo-radar"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Radar de Crédito"
    >
      <defs>
        <linearGradient id="lr-fondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#419A33" />
          <stop offset="1" stopColor="#052200" />
        </linearGradient>
        <linearGradient id="lr-barra" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0FAEA" />
          <stop offset="1" stopColor="#7EAC39" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lr-fondo)" />
      <rect x="3" y="3" width="58" height="26" rx="14" fill="#ffffff" fillOpacity="0.12" />
      <g fill="none" stroke="#A9D18E" strokeOpacity="0.6" strokeWidth="1.4">
        <circle cx="32" cy="34" r="22" />
        <circle cx="32" cy="34" r="14" />
        <circle cx="32" cy="34" r="6" />
        <line x1="10" y1="34" x2="54" y2="34" />
        <line x1="32" y1="12" x2="32" y2="56" />
      </g>
      <line x1="32" y1="34" x2="50" y2="16" stroke="#DDF2C9" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="50" cy="16" r="3" fill="#ffffff" />
      <rect x="14" y="38" width="8" height="14" rx="2" fill="url(#lr-barra)" />
      <rect x="25" y="30" width="8" height="22" rx="2" fill="url(#lr-barra)" />
      <rect x="36" y="22" width="8" height="30" rx="2" fill="url(#lr-barra)" />
    </svg>
  );
}
