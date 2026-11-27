import { test } from "node:test";
import assert from "node:assert/strict";
import { aCentavos, deCentavos, porcentaje4 } from "../src/motor/numeros.js";
import { leerCsv } from "../src/motor/csv.js";
import { calcularPeriodo, depurar } from "../src/motor/rankings.js";

// Catálogos de PRUEBA escritos a mano (ficticios). No son los catálogos oficiales de la SBP.
const catalogos = {
  cinu: [
    { Codigo_CINU: "K.64.649.6492.64921", Macroactividad_Reto: "CONSUMO", Subactividad_Reto: "Credito personal" },
    { Codigo_CINU: "K.64.649.6492.64922", Macroactividad_Reto: "CONSUMO", Subactividad_Reto: "Automovil" },
    { Codigo_CINU: "K.64.649.6499.64991", Macroactividad_Reto: "CONSUMO", Subactividad_Reto: "Tarjeta" },
    { Codigo_CINU: "A.01", Macroactividad_Reto: "AGROPECUARIO", Subactividad_Reto: "Agricultura" },
  ],
  bancos: [
    { Codigo_Banco: "101", Banco: "Banco A" },
    { Codigo_Banco: "102", Banco: "Banco B" },
  ],
  sb21: [],
};

const fila = (o) => ({
  Numero_Prestamo: "P", Destino: "L", Saldo: "100.00", Tipo_Actividad: "A.01",
  Codigo_Banco: "101", Facilidad_Crediticia: "01", Fecha: "20260930", ...o,
});

test("centavos exactos: 1000 sumas de 0.10 dan 100.00 sin error de punto flotante", () => {
  let s = 0n;
  for (let i = 0; i < 1000; i++) s += aCentavos("0.10");
  assert.equal(deCentavos(s), "100.00");
  assert.equal(deCentavos(aCentavos("-3.5")), "-3.50");
});

test("porcentaje redondeado a 4 decimales", () => {
  assert.equal(porcentaje4(1n, 3n), "33.3333");
  assert.equal(porcentaje4(1n, 2n), "50.0000");
  assert.equal(porcentaje4(0n, 5n), "0.0000");
});

test("lector CSV conserva ceros a la izquierda", () => {
  const f = leerCsv("Facilidad_Crediticia,Monto\r\n07,1.00\r\n")[0];
  assert.equal(f.Facilidad_Crediticia, "07");
});

test("cascada E1-E4 cuenta cada fila una sola vez", () => {
  const filas = [
    fila({ Numero_Prestamo: "1" }),
    fila({ Numero_Prestamo: "1" }),                          // E1 duplicado
    fila({ Numero_Prestamo: "2", Destino: "E" }),            // E2 extranjero
    fila({ Numero_Prestamo: "3", Saldo: "0.00" }),           // E3 saldo cero
    fila({ Numero_Prestamo: "4", Tipo_Actividad: "Z.99" }),  // E4 no catalogada
    fila({ Numero_Prestamo: "5", Destino: "E", Saldo: "-1.00" }), // E2 (primer filtro que incumple)
  ];
  const { conteo, validas } = depurar(filas, catalogos);
  assert.deepEqual(
    [conteo.leidas, conteo.E1, conteo.E2, conteo.E3, conteo.E4, conteo.validas],
    [6, 1, 2, 1, 1, 1],
  );
  assert.equal(conteo.leidas, conteo.E1 + conteo.E2 + conteo.E3 + conteo.E4 + validas.length);
});

test("SB21: Credito personal con facilidad 07 pasa a Tarjeta; el total de CONSUMO no cambia", () => {
  const filas = [
    fila({ Numero_Prestamo: "1", Tipo_Actividad: "K.64.649.6492.64921", Facilidad_Crediticia: "07", Saldo: "50.00" }),
    fila({ Numero_Prestamo: "2", Tipo_Actividad: "K.64.649.6492.64921", Facilidad_Crediticia: "01", Saldo: "30.00" }),
  ];
  const r = calcularPeriodo("20260930", filas, catalogos);
  const consumo = r.rankings.CONSUMO.find((x) => x.Codigo_Banco === "101");
  assert.equal(consumo.Saldo_Actividad, "80.00");
  const subs = Object.fromEntries(r.desglose.filter((d) => d.Codigo_Banco === "101").map((d) => [d.Subactividad, d.Saldo]));
  assert.equal(subs["Tarjeta"], "50.00");
  assert.equal(subs["Credito personal"], "30.00");
});

test("ranking con 2 bancos: orden descendente, posiciones y ponderación sobre el total del banco", () => {
  const filas = [
    fila({ Numero_Prestamo: "1", Saldo: "300.00", Codigo_Banco: "101" }),
    fila({ Numero_Prestamo: "2", Saldo: "100.00", Codigo_Banco: "101", Tipo_Actividad: "K.64.649.6492.64921" }),
    fila({ Numero_Prestamo: "3", Saldo: "100.00", Codigo_Banco: "102" }),
  ];
  const r = calcularPeriodo("20260930", filas, catalogos);
  const agro = r.rankings.AGROPECUARIO;
  assert.deepEqual(agro.map((x) => [x.Codigo_Banco, x.Posicion, x.Saldo_Actividad]), [
    ["101", 1, "300.00"],
    ["102", 2, "100.00"],
  ]);
  assert.equal(agro[0].Total_Cartera_Local_Valida, "400.00");
  assert.equal(agro[0].Ponderacion_Pct, "75.0000");
  assert.deepEqual(r.reconciliaciones, { rec1: true, rec2: true, rec3: true });
});

test("empate de saldo: desempate por Codigo_Banco ascendente", () => {
  const filas = [
    fila({ Numero_Prestamo: "1", Saldo: "50.00", Codigo_Banco: "102" }),
    fila({ Numero_Prestamo: "2", Saldo: "50.00", Codigo_Banco: "101" }),
  ];
  const r = calcularPeriodo("20260930", filas, catalogos);
  assert.deepEqual(r.rankings.AGROPECUARIO.map((x) => x.Codigo_Banco), ["101", "102"]);
});
