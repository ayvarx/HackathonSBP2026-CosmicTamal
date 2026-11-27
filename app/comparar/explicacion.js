// app/comparar/explicacion.js — Explicación automática de los movimientos con PLANTILLAS FIJAS.
//
// No se usa IA: cada frase sale de reglas deterministas aplicadas a las cifras que calculó
// el motor SQL (movimientos y descomposición de la variación de saldo). Con los mismos datos
// siempre se obtiene exactamente el mismo texto (reproducible, sección 9 de las indicaciones).
//
// Dinero: los montos se insertan con formatearMonto (texto exacto que viene de SQL). Para
// decidir qué factor "pesó más" se comparan los textos decimales con compararDecimales,
// nunca con punto flotante. Quitar el signo es una operación de texto, no una resta.

import {
  compararDecimales,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearPorcentaje,
  nombreRanking,
  signoDecimal,
} from "@/lib/formato";

/** "-6408501.43" → "6408501.43" (valor absoluto como texto, sin aritmética). */
export function quitarSigno(texto) {
  return String(texto ?? "0").replace(/^[+-]/, "");
}

/** "-6408501.43" → -640850143n. Centavos enteros exactos (BigInt), nunca punto flotante. */
function aCentavos(texto) {
  const [entero, fraccion = ""] = quitarSigno(texto).split(".");
  const centavos = BigInt(entero + fraccion.padEnd(2, "0").slice(0, 2));
  return String(texto).trim().startsWith("-") ? -centavos : centavos;
}

/**
 * Comprueba al centavo que nuevos + salidos + continúan = Var_Saldo (así lo garantiza el
 * motor SQL; aquí se vuelve a verificar con enteros exactos para mostrarlo al usuario).
 */
export function descomposicionCuadra(d) {
  return aCentavos(d.saldo_nuevos) + aCentavos(d.saldo_salidos) + aCentavos(d.variacion_continuan) === aCentavos(d.var_saldo);
}

/** 3 → "3.ª" (posición es femenino: "la 3.ª posición"). */
export function ordinal(n) {
  return `${n}.ª`;
}

/** ["A", "B", "C"] → "A, B y C". */
export function unirLista(elementos) {
  if (elementos.length <= 1) return elementos.join("");
  return `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`;
}

function cantidad(n, singular, plural) {
  return `${formatearEntero(n)} ${n === 1 ? singular : plural}`;
}

function mayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Bancos con los que se cruzó un banco al moverse:
 *  - si sube: los que estaban por delante y ahora quedan detrás (los que supera);
 *  - si baja: los que estaban detrás y ahora quedan delante (los que lo superan).
 * Solo compara posiciones (enteros), no saldos.
 */
export function bancosCruzados(m, movimientosRanking) {
  const otros = movimientosRanking.filter((o) => o.codigo_banco !== m.codigo_banco);
  const cruzados =
    m.cambio_posicion > 0
      ? otros.filter((o) => o.posicion_anterior < m.posicion_anterior && o.posicion_actual > m.posicion_actual)
      : m.cambio_posicion < 0
        ? otros.filter((o) => o.posicion_anterior > m.posicion_anterior && o.posicion_actual < m.posicion_actual)
        : [];
  return cruzados.sort((a, b) => a.posicion_actual - b.posicion_actual);
}

/**
 * Movimientos que se explican en tarjetas: primero TODOS los significativos (aunque no
 * cambien de puesto) y después los cambios de posición no significativos. Así el conteo
 * "N movimientos son significativos" coincide con las tarjetas marcadas como tales.
 * Dentro de cada grupo: cambio de líder, salto de posición más grande, mayor variación de saldo.
 */
export function principalesMovimientos(movimientosRanking) {
  const orden = (a, b) =>
    (a.cambio_de_lider === "SI" ? 0 : 1) - (b.cambio_de_lider === "SI" ? 0 : 1) ||
    Math.abs(b.cambio_posicion) - Math.abs(a.cambio_posicion) ||
    compararDecimales(quitarSigno(b.var_saldo), quitarSigno(a.var_saldo)) ||
    a.posicion_actual - b.posicion_actual;
  const significativos = movimientosRanking.filter((m) => m.significativo).sort(orden);
  const otros = movimientosRanking.filter((m) => !m.significativo && m.cambio_posicion !== 0).sort(orden);
  return [...significativos, ...otros];
}

