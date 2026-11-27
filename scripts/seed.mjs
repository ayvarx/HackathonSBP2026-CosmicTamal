// scripts/seed.mjs — Carga cortes AT03 desde la carpeta datos/.
// Uso:
//   npm run db:seed                     -> carga los 3 cortes (202607, 202608, 202609)
//   npm run db:seed -- 202607 202608    -> carga solo esos períodos
//   npm run db:seed -- 202609 --reemplazar  -> vuelve a cargar un período ya cargado
// Un período ya cargado se omite (salvo --reemplazar).
import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

const { cerrar, tipoBase } = await import('../lib/db.js');
const { cargarCorte } = await import('../lib/ingesta.js');

const argumentos = process.argv.slice(2);
const reemplazar = argumentos.includes('--reemplazar');
const pedidos = argumentos.filter((a) => !a.startsWith('--'));

const disponibles = fs.readdirSync('datos')
  .filter((f) => /^AT03_.*\.csv$/i.test(f))
  .sort();
const archivos = pedidos.length
  ? pedidos.map((p) => {
      const encontrado = disponibles.find((f) => f.includes(p));
      if (!encontrado) throw new Error(`No hay un archivo AT03 para "${p}" en datos/. Disponibles: ${disponibles.join(', ')}`);
      return encontrado;
    })
  : disponibles;

try {
  console.log(`Base: ${await tipoBase()}`);
  for (const archivo of archivos) {
    const contenido = fs.readFileSync(path.join('datos', archivo));
    const r = await cargarCorte({ nombreArchivo: archivo, contenido, perfil: 'sistema', reemplazar });
    if (r.ok) {
      const c = r.cascada[0];
      console.log(`✓ ${archivo}: período ${r.periodos.join(', ')}, ${r.filas} filas, universo válido ${c.universo_local_valido} ` +
        `(E1 ${c.e1_duplicados}, E2 ${c.e2_destino_extranjero}, E3 ${c.e3_saldo_no_positivo}, E4 ${c.e4_actividad_no_catalogada}) en ${r.duracion_ms} ms`);
    } else if (/ya está cargado/.test(r.mensaje)) {
      console.log(`- ${archivo}: ya estaba cargado (use --reemplazar para volver a cargarlo).`);
    } else {
      console.error(`✗ ${archivo}: ${r.mensaje}`);
      for (const e of r.errores.slice(0, 10)) console.error(`   · ${e.mensaje}`);
      process.exitCode = 1;
    }
  }
} finally {
  await cerrar();
}
