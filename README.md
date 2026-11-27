# Rankings de crédito por banco y actividad económica

**Equipo CosmicTamal · Hackathon SBP 2026** (Superintendencia de Bancos de Panamá)

Plataforma web que reconstruye, a partir de registros sintéticos con estructura Átomo 03 (AT03), los rankings de crédito de los 12 bancos por macroactividad económica, con reporte de calidad de datos, comparación entre períodos y exportación de los entregables.

> **Aviso: todos los datos son ficticios.** Los bancos, clientes, operaciones y magnitudes son sintéticos y no representan bancos reales ni la estructura del sistema bancario panameño. Cada pantalla de la aplicación muestra este aviso, la fuente y el período.

Las reglas de negocio vienen de `docs/INDICACIONES_RETO_RANKING_CREDITO.md` (si algo difiere de la presentación, prevalece ese documento). El detalle de cada regla implementada está en [`docs/REGLAS.md`](docs/REGLAS.md); este README resume lo esencial y enlaza al archivo donde vive cada una.

## Contenido

1. [Arquitectura](#1-arquitectura)
2. [Instalación y ejecución](#2-instalación-y-ejecución)
3. [Reglas implementadas](#3-reglas-implementadas)
4. [Movimiento significativo (definición del equipo)](#4-movimiento-significativo-definición-del-equipo)
5. [Perfiles y permisos](#5-perfiles-y-permisos)
6. [Automatizaciones y guion de demostración](#6-automatizaciones-y-guion-de-demostración)
7. [Entregables 2 a 5: dónde se descargan y sus columnas](#7-entregables-2-a-5)
8. [Pruebas y cifras de control](#8-pruebas-y-cifras-de-control)
9. [Indicadores adicionales, limitaciones y uso de IA](#9-indicadores-adicionales-limitaciones-y-uso-de-ia)

---

## 1. Arquitectura

```
 Navegador (React, componentes de cliente: gráficos ECharts, tablas ordenables, formularios)
        │  HTTP
        ▼
 Servidor Node.js — Next.js 16 (App Router, JavaScript)
   proxy.js ............ encabezados de seguridad y ruta pedida
   app/ ................ páginas (componentes de servidor) y rutas API (/api/exportar, /api/admin)
   lib/auth.js ......... perfil en cookie firmada + control de acceso en el servidor
   lib/consultas*.js ... única puerta a los datos: solo filtra, ordena y formatea
   lib/ingesta.js ...... valida y carga cortes AT03 y catálogos
   lib/db.js ........... adaptador único a la base
        │  SQL
        ▼
 Postgres  ── DATABASE_URL definida → Supabase (nube)
           └─ DATABASE_URL vacía  → PGlite (Postgres embebido en .pgdata/, sin internet)
        db/01_esquema.sql ... tablas, parámetros, bitácora
        db/02_motor.sql ..... MOTOR DE RANKINGS: vistas v_* con la lógica y tablas res_*
                              con el resultado; función recalcular()
        db/03_indicadores.sql  indicadores adicionales (morosidad, vencimientos, concentración)
```

**Por qué se decidió así**

- **Exactitud.** El saldo se guarda como `NUMERIC(20,2)` y se suma dentro de Postgres. Los montos llegan a JavaScript como texto con 2 decimales y solo se formatean para mostrar; la interfaz nunca suma ni compara dinero con `Number`. Esto evita el desvío de ±0.01 del punto flotante que advierte el reto.
- **Reglas auditables.** Cada regla del reto es una vista SQL legible (`v_cascada`, `v_rankings`, `v_movimientos`, `v_reconciliaciones`...). No hay saldos, porcentajes ni posiciones escritos a mano (R2): todo sale de `at03_filas` y de los catálogos. Para explicar una cifra se abre la vista que la produce.
- **El mismo SQL en la nube y en local.** `lib/db.js` ejecuta exactamente los mismos archivos `db/*.sql` sobre Supabase (paquete `pg`) o sobre PGlite. La demostración no depende de internet.
- **Recalcular sin tocar código.** `recalcular()` vuelve a derivar todo desde las filas cargadas; la ingesta lo llama después de cada carga. Un período nuevo se procesa solo.
- **Estructura de resultados.** Las vistas `v_*` contienen la lógica; las tablas `res_*` guardan su resultado ya calculado para que la aplicación responda en milisegundos.

**Estructura de carpetas**

```
app/            páginas y rutas API (Next.js App Router)
  admin/        carga de cortes, "qué cambió", parámetros, catálogos, bitácora
  api/          exportar/* (CSV) y admin/* (cortes, catálogos, parámetros, resumen)
  calidad/ comparar/ indicadores/ perfil/ rankings/ reportes/ verificacion/
components/     piezas de interfaz reutilizables (gráfico, tabla ordenable, filtros...)
lib/            auth, db, ingesta, consultas por módulo, formato
db/             esquema, motor de rankings e indicadores en SQL
scripts/        db-setup.mjs (preparar base) y seed.mjs (sembrar cortes)
datos/          CSV del reto: 3 cortes AT03 y catálogos; pruebas_invalidas/ con 4 archivos defectuosos
tests/          pruebas automáticas y clave_de_control/ (solo para pruebas)
docs/           indicaciones del reto y reglas detalladas
proxy.js        encabezados de seguridad (en Next 16 "middleware" se llama "proxy")
```

La carpeta `tests/clave_de_control/` es la clave de control oficial: **solo la leen las pruebas**; la aplicación nunca la usa.

## 2. Instalación y ejecución

**Requisitos:** Node.js (el proyecto se desarrolló con Node 26) y npm. No se necesita nada más para el modo sin internet.

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno (el archivo .env.local está en .gitignore: nunca se sube)
cp .env.example .env.local
```

Edite `.env.local`:

| Variable | Para qué | Obligatoria |
| :--- | :--- | :---: |
| `SESSION_SECRET` | Firma de la cookie del perfil. Genere uno con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Si falta o tiene menos de 16 caracteres, se usa un secreto aleatorio temporal y los perfiles elegidos se pierden al reiniciar el servidor. | Recomendada |
| `DATABASE_URL` | Cadena de Postgres de Supabase (Session pooler). **Vacía = base embebida PGlite.** | No |
| `PGLITE_DIR` | Carpeta de la base PGlite (por defecto `.pgdata`; `:memory:` para memoria). Solo aplica si `DATABASE_URL` está vacía. No aparece en `.env.example`. | No |
| `DATABASE_CA_FILE` | Ruta del certificado raíz de Supabase para verificar el servidor; sin ella la conexión va cifrada sin verificar el certificado (uso de demostración). | No |

### Modo A: sin internet (PGlite)

Deje `DATABASE_URL` vacía.

```bash
npm run db:setup      # crea el esquema, el motor SQL y carga los catálogos en .pgdata/
npm run db:seed       # carga los 3 cortes AT03 (julio, agosto y septiembre) y calcula todo
npm run dev           # http://localhost:3000
```

### Modo B: con Supabase

1. En Supabase, copie la cadena de conexión del *Session pooler* y péguela en `DATABASE_URL` dentro de `.env.local` (nunca en un archivo que se suba).
2. Ejecute los mismos tres comandos: `npm run db:setup`, `npm run db:seed`, `npm run dev`. El esquema activa RLS sin políticas y retira permisos a los roles públicos de Supabase (`anon`, `authenticated`); la aplicación se conecta con el rol dueño de las tablas. Requiere Postgres 15 o superior (las vistas usan `security_invoker`).

El equipo usa un rol propio de la aplicación (`app_sbp`, con permiso solo sobre el esquema `public`) en lugar del rol `postgres`. El nombre de usuario en el pooler es `app_sbp.<ref-del-proyecto>`. Cargar un corte en Supabase tarda entre 9 y 14 segundos (en PGlite, unos 3).

### Despliegue en Vercel (opcional)

La misma aplicación está publicada en Vercel y lee de la misma base de Supabase. Las variables `DATABASE_URL` (puerto 6543, modo transacción del pooler, pensado para funciones sin servidor) y `SESSION_SECRET` se definen en el proyecto de Vercel como secretas; no están en el repositorio. `next.config.mjs` incluye en el despliegue el SQL del motor (`db/`) y los catálogos que el servidor lee al arrancar. La demostración ante el jurado se hace en local (R1); Vercel es un extra.

### Comandos disponibles (`package.json`)

| Comando | Qué hace |
| :--- | :--- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` y `npm start` | Compilar y servir en modo producción |
| `npm run db:setup` | Prepara la base (esquema, motor, catálogos) |
| `npm run db:seed` | Carga todos los `datos/AT03_*.csv`. Opciones: `npm run db:seed -- 202607 202608` (solo esos períodos) y `npm run db:seed -- 202609 --reemplazar` (volver a cargar un período ya cargado; sin esa opción se omite) |
| `npm test` | Pruebas contra la clave de control (usan PGlite en memoria; no tocan la base de desarrollo) |
| `npm run lint` | ESLint |
| `npm run setup` | Crea `.env.local` con un `SESSION_SECRET` aleatorio si no existe (no lo muestra) y prepara la base |
| `npm run e2e` | Prueba de punta a punta del guion de demostración sobre una base limpia; deja la evidencia en `tests/resultados/prueba-e2e.txt` |
| `npm run verificar` | `lint` + `test` + `e2e` |

La aplicación también prepara la base sola al primer uso (aplica el esquema y carga los catálogos si están vacíos), pero el flujo anterior deja el entorno listo antes de abrir el navegador. Si cambia `db/02_motor.sql`, el motor se recrea y se recalcula automáticamente en el siguiente arranque (se compara su huella SHA-256).

Para reiniciar la base local: detenga el servidor, borre la carpeta `.pgdata/` y repita `db:setup` y `db:seed`.

## 3. Reglas implementadas

Cada regla vive en un archivo concreto; la explicación completa, con ejemplos, está en [`docs/REGLAS.md`](docs/REGLAS.md).

| Regla del reto | Dónde vive | Resumen |
| :--- | :--- | :--- |
| Formato de los CSV (61 columnas, orden, texto, ceros a la izquierda, `AAAAMMDD`, `NA`) | [`lib/ingesta.js`](lib/ingesta.js) (`analizarCorte`, `validarCorte`) · [`db/01_esquema.sql`](db/01_esquema.sql) (todo como `TEXT`) | Se valida el encabezado contra `datos/Diccionario_datos_AT03_reto.csv`, celdas vacías, fecha real, saldo decimal y ceros perdidos. Un archivo defectuoso se rechaza con mensaje claro (fila y columna) y no entra nada. |
| Período = columna `Fecha` | [`db/02_motor.sql`](db/02_motor.sql) (`v_cascada`) | Todo se calcula por `Fecha`, no por nombre de archivo. |
| Cascada E1–E4, cada fila en el primer filtro que incumple | [`db/02_motor.sql`](db/02_motor.sql) (`v_cascada`, `v_exclusiones`, `v_calidad`) | E1 duplicado (primera ocurrencia por orden de archivo, dentro del período) → E2 `Destino <> 'L'` → E3 `Saldo <= 0` → E4 actividad fuera del CINU. Control: leídas = E1+E2+E3+E4+válidas. |
| Clasificación por CINU | [`db/02_motor.sql`](db/02_motor.sql) (`v_cascada`) | `Tipo_Actividad = Codigo_CINU`; nunca `Codigo_SB08_Referencia`. |
| Regla especial de CONSUMO / SB21 | [`db/02_motor.sql`](db/02_motor.sql) (`v_cascada`, columna `subactividad`; alertas en `v_alertas`) | CINU "Credito personal" con facilidad `07` pasa a "Tarjeta"; solo mueve saldo dentro de CONSUMO. Tarjeta sin `07` o Automóvil sin `03` generan alerta y mantienen la subactividad del catálogo. |
| Agregaciones y rejilla completa | [`db/02_motor.sql`](db/02_motor.sql) (`v_subactividades`, `v_rankings`) | `Saldo_Subactividad`, `Saldo_Actividad_Banco`; cada ranking incluye los 12 bancos (0.00 si no tienen saldo). |
| Denominador `Total_Cartera_Local_Valida_Banco` | [`db/02_motor.sql`](db/02_motor.sql) (`v_rankings`, CTE `cartera`) | Suma de todo el universo válido del banco en el período (las 6 macroactividades), calculada antes de cualquier filtro de ranking. |
| Ponderación a 4 decimales | [`db/02_motor.sql`](db/02_motor.sql) (`v_rankings`) | `ROUND(saldo_actividad * 100 / total, 4)` sobre `NUMERIC` (redondeo aritmético). |
| Ranking y desempate | [`db/02_motor.sql`](db/02_motor.sql) (`v_rankings`) | `ROW_NUMBER()` por saldo descendente y, en empate exacto, `Codigo_Banco` ascendente. |
| Reconciliaciones 1, 2 y 3 | [`db/02_motor.sql`](db/02_motor.sql) (`v_reconciliaciones`); se muestran en `/verificacion` | R1: Σ subactividades = saldo de la actividad. R2: Σ 6 actividades = total del banco. R3: Σ totales de los 12 bancos = Σ saldo del universo. |
| Comparación entre períodos | [`db/02_motor.sql`](db/02_motor.sql) (`v_movimientos`, `v_descomposicion`) | `Cambio_Posicion = anterior − actual` (positivo = sube), `Var_Saldo`, `Var_Saldo_Pct`, cambio de líder; para todos los pares de períodos. |
| Movimiento significativo (configurable) | [`db/01_esquema.sql`](db/01_esquema.sql) (tabla `parametros`) · [`lib/consultas.js`](lib/consultas.js) (`movimientos`) | Ver sección 4. |
| Alertas de integridad referencial | [`db/02_motor.sql`](db/02_motor.sql) (`v_alertas`, `v_calidad.alertas_integridad`) | Banco o facilidad fuera de su catálogo se reporta, sin excluir la fila. |

Restricciones del reto que se respetan: la clasificación usa solo los catálogos suministrados (nada de nombres ni identificaciones del cliente, R3); no se usa la tabla SB19; `Intereses_por_Cobrar`, provisiones y `Valor_Inicial` no intervienen en el `Saldo`.

## 4. Movimiento significativo (definición del equipo)

Para cada banco, ranking y par de períodos, el movimiento es **significativo** si se cumple **al menos una** de estas condiciones:

1. **Salto de posición:** `|Cambio_Posicion| >= min_cambio_posicion` (por defecto **2**).
2. **Cambio de líder:** el banco gana o pierde el primer lugar (se marca en los dos bancos). Activo si `marcar_cambio_lider = si` (por defecto **si**).
3. **Variación de saldo:** `|Var_Saldo_Pct| >= min_var_saldo_pct` (por defecto **20** %).
4. **Entrada al ranking:** el banco pasa de saldo `0.00` a tener saldo (no hay porcentaje definible). Esta condición es fija.

La columna `Motivo` de las exportaciones y de las pantallas indica cuál o cuáles condiciones se cumplieron.

**Es configurable, no está fija en el código.** Los tres umbrales viven en la tabla `parametros` ([`db/01_esquema.sql`](db/01_esquema.sql)). El Administrador los cambia en `/admin/parametros` (o `POST /api/admin/parametros`); cada valor se valida (entero de 1 a 11, `si`/`no`, decimal mayor o igual a 0), el cambio se anota en la bitácora y aplica de inmediato porque la marca se calcula al consultar (`movimientos()` en [`lib/consultas.js`](lib/consultas.js)). La página de parámetros muestra además cuántos movimientos marcaría la regla vigente en cada par de períodos (`efectoRegla()` en [`lib/consultas-admin.js`](lib/consultas-admin.js)).

## 5. Perfiles y permisos

Hay un selector de perfil sin contraseña (`/perfil`), como permite el reto. Los usuarios y contraseñas no existen, así que no hay credenciales en el repositorio (R5).

| Capacidad | Público | Analista | Administrador |
| :--- | :---: | :---: | :---: |
| Consultar rankings, filtros, gráficos y tablas ordenables | Sí | Sí | Sí |
| Reporte de calidad (E1–E4), verificación y reconciliaciones, indicadores | Sí | Sí | Sí |
| Descargar rankings (entregable 2), desglose por subactividad (entregable 3), calidad (entregable 4) y filas excluidas | Sí | Sí | Sí |
| Descargar movimientos (entregable 5) y reporte personalizado | No | Sí | Sí |
| Comparar entidades y períodos (`/comparar`) | No | Sí | Sí |
| Detalle de préstamos (`/rankings/detalle`) | No | Sí | Sí |
| Reportes personalizados y versión imprimible | No | Sí | Sí |
| Cargar o eliminar cortes, ver "qué cambió" (`/admin`, `/admin/resumen`) | No | No | Sí |
| Parámetros, catálogos y bitácora (`/admin/*`) | No | No | Sí |

**Cómo se controla en el servidor.** Ocultar un enlace del menú es solo comodidad visual; el control real está en el servidor ([`lib/auth.js`](lib/auth.js)):

- El perfil se guarda en una cookie `httpOnly` firmada con HMAC-SHA256 (`perfil.emitidoEn.firma`), con vigencia de 8 horas. El secreto sale de `SESSION_SECRET` (`.env.local`). Una cookie alterada no valida la firma y el visitante pasa a Público.
- Cada página protegida llama a `exigirPerfil(...)` antes de consultar datos y redirige a `/acceso-restringido` si no alcanza.
- Cada ruta API llama a `exigirPerfilApi(...)` y responde `403` en JSON; así `curl` tampoco se salta el perfil.
- Las funciones que escriben datos (`cargarCorte`, `cargarCatalogo`, `eliminarPeriodo`, `guardarParametro`) comprueban el perfil de nuevo (segunda barrera) y los intentos rechazados quedan en la bitácora.
- La cookie la escribe una acción de servidor ([`app/perfil/acciones.js`](app/perfil/acciones.js)), que solo acepta los tres perfiles conocidos; `proxy.js` agrega encabezados de seguridad y no decide permisos.

## 6. Automatizaciones y guion de demostración

**Automatizaciones implementadas (lámina 8)**

| Automatización | Cómo se logra |
| :--- | :--- |
| Cargar un nuevo período y recalcular sin editar código | `cargarCorte()` valida, inserta y llama a `recalcular()` dentro de una transacción (todo o nada). |
| Comparar dos períodos | `v_movimientos` compara todos los pares; pantalla `/comparar`. |
| Señalar movimientos con regla configurable | Parámetros en `/admin/parametros`; marca y `Motivo` en cada movimiento. |
| Explicar automáticamente los principales movimientos | `v_descomposicion` separa la variación de saldo en préstamos nuevos, salidos y variación de los que continúan (suman exactamente `Var_Saldo`); `explicarMovimiento()` redacta el texto con plantillas fijas ([`lib/consultas-admin.js`](lib/consultas-admin.js)). Es determinista y no usa IA. |
| Preparar un reporte descargable | CSV de movimientos desde "qué cambió" y desde `/comparar`; reporte personalizado en CSV y versión imprimible (`/reportes/imprimir`). |
| Validación de archivos con mensajes claros | `datos/pruebas_invalidas/` trae 4 archivos defectuosos (columnas faltantes, ceros perdidos, no es CSV, fecha inválida) para mostrar el rechazo. |

**Guion de demostración (cargar septiembre como Administrador)**

1. Deje la base solo con julio y agosto: `npm run db:setup` y `npm run db:seed -- 202607 202608` (en una base limpia, es decir sin `.pgdata/`).
2. `npm run dev` y abra `http://localhost:3000`. Como **Público** (perfil por defecto) muestre Panel, Rankings, Calidad y Verificación con dos períodos; intente abrir `/admin` y muestre que redirige a "acceso restringido".
3. En `/perfil` elija **Administrador**. En `/admin` suba `datos/AT03_sintetico_202609.csv` (opcional: antes suba uno de `datos/pruebas_invalidas/` para mostrar el mensaje de rechazo; no se carga nada y queda en la bitácora).
4. Al terminar la carga se abre **"Qué cambió con este corte"** (`/admin/resumen`): cascada de septiembre, cambios de líder y movimientos significativos frente a agosto, cada uno con su explicación automática y el enlace al reporte descargable.
5. En `/admin/parametros` cambie `min_cambio_posicion` y vea cómo cambia la cantidad de movimientos significativos sin tocar código. En `/admin/bitacora` muestre quién cargó qué y cuándo.
6. Cambie a **Analista** y abra `/comparar` y `/rankings/detalle` (traza la cifra de un ranking préstamo por préstamo). En `/verificacion` se ven los seis puntos que revisa el jurado con sus reconciliaciones.

## 7. Entregables 2 a 5

Todas las descargas son CSV UTF-8, coma como separador, fin de línea CRLF, montos con 2 decimales y ponderación con 4. Filtros opcionales por URL (`fecha` o `periodo`, `ranking`, `banco`). En la aplicación están en `/reportes`, `/rankings`, `/calidad` y `/verificacion`.

| Entregable | Ruta | Perfil mínimo | Columnas |
| :--- | :--- | :---: | :--- |
| 2. Rankings por período | `/api/exportar/rankings` | Público | `Fecha, Ranking, Posicion, Codigo_Banco, Banco, Saldo_Actividad, Total_Cartera_Local_Valida, Ponderacion_Pct, Operaciones_Validas` |
| 3. Desglose por subactividad | `/api/exportar/subactividades` | Público | `Fecha, Ranking, Subactividad, Codigo_Banco, Saldo` |
| 4. Calidad de datos | `/api/exportar/calidad` | Público | `Fecha, Filas_Leidas, E1_Duplicados, E2_Destino_Extranjero, E3_Saldo_No_Positivo, E4_Actividad_No_Catalogada, Universo_Local_Valido, Saldo_Universo_Local_Valido, Cuadre_Cascada, Indep_Duplicados, Indep_Destino_Extranjero, Indep_Saldo_No_Positivo, Indep_Actividad_No_Catalogada, Alertas_Integridad` |
| (apoyo del 4) Filas excluidas | `/api/exportar/exclusiones` | Público | `Fecha, Archivo, Fila_Archivo, Numero_Prestamo, Filtro, Codigo_Banco, Destino, Saldo, Tipo_Actividad` |
| 5. Movimientos de posición | `/api/exportar/movimientos` (`anterior`, `actual`, `ranking`) | Analista | `Fecha_Anterior, Fecha_Actual, Ranking, Codigo_Banco, Banco, Posicion_Anterior, Posicion_Actual, Cambio_Posicion, Saldo_Anterior, Saldo_Actual, Var_Saldo, Var_Saldo_Pct, Cambio_De_Lider`; con `extendido=1` agrega `Significativo, Motivo` |
| Reporte personalizado | `/api/exportar/personalizado` (`fechas`, `rankings`, `bancos`, `columnas`) | Analista | Las columnas del entregable 2 que se elijan |

Los conteos `Indep_*` son conteos independientes de cada regla sobre todas las filas leídas; se presentan aparte y rotulados como tales, porque una fila puede incumplir varias reglas (en la cascada cuenta solo en el primero). Cada descarga queda anotada en la bitácora.

## 8. Pruebas y cifras de control

```bash
npm test      # node --test tests/
npm run e2e   # guion de demostración de punta a punta (evidencia en tests/resultados/prueba-e2e.txt)
```

Además, con la aplicación conectada a Supabase se descargaron las cinco exportaciones completas y se compararon con la clave de control: 216 filas de rankings, 792 de subactividades, 3 de calidad, 3,284 exclusiones y 216 movimientos, todas idénticas.

Las pruebas cargan los 3 cortes en PGlite en memoria y comparan, campo por campo y como texto exacto, contra `tests/clave_de_control/*.csv`:

| Prueba | Qué comprueba |
| :--- | :--- |
| Calidad | E1–E4 y universo válido idénticos a `control_calidad.csv` |
| Exclusiones | las 3,284 filas excluidas con su filtro, idénticas a `control_exclusiones.csv` |
| Rankings | 216 celdas (posición, saldos al centavo, total de cartera, ponderación a 4 decimales) |
| Subactividades | 792 celdas, con la reclasificación SB21 a Tarjeta |
| Movimientos | 216 filas entre todos los pares de períodos |
| Reconciliaciones | 1, 2 y 3 cuadran al centavo en los 3 períodos |
| Unicidad y descomposición | ningún `Numero_Prestamo` repetido en el universo válido; nuevos + salidos + continúan = `Var_Saldo` |
| Automatización | con julio y agosto cargados, septiembre se agrega sin tocar código |
| Parámetros y cargas | la regla de movimiento significativo cambia con los parámetros; un período repetido se rechaza y con "reemplazar" se sustituye; cada archivo inválido da su mensaje |
| Exportaciones | cada CSV completo coincide con la clave (encabezados y filas); filtros, reporte personalizado y entradas inválidas |

**Cifras de control de la cascada por período** (de `tests/clave_de_control/control_calidad.csv`, que las pruebas verifican contra la aplicación):

| Período | Filas leídas | E1 | E2 | E3 | E4 | Universo local válido | Saldo del universo válido |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260731 | 25,000 | 20 | 886 | 48 | 42 | 24,004 | 4,342,391,663.85 |
| 20260831 | 27,500 | 25 | 967 | 52 | 46 | 26,410 | 4,733,510,382.80 |
| 20260930 | 30,000 | 30 | 1,058 | 58 | 52 | 28,802 | 5,152,103,850.27 |

En cada período se cumple `filas leídas = E1 + E2 + E3 + E4 + universo válido`.

## 9. Indicadores adicionales, limitaciones y uso de IA

**Indicadores adicionales** (`/indicadores`, [`db/03_indicadores.sql`](db/03_indicadores.sql)). No sustituyen a los 6 rankings; se calculan sobre el universo local válido y con `NUMERIC` exacto:

- Morosidad = saldo vencido (suma de los 7 tramos `Monto_Vencido_*`) ÷ saldo, y mora mayor a 90 días (saldo de préstamos con `Dias_Mora > 90` ÷ saldo).
- Escalera de vencimientos (tramos `Monto_por_Vencer_*` y `Monto_Vencido_*`).
- Tasa de interés promedio ponderada por saldo.
- Participación de cada banco en cada actividad, concentración del mercado (HHI y participación de los 3 mayores) y concentración de la cartera de cada banco por macroactividad.
- Evolución de morosidad y tasa entre períodos.

**Limitaciones conocidas**

- El selector de perfil no autentica a nadie: es lo que el reto permite, no seguridad de nivel productivo.
- Los datos son sintéticos; las magnitudes y la composición no representan al sistema bancario real.
- No se probó con muchos usuarios simultáneos.
- Con Supabase, si no se define `DATABASE_CA_FILE` la conexión se cifra pero no se verifica el certificado del servidor.
- Un corte se identifica por su columna `Fecha`; para sustituir un período ya cargado hay que pedirlo expresamente (opción "reemplazar" o `--reemplazar`).
- `recalcular()` vuelve a calcular todos los períodos en cada carga o borrado de un corte; con cortes mucho más grandes que los del reto el tiempo de carga crecería.
- Las descargas de movimientos y el reporte personalizado requieren perfil Analista o superior; las demás son públicas (ver sección 5).

**Uso de IA.** La inteligencia artificial no interviene en el cálculo de los rankings, en la clasificación ni en las explicaciones de la aplicación. Todo es SQL determinista y plantillas de texto fijas, reproducible con los mismos datos.