/** Frase sobre la posición: sube, baja o se mantiene, y con quién se cruzó. */
function frasePosicion(m, movimientosRanking) {
  const nombre = `${m.banco} (${m.codigo_banco})`;
  const cruzados = bancosCruzados(m, movimientosRanking).map((o) => o.banco);
  if (m.cambio_posicion > 0) {
    let frase = `${nombre} sube de la ${ordinal(m.posicion_anterior)} a la ${ordinal(m.posicion_actual)} posición`;
    if (cruzados.length) frase += ` y supera a ${unirLista(cruzados)}`;
    if (m.posicion_actual === 1) frase += "; es el nuevo líder del ranking";
    return frase + ".";
  }
  if (m.cambio_posicion < 0) {
    let frase = `${nombre} baja de la ${ordinal(m.posicion_anterior)} a la ${ordinal(m.posicion_actual)} posición`;
    if (cruzados.length) frase += `; lo ${cruzados.length === 1 ? "supera" : "superan"} ${unirLista(cruzados)}`;
    // Coma antes de "y" si la lista de bancos ya trae su propia "y" ("A y B, y pierde...").
    if (m.posicion_anterior === 1) frase += `${cruzados.length ? "," : ""} y pierde el liderazgo`;
    return frase + ".";
  }
  return `${nombre} se mantiene en la ${ordinal(m.posicion_actual)} posición.`;
}

/** Frase sobre la variación de saldo (Var_Saldo y Var_Saldo_Pct del motor). */
function fraseSaldo(m) {
  const signo = signoDecimal(m.var_saldo);
  // Sin saldo anterior el motor no calcula porcentaje (división entre cero).
  if (m.var_saldo_pct === null || m.var_saldo_pct === undefined) {
    return `Su saldo pasa de ${formatearMonto(m.saldo_anterior)} a ${formatearMonto(m.saldo_actual)}.`;
  }
  if (signo === 0) return `Su saldo no cambia: ${formatearMonto(m.saldo_actual)}.`;
  return (
    `Su saldo ${signo > 0 ? "aumenta" : "disminuye"} ${formatearMonto(quitarSigno(m.var_saldo))} ` +
    `(${formatearPorcentaje(m.var_saldo_pct, 4, { signo: true })}): pasa de ${formatearMonto(m.saldo_anterior)} ` +
    `a ${formatearMonto(m.saldo_actual)}.`
  );
}

/**
 * Frases que explican la variación con la descomposición del motor:
 *   nuevos (+) + salidos (−) + variación de los que continúan (±) = Var_Saldo.
 */
function frasesDescomposicion(d) {
  const signoContinuan = signoDecimal(d.variacion_continuan);
  const partes = [
    d.prestamos_nuevos
      ? `se originaron ${cantidad(d.prestamos_nuevos, "préstamo nuevo", "préstamos nuevos")} por ${formatearMonto(d.saldo_nuevos)}`
      : "no hubo préstamos nuevos",
    d.prestamos_salidos
      ? `salieron ${cantidad(d.prestamos_salidos, "préstamo", "préstamos")} que sumaban ${formatearMonto(quitarSigno(d.saldo_salidos))} (vencieron, se cancelaron o dejaron de ser válidos)`
      : "no salió ningún préstamo",
    !d.prestamos_continuan
      ? "ningún préstamo continúa del período anterior"
      : signoContinuan < 0
        ? `los ${cantidad(d.prestamos_continuan, "préstamo", "préstamos")} que continúan bajaron su saldo en ${formatearMonto(quitarSigno(d.variacion_continuan))} por amortización`
        : signoContinuan > 0
          ? `los ${cantidad(d.prestamos_continuan, "préstamo", "préstamos")} que continúan subieron su saldo en ${formatearMonto(d.variacion_continuan)}`
          : `los ${cantidad(d.prestamos_continuan, "préstamo", "préstamos")} que continúan mantuvieron su saldo`,
  ];
  const frases = [`${mayuscula(unirLista(partes))}.`];

  // Factor que más pesó = la parte con mayor valor absoluto (comparación exacta de textos).
  const factores = [
    { texto: "la originación de préstamos nuevos", valor: quitarSigno(d.saldo_nuevos) },
    { texto: "la salida de préstamos", valor: quitarSigno(d.saldo_salidos) },
    {
      texto: signoContinuan < 0 ? "la amortización de los préstamos que continúan" : "el aumento de saldo de los préstamos que continúan",
      valor: quitarSigno(d.variacion_continuan),
    },
  ].sort((a, b) => compararDecimales(b.valor, a.valor));
  if (signoDecimal(factores[0].valor) > 0) frases.push(`Lo que más pesó fue ${factores[0].texto}.`);
  return frases;
}

