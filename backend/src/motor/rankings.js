import { aCentavos, deCentavos, porcentaje4 } from "./numeros.js";

// Reglas de las Secciones 4 a 6 de las indicaciones del reto.
// `catalogos` = { cinu: [{Codigo_CINU, Macroactividad_Reto, Subactividad_Reto}],
//                 bancos: [{Codigo_Banco, Banco}],
//                 sb21: [{Facilidad_Crediticia}] }
// Las cifras de catálogo NO se escriben en el código: llegan desde los archivos de la SBP.

const CONSUMO = "CONSUMO";
const CODIGO_CREDITO_PERSONAL = "K.64.649.6492.64921";
const CODIGO_AUTOMOVIL = "K.64.649.6492.64922";
const CODIGO_TARJETA = "K.64.649.6499.64991";
const FACILIDAD_TARJETA = "07";
const FACILIDAD_AUTO = "03";

// Cascada de exclusiones E1-E4 sobre las filas de UN período.
export function depurar(filas, catalogos) {
  const cinu = new Set(catalogos.cinu.map((c) => c.Codigo_CINU));
  const conteo = { leidas: filas.length, E1: 0, E2: 0, E3: 0, E4: 0, validas: 0 };

  const vistos = new Set();
  const despuesE1 = [];
  for (const f of filas) {
    if (vistos.has(f.Numero_Prestamo)) { conteo.E1++; continue; }
    vistos.add(f.Numero_Prestamo);
    despuesE1.push(f);
  }

  const despuesE2 = despuesE1.filter((f) => {
    if (f.Destino !== "L") { conteo.E2++; return false; }
    return true;
  });

  const despuesE3 = despuesE2.filter((f) => {
    if (aCentavos(f.Saldo) <= 0n) { conteo.E3++; return false; }
    return true;
  });

  const validas = despuesE3.filter((f) => {
    if (!cinu.has(f.Tipo_Actividad)) { conteo.E4++; return false; }
    return true;
  });

  conteo.validas = validas.length;
  return { validas, conteo };
}

// Macroactividad, subactividad (con regla SB21 para CONSUMO) y alerta de coherencia.
export function clasificar(fila, catalogos) {
  const cat = catalogos.cinu.find((c) => c.Codigo_CINU === fila.Tipo_Actividad);
  let subactividad = cat.Subactividad_Reto;
  let alerta = null;

  if (cat.Macroactividad_Reto === CONSUMO &&
      fila.Tipo_Actividad === CODIGO_CREDITO_PERSONAL &&
      fila.Facilidad_Crediticia === FACILIDAD_TARJETA) {
    subactividad = "Tarjeta"; // reclasificación SB21: solo mueve saldo dentro de CONSUMO
  }

  // Control de coherencia: solo alerta, nunca excluye (Sección 6).
  if (fila.Tipo_Actividad === CODIGO_TARJETA && fila.Facilidad_Crediticia !== FACILIDAD_TARJETA) {
    alerta = "Tarjeta sin facilidad 07";
  }
  if (fila.Tipo_Actividad === CODIGO_AUTOMOVIL && fila.Facilidad_Crediticia !== FACILIDAD_AUTO) {
    alerta = "Automóvil sin facilidad 03";
  }
  return { macro: cat.Macroactividad_Reto, subactividad, alerta };
}

// Calcula rankings de un período: calidad, rankings, desglose por subactividad y reconciliaciones.
export function calcularPeriodo(fecha, filas, catalogos) {
  const { validas, conteo } = depurar(filas, catalogos);
  const bancos = catalogos.bancos.map((b) => b.Codigo_Banco).sort();
  const nombreBanco = Object.fromEntries(catalogos.bancos.map((b) => [b.Codigo_Banco, b.Banco]));

  // Denominador: universo local válido completo del banco (todas las macroactividades).
  const totalBanco = new Map(bancos.map((b) => [b, 0n]));
  const saldoSub = new Map();  // macro|banco|subactividad -> centavos
  const saldoAct = new Map();  // macro|banco -> centavos
  const operaciones = new Map(); // macro|banco -> nº préstamos válidos
  const alertas = [];

  for (const f of validas) {
    const saldo = aCentavos(f.Saldo);
    const { macro, subactividad, alerta } = clasificar(f, catalogos);
    if (alerta) alertas.push({ Numero_Prestamo: f.Numero_Prestamo, alerta });

    totalBanco.set(f.Codigo_Banco, (totalBanco.get(f.Codigo_Banco) ?? 0n) + saldo);
    const kAct = `${macro}|${f.Codigo_Banco}`;
    const kSub = `${kAct}|${subactividad}`;
    saldoAct.set(kAct, (saldoAct.get(kAct) ?? 0n) + saldo);
    saldoSub.set(kSub, (saldoSub.get(kSub) ?? 0n) + saldo);
    operaciones.set(kAct, (operaciones.get(kAct) ?? 0) + 1);
  }

  const macros = [...new Set(catalogos.cinu.map((c) => c.Macroactividad_Reto))];

  const rankings = {};
  for (const macro of macros) {
    const filasRanking = bancos.map((b) => {
      const saldo = saldoAct.get(`${macro}|${b}`) ?? 0n;
      const total = totalBanco.get(b);
      return {
        Fecha: fecha,
        Ranking: macro,
        Codigo_Banco: b,
        Banco: nombreBanco[b],
        Saldo_Actividad: deCentavos(saldo),
        Total_Cartera_Local_Valida: deCentavos(total),
        Ponderacion_Pct: porcentaje4(saldo, total),
        Operaciones_Validas: operaciones.get(`${macro}|${b}`) ?? 0,
        _saldo: saldo,
      };
    });
    // Orden: saldo descendente; empate por Codigo_Banco ascendente.
    filasRanking.sort((a, b) => {
      if (a._saldo !== b._saldo) return a._saldo > b._saldo ? -1 : 1;
      return a.Codigo_Banco < b.Codigo_Banco ? -1 : a.Codigo_Banco > b.Codigo_Banco ? 1 : 0;
    });
    filasRanking.forEach((f, i) => { f.Posicion = i + 1; delete f._saldo; });
    rankings[macro] = filasRanking;
  }

  const desglose = [...saldoSub].map(([k, saldo]) => {
    const [macro, banco, subactividad] = k.split("|");
    return { Fecha: fecha, Ranking: macro, Subactividad: subactividad, Codigo_Banco: banco, Saldo: deCentavos(saldo) };
  });

  // Reconciliaciones (Sección 7).
  const rec1 = [...saldoAct].every(([k, s]) => {
    let suma = 0n;
    for (const [ks, ss] of saldoSub) if (ks.startsWith(`${k}|`)) suma += ss;
    return suma === s;
  });
  const rec2 = bancos.every((b) => {
    let suma = 0n;
    for (const macro of macros) suma += saldoAct.get(`${macro}|${b}`) ?? 0n;
    return suma === totalBanco.get(b);
  });
  const sumaTotales = [...totalBanco.values()].reduce((a, b) => a + b, 0n);
  const sumaValidas = validas.reduce((a, f) => a + aCentavos(f.Saldo), 0n);
  const rec3 = sumaTotales === sumaValidas;

  return {
    fecha,
    calidad: { ...conteo, universo_valido: validas.length, alertas },
    rankings,
    desglose,
    reconciliaciones: { rec1, rec2, rec3 },
  };
}
