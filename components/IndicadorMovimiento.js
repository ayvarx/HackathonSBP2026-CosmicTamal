// IndicadorMovimiento — Muestra si un banco sube, baja o se mantiene, con flecha Y texto
// (nunca solo color, para personas con daltonismo y para impresión). Servidor y cliente.
//
// Regla del reto (sección 8): Cambio_Posicion = Posicion_anterior − Posicion_actual.
//   positivo → sube (mejora), negativo → baja, 0 → se mantiene.
//
// Uso:
//   <IndicadorMovimiento valor={2} />                         → ▲ Sube 2 posiciones
//   <IndicadorMovimiento valor={-1} compacto />               → ▼ 1   (texto completo para lector de pantalla)
//   <IndicadorMovimiento valor="-15230.50" tipo="monto" />    → ▼ -15,230.50
//   <IndicadorMovimiento valor="3.2" tipo="porcentaje" />     → ▲ +3.20 %
//   <IndicadorMovimiento valor={3} significativo />           → agrega la etiqueta "Significativo"
//   <IndicadorMovimiento valor={null} />                      → "Sin período anterior"
//
// Props:
//   valor         (number | string decimal | null)  Cambio de posición o variación.
//   tipo          ("posicion" | "monto" | "porcentaje")  Predeterminado "posicion".
//   compacto      (bool)  Solo flecha y número (para tablas angostas).
//   significativo (bool)  Marca el movimiento como significativo según la regla configurable.
import { formatearMonto, formatearPorcentaje, signoDecimal } from "@/lib/formato";

const FLECHA = { 1: "▲", [-1]: "▼", 0: "=" };
const CLASE = { 1: "movimiento-sube", [-1]: "movimiento-baja", 0: "movimiento-igual" };

function quitarSigno(texto) {
  return String(texto).replace(/^[+-]/, "");
}

export default function IndicadorMovimiento({ valor, tipo = "posicion", compacto = false, significativo = false }) {
  const signo = signoDecimal(valor);
  if (signo === null) {
    return <span className="text-sm text-texto-tenue">Sin período anterior</span>;
  }

  let visible;
  let lector;
  if (tipo === "monto") {
    visible = formatearMonto(valor, { signo: true });
    lector = signo === 0 ? "Sin variación de saldo" : `${signo > 0 ? "Aumenta" : "Disminuye"} ${quitarSigno(formatearMonto(valor))}`;
  } else if (tipo === "porcentaje") {
    visible = formatearPorcentaje(valor, 2, { signo: true });
    lector = signo === 0 ? "Sin variación porcentual" : `${signo > 0 ? "Aumenta" : "Disminuye"} ${quitarSigno(formatearPorcentaje(valor, 2))}`;
  } else {
    const pasos = quitarSigno(String(valor));
    const unidad = pasos === "1" ? "posición" : "posiciones";
    lector = signo === 0 ? "Se mantiene" : `${signo > 0 ? "Sube" : "Baja"} ${pasos} ${unidad}`;
    // Siempre flecha y cifra; la frase queda solo para lectores de pantalla.
    visible = signo === 0 ? "0" : pasos;
  }

  return (
    <span className={`movimiento ${CLASE[signo]}`}>
      <span aria-hidden="true">{FLECHA[signo]}</span>
      <span aria-hidden="true">{visible}</span>
      <span className="solo-lector">{lector}</span>
      {significativo && <span className="etiqueta ml-1">Significativo</span>}
    </span>
  );
}
