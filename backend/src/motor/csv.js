// Lector CSV RFC 4180: UTF-8, separador coma, comillas dobles para campos con comas,
// con o sin BOM, CRLF o LF. Encabezado en la primera fila. Los códigos quedan como texto.
export function leerCsv(texto) {
  const filas = parsear(texto.replace(/^﻿/, ""));
  if (filas.length === 0) return [];
  const [encabezado, ...cuerpo] = filas;
  return cuerpo.map((campos) => {
    const fila = {};
    encabezado.forEach((nombre, i) => {
      fila[nombre] = campos[i] ?? "";
    });
    return fila;
  });
}

function parsear(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ",") {
      fila.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((v) => v !== "")) filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    if (fila.some((v) => v !== "")) filas.push(fila);
  }
  return filas;
}