/**
 * Explicación completa de un movimiento (un banco en un ranking).
 * @param {object} m  fila de movimientos() (lib/consultas.js)
 * @param {object|undefined} d  fila de descomposicion() del mismo banco y ranking
 * @param {object[]} movimientosRanking  los 12 movimientos del mismo ranking (para saber con quién se cruzó)
 * @returns {{codigo_banco: string, banco: string, frases: string[]}}
 */
export function explicarMovimiento(m, d, movimientosRanking) {
  const frases = [frasePosicion(m, movimientosRanking), fraseSaldo(m)];
  if (d) frases.push(...frasesDescomposicion(d));

  // Casos que suelen confundir: el banco crece pero baja de puesto (o al revés).
  // Si B lo supera mientras A crece, B creció más en monto (B_ant < A_ant y B_act > A_act).
  const signo = signoDecimal(m.var_saldo);
  if (m.cambio_posicion < 0 && signo > 0) {
    frases.push("Aunque su saldo creció, los bancos que lo superaron crecieron más en monto.");
  } else if (m.cambio_posicion > 0 && signo < 0) {
    frases.push("Aunque su saldo bajó, los bancos que superó redujeron el suyo aún más.");
  }
  return { codigo_banco: m.codigo_banco, banco: m.banco, frases };
}

/**
 * Párrafo de entrada del ranking: quién lidera, cuántos cambian de posición y cuántos
 * movimientos son significativos según la regla vigente.
 */
export function introduccionRanking(ranking, movimientosRanking, anterior, actual) {
  const lider = movimientosRanking.find((m) => m.posicion_actual === 1);
  const liderAnterior = movimientosRanking.find((m) => m.posicion_anterior === 1);
  if (!lider || !liderAnterior) return "";
  const cambian = movimientosRanking.filter((m) => m.cambio_posicion !== 0).length;
  const significativos = movimientosRanking.filter((m) => m.significativo).length;

  let texto = `En el ranking ${nombreRanking(ranking)}, entre ${formatearFecha(anterior)} y ${formatearFecha(actual)}, `;
  texto +=
    lider.codigo_banco === liderAnterior.codigo_banco
      ? `${lider.banco} se mantiene como líder con un saldo de ${formatearMonto(lider.saldo_actual)}. `
      : `${lider.banco} desplaza a ${liderAnterior.banco} del primer lugar con un saldo de ${formatearMonto(lider.saldo_actual)}. `;
  const otros = movimientosRanking.filter((m) => !m.significativo && m.cambio_posicion !== 0).length;
  texto += cambian === 0 ? "Ningún banco cambió de posición" : `${cambian} de los ${movimientosRanking.length} bancos cambiaron de posición`;
  texto += `. ${significativos === 1 ? "1 movimiento es significativo" : `${significativos} movimientos son significativos`} según la regla vigente`;
  texto += otros
    ? ` y ${otros === 1 ? "1 cambio de posición no lo es" : `${otros} cambios de posición no lo son`}; se detallan abajo.`
    : significativos
      ? "; se detallan abajo."
      : ".";
  return texto;
}
