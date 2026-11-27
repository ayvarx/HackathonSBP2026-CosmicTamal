// TarjetaIndicador — Cifra destacada con su contexto (panel principal, resúmenes). Servidor y cliente.
//
// Uso:
//   <TarjetaIndicador
//     titulo="Universo local válido"
//     valor={formatearEntero(fila.universo)}        // ya formateado (texto)
//     detalle="Préstamos que pasan E1–E4 en septiembre de 2026"
//     movimiento={{ valor: "1520", tipo: "monto" }}  // opcional, usa IndicadorMovimiento
//     enlace={{ href: "/calidad", texto: "Ver reporte de calidad" }} />
//
// Props:
//   titulo     (string)  Nombre del indicador.
//   valor      (string|nodo)  Cifra YA formateada con lib/formato.js (no se formatea aquí).
//   unidad     (string)  opcional  Texto pequeño junto a la cifra (p. ej. "préstamos").
//   detalle    (string|nodo)  opcional  Explicación breve debajo de la cifra.
//   movimiento ({ valor, tipo, significativo })  opcional  Variación frente al período anterior.
//   enlace     ({ href, texto })  opcional  Enlace a la pantalla con más detalle.
import Link from "next/link";
import IndicadorMovimiento from "./IndicadorMovimiento";

export default function TarjetaIndicador({ titulo, valor, unidad, detalle, movimiento, enlace }) {
  return (
    <article className="tarjeta flex h-full flex-col gap-1">
      <h3 className="text-sm font-semibold text-texto-suave">{titulo}</h3>
      <p className="cifra text-2xl font-semibold tracking-tight text-texto">
        {valor}
        {unidad && <span className="ml-1 text-sm font-normal text-texto-suave">{unidad}</span>}
      </p>
      {movimiento && (
        <div className="text-sm">
          <IndicadorMovimiento {...movimiento} />
        </div>
      )}
      {detalle && <p className="text-sm text-texto-suave">{detalle}</p>}
      {enlace?.href && (
        <p className="mt-auto pt-2 text-sm">
          <Link href={enlace.href}>{enlace.texto}</Link>
        </p>
      )}
    </article>
  );
}
