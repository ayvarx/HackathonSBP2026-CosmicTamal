// scripts/db-setup.mjs — Prepara la base: esquema, motor SQL y catálogos.
// Uso: npm run db:setup
// Sirve igual para Supabase (si .env.local define DATABASE_URL) y para PGlite.
import fs from 'node:fs';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

const { tipoBase, consulta, cerrar } = await import('../lib/db.js');

try {
  // Abrir la conexión ya aplica 01_esquema.sql, 02_motor.sql y carga los catálogos.
  const tipo = await tipoBase();
  const [conteos] = await consulta(`
    SELECT (SELECT COUNT(*) FROM bancos)::int        AS bancos,
           (SELECT COUNT(*) FROM catalogo_cinu)::int AS cinu,
           (SELECT COUNT(*) FROM tabla_sb21)::int    AS sb21,
           (SELECT COUNT(DISTINCT fecha) FROM at03_filas)::int AS periodos`);
  console.log(`Base lista (${tipo}).`);
  console.log(`Catálogos: ${conteos.bancos} bancos, ${conteos.cinu} actividades CINU, ${conteos.sb21} facilidades SB21.`);
  console.log(`Períodos cargados: ${conteos.periodos}. Para cargar los cortes ejecute: npm run db:seed`);
} catch (error) {
  console.error('No se pudo preparar la base:', error.message);
  process.exitCode = 1;
} finally {
  await cerrar();
}
