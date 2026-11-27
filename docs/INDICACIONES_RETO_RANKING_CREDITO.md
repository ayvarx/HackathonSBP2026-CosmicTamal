# Reto: Reconstrucción automatizada de rankings de crédito y análisis bancario

**Hackathon SBP 2026 · Versión 2 del paquete para equipos**

## 1. Propósito
Desarrollar una solución reproducible e interactiva que transforme registros sintéticos con estructura regulatoria **Átomo 03 (AT03)** en **rankings de crédito por banco y actividad económica**. La solución debe usar los catálogos de referencia suministrados y reglas explícitas de calidad, clasificación, agregación, comparación entre meses y trazabilidad.

La presentación `Hackathon_SBP_2026.pptx` describe el producto esperado: módulos, perfiles, lineamientos técnicos y criterios de evaluación. Este documento define **las reglas de cálculo, los entregables y la forma de evaluación**. **Si hay cualquier diferencia entre la presentación y este documento, prevalece este documento.**

## 2. Archivos del paquete (`datos/`)
| Archivo | Contenido |
| :--- | :--- |
| `AT03_sintetico_202607.csv` | Corte julio 2026 (`Fecha = 20260731`), **25,000 filas**, 61 campos |
| `AT03_sintetico_202608.csv` | Corte agosto 2026 (`Fecha = 20260831`), **27,500 filas**, 61 campos |
| `AT03_sintetico_202609.csv` | Corte septiembre 2026 (`Fecha = 20260930`), **30,000 filas**, 61 campos (período más reciente) |
| `Catalogo_CINU_SB109_reto.csv` | Catálogo congelado de 22 actividades económicas, agrupadas en 6 macroactividades y 22 subactividades |
| `Tabla_SB21_simplificada.csv` | Catálogo de facilidades crediticias (`01`, `02`, `03`, `04`, `05`, `07`) |
| `Bancos_ficticios.csv` | 12 bancos ficticios de licencia general (`101` a `112`) |
| `Diccionario_datos_AT03_reto.csv` | Descripción, tipo y regla de uso de cada uno de los 61 campos AT03 |

Los archivos AT03 contienen **casos de calidad intencionales**: duplicados, operaciones extranjeras, saldos cero o negativos y códigos de actividad no catalogados. Detectarlos es parte del reto.

> **SB19:** la tabla SB19 no forma parte del paquete ni es necesaria. `Clasificacion_Prestamo` se incluye solo como contexto estructural y no interviene en los rankings.

### 2.1 Formato técnico de los CSV (léalo antes de importar)
- Codificación UTF-8 sin BOM, separador coma (`,`), punto decimal (`.`) y fin de línea CRLF. La primera fila es el encabezado.
- Los montos vienen con 2 decimales y sin separador de miles.
- `NA` (texto literal) significa *no aplica*. No hay celdas vacías.
- **Los códigos son texto y conservan los ceros a la izquierda**: `Facilidad_Crediticia = 07`, `Tipo_Credito = 001`, `Codigo_Region = 010`, `Primera_Garantia = 0701`, etc. Si abre los archivos en Excel o los importa con detección automática de tipos, esos ceros se pierden (por ejemplo, `07` se convierte en `7`) y las reglas de la Sección 6 dejan de funcionar. Importe esas columnas como texto.
- Las fechas tienen formato `AAAAMMDD` (texto de 8 dígitos).
- Las comparaciones de códigos son exactas, distinguen mayúsculas y no admiten espacios. Por ejemplo, `Destino` vale exactamente `L` o `E`.

## 3. Supuestos del escenario
- **Tres períodos mensuales consecutivos**: julio (`20260731`), agosto (`20260831`) y septiembre de 2026 (`20260930`, período de referencia más reciente). El período de cada fila se toma del campo `Fecha`, no del nombre del archivo.
- Todos los bancos son ficticios y de licencia general. Los datos son **individuales por banco**, no consolidados (`Codigo_Subsidiaria = NA` en todas las filas).
- Todos los clientes, identificaciones y operaciones son 100% sintéticos y no corresponden a personas ni entidades reales. Las magnitudes, el crecimiento mensual y la composición por sector **no representan la estructura real del sistema bancario panameño**. La aplicación debe indicar claramente que muestra datos ficticios (lámina 9 de la presentación).
- Un mismo `Numero_Prestamo` puede aparecer en varios meses mientras está vigente (amortizando saldo). Cada mes se originan préstamos nuevos y otros vencen. **Dentro de un mismo período, cada `Numero_Prestamo` válido debe ser único.**
- El catálogo `Catalogo_CINU_SB109_reto.csv` está congelado y es la única versión válida.
- La moneda es una unidad monetaria homogénea; no se requiere conversión cambiaria.

## 4. Flujo lógico obligatorio (se aplica a cada período `Fecha` por separado)

**A. Ingesta y validación**
1. Ingerir los archivos AT03, el catálogo CINU/SB109, la tabla SB21 y el catálogo de bancos.
2. Validar el esquema: 61 columnas con los nombres y el orden del diccionario, tipos de datos y campos mínimos. Verificar también la integridad referencial (Sección 7). Un código de banco o de facilidad que no exista en su catálogo debe **reportarse como alerta de calidad**, pero no es una causal de exclusión adicional.

**B. Exclusiones en cascada.** Cada filtro se aplica solo sobre las filas que superaron el anterior, y cada fila excluida se cuenta **una sola vez**, en el primer filtro que incumple:

| Filtro | Regla | Se aplica sobre |
| :---: | :--- | :--- |
| **E1 — Duplicados** | Para cada `Numero_Prestamo` repetido dentro del mismo período, conservar la **primera ocurrencia según el orden de filas del archivo**. Las filas siguientes se excluyen. | Todas las filas del período |
| **E2 — Destino extranjero** | Excluir `Destino <> 'L'` | Filas únicas resultantes de E1 |
| **E3 — Saldo no positivo** | Excluir `Saldo <= 0` (saldo cero o negativo) | Filas locales resultantes de E2 |
| **E4 — Actividad no catalogada** | Excluir si `Tipo_Actividad` no existe en `Catalogo_CINU_SB109_reto.Codigo_CINU` | Filas resultantes de E3 |

El conjunto que queda después de E4 es el **universo local válido** del período. Debe cumplirse: `filas leídas = E1 + E2 + E3 + E4 + universo local válido`.

> Una misma fila puede incumplir varias reglas a la vez (por ejemplo, ser extranjera y tener saldo negativo). En el reporte oficial **cuenta solo en el primer filtro de la cascada**. Si además quiere mostrar el conteo independiente de cada regla, preséntelo aparte y rotúlelo como tal.

**C. Clasificación y agregación**

3. Relacionar `AT03.Tipo_Actividad = CINU.Codigo_CINU`. No use `Codigo_SB08_Referencia` como llave: es solo referencial y el código `2103` se repite en dos subactividades.
4. Obtener `Macroactividad_Reto` y `Subactividad_Reto` desde el catálogo y aplicar la **regla especial de CONSUMO** (Sección 6).
5. Agrupar por `Fecha + Macroactividad_Reto + Codigo_Banco + Subactividad_Reto` y calcular `Saldo_Subactividad = SUM(Saldo)`.
6. Calcular `Saldo_Actividad_Banco = SUM(Saldo_Subactividad)` por `Fecha + Macroactividad_Reto + Codigo_Banco`.
7. Calcular `Total_Cartera_Local_Valida_Banco = SUM(Saldo)` sobre **todo el universo local válido del banco en ese período**. Incluye las 6 macroactividades, aunque el usuario solo consulte o filtre algunos rankings. **No calcule este denominador después de filtrar por ranking.**
8. Calcular `Ponderacion_Pct = Saldo_Actividad_Banco / Total_Cartera_Local_Valida_Banco × 100`. Reportarlo **redondeado a 4 decimales** (redondeo aritmético). Por el redondeo, la suma de las 6 ponderaciones de un banco puede diferir de `100.0000` en la cuarta cifra decimal.
9. Ordenar cada ranking (por `Fecha` y `Macroactividad_Reto`) por `Saldo_Actividad_Banco` descendente y asignar `Posicion = 1` al mayor saldo. **Desempate:** si dos bancos tuvieran exactamente el mismo saldo, se ordenan por `Codigo_Banco` ascendente. Cada ranking siempre incluye los **12 bancos**; un banco sin saldo en una actividad aparece con saldo `0.00`.

**Precisión numérica:** sume los saldos con aritmética exacta (decimal o centavos enteros) y reporte los montos con 2 decimales. Con punto flotante binario, una suma de miles de valores puede diferir en ±0.01 del valor exacto.

## 5. Rankings requeridos
- **Obligatorios:** `HIPOTECARIO`, `CONSTRUCCION`, `INDUSTRIA` y `AGROPECUARIO`.
- **Recomendado adicional:** `COMERCIO`.
- **Bonus:** `CONSUMO`.

El nombre de cada ranking es exactamente el valor de `Macroactividad_Reto` del catálogo.

### Composición por subactividad (22 en total)
| Ranking | Subactividades |
| :--- | :--- |
| HIPOTECARIO | Vivienda propia · Local comercial |
| CONSTRUCCION | Vivienda interino · Local comercial interino · Infraestructura · Otras construcciones |
| INDUSTRIA | Alimentos, bebidas y tabaco · Vestidos y zapatos · Acero y materiales de construccion · Petroleo y derivados · Produccion y generacion electrica · Otras industrias manufactureras |
| AGROPECUARIO | Agricultura · Ganaderia · Pesca · Forestal |
| COMERCIO | Mayorista · Minorista · Servicios |
| CONSUMO | Credito personal · Automovil · Tarjeta |

## 6. Regla especial de CONSUMO (cruce con `Tabla_SB21_simplificada.csv`)
Se aplica sobre el universo local válido. La clasificación por subactividad se decide así:

| `Tipo_Actividad` (CINU) | `Facilidad_Crediticia` | Subactividad a usar |
| :--- | :---: | :--- |
| `K.64.649.6492.64921` (Crédito personal) | `07` (Tarjeta de crédito) | **Tarjeta** (reclasificar) |
| `K.64.649.6492.64921` (Crédito personal) | cualquier otro código | Credito personal |
| `K.64.649.6492.64922` (Automóvil) | `03` (Préstamo de auto) | Automovil |
| `K.64.649.6499.64991` (Tarjeta) | `07` (Tarjeta de crédito) | Tarjeta |

- Las operaciones con CINU de Crédito personal y facilidad `07` son en realidad tarjetas de crédito. Se **reclasifican a `Tarjeta` y se restan de `Credito personal`**, de modo que ninguna operación se cuente dos veces.
- La reclasificación **solo mueve saldo entre subactividades de CONSUMO**: no cambia `Saldo_Actividad_Banco` de CONSUMO ni de ningún otro ranking.
- Control de coherencia: toda operación con CINU de Tarjeta debe tener facilidad `07` y toda operación con CINU de Automóvil debe tener facilidad `03`. Si su validación encontrara una que no cumple, **repórtela como alerta y mantenga la subactividad que indica el catálogo CINU**. No la excluya.

## 7. Controles mínimos de calidad y reconciliación
- **Integridad referencial:** `Codigo_Banco` contra `Bancos_ficticios.csv`, `Tipo_Actividad` contra `Catalogo_CINU_SB109_reto.csv` y `Facilidad_Crediticia` contra `Tabla_SB21_simplificada.csv`.
- **Unicidad** de `Numero_Prestamo` dentro de cada período después de la depuración.
- **Exclusión auditable:** conteo en cascada (E1–E4) y lista trazable de las filas excluidas y del motivo.
- **Reconciliación 1:** para cada banco, ranking y período, la suma de `Saldo_Subactividad` es exactamente igual a `Saldo_Actividad_Banco`.
- **Reconciliación 2:** para cada banco y período, la suma de `Saldo_Actividad_Banco` de las 6 macroactividades es exactamente igual a `Total_Cartera_Local_Valida_Banco`.
- **Reconciliación 3 (recomendada):** la suma de `Total_Cartera_Local_Valida_Banco` de los 12 bancos es igual a la suma de `Saldo` del universo local válido del período.
- **Comparabilidad intermensual:** comparar al menos dos períodos y señalar los cambios de posición al cargar un nuevo corte.

## 8. Comparación entre períodos y movimientos de posición
- Comparar cada ranking entre **períodos consecutivos** (julio → agosto y agosto → septiembre). Opcionalmente, compare también el primer y el último período (julio → septiembre).
- Definición: `Cambio_Posicion = Posicion_periodo_anterior − Posicion_periodo_actual`. Un valor positivo significa que el banco **sube** (mejora su posición); uno negativo, que **baja**; y `0`, que **se mantiene**.
- Variación de saldo: `Var_Saldo = Saldo_actual − Saldo_anterior` y `Var_Saldo_Pct = Var_Saldo / Saldo_anterior × 100`.
- Cada equipo define y documenta en su README qué considera un **movimiento significativo** (por ejemplo, `|Cambio_Posicion| >= 2`, un cambio de líder o una variación de saldo mayor a un umbral). La regla debe ser configurable, no fija en el código.

## 9. Restricciones
- Prohibido usar nombres, identificaciones o características del cliente para clasificar la actividad económica.
- Prohibido codificar manualmente saldos finales, porcentajes o posiciones de los bancos.
- Toda clasificación debe provenir exclusivamente de los catálogos suministrados y de las reglas de este documento.
- No es necesario utilizar la tabla SB19.
- La inteligencia artificial puede apoyar la consulta, la explicación o la exploración, pero no sustituye el cálculo de los rankings, que debe ser determinista y reproducible.

## 10. Entregables del equipo
1. Prototipo funcional ejecutable localmente, con código fuente documentado (lineamientos técnicos en la lámina 7 de la presentación).
2. Exportación de rankings por período con las columnas: `Fecha`, `Ranking`, `Posicion`, `Codigo_Banco`, `Banco`, `Saldo_Actividad`, `Total_Cartera_Local_Valida`, `Ponderacion_Pct`. Se recomienda agregar `Operaciones_Validas` (número de préstamos que suman el saldo).
3. Desglose exportable por subactividad: `Fecha`, `Ranking`, `Subactividad`, `Codigo_Banco`, `Saldo`.
4. Reporte de calidad de datos por período con los conteos en cascada E1–E4 y el universo local válido.
5. Reporte de movimientos de posición entre períodos (Sección 8).
6. `README` con arquitectura, instrucciones de instalación y ejecución, y explicación de las reglas implementadas.
7. Evidencia de que el proceso calcula automáticamente un nuevo período y detecta variaciones de ranking sin editar manualmente la lógica. Por ejemplo, procesar julio y agosto y luego cargar septiembre.
8. Los **tres perfiles de la lámina 6**, cada uno con opciones distintas:
   - **Público:** consulta rankings, aplica filtros, ve gráficos y tablas y descarga información.
   - **Analista:** además compara entidades y períodos y genera reportes personalizados.
   - **Administrador:** además carga o actualiza un período, administra parámetros y catálogos y consulta un registro básico de operaciones (por ejemplo, qué archivo se cargó y cuándo).

   Basta con un inicio de sesión local o un selector de perfil; no se exige seguridad de nivel productivo. Si usa usuarios de prueba con contraseña, créelos al instalar (por ejemplo, desde un archivo `.env` que no se sube al repositorio): **las contraseñas en el repositorio restan puntos (R5)**.

## 11. Cómo se evaluará
El jurado usa una planilla con **los mismos criterios, puntajes y descripciones de esta sección**. Son los mismos 7 criterios de la lámina 10 de la presentación, que los resume. Total: **100 puntos**.

| # | Criterio | Puntos | Qué esperamos de su equipo |
| :---: | :--- | :---: | :--- |
| 1 | **Exactitud de datos y rankings** | **25** | Reporte de calidad con E1–E4 y universo válido; los rankings con posición, saldo, total de cartera y ponderación correctos en los 3 períodos; desglose por subactividad con la regla SB21; reconciliaciones cuadradas. Se compara contra una clave oficial (Sección 11.1). |
| 2 | **Funcionalidad de la plataforma** | **15** | Los 5 módulos de la lámina 5: panel principal con resumen; consulta de rankings por período e indicador con la posición de cada banco; filtros por período, banco, ranking y subactividad; gráficos interactivos y tablas ordenables; reportes y exportación de los entregables 2 a 5. Además, los 3 perfiles de la lámina 6 con opciones diferenciadas (entregable 8). |
| 3 | **Automatización y comparación entre períodos** | **15** | Automatizaciones de la lámina 8: cargar un nuevo período y recalcular sin editar código; comparar dos períodos; señalar movimientos de posición con una regla configurable (Sección 8); explicar automáticamente los principales movimientos; preparar un reporte descargable. Mínimo una; más y mejores suman más puntos. |
| 4 | **Usabilidad y experiencia** | **15** | Navegación clara y consistente, comprensible para los perfiles público, analista y administrador (lámina 6); muestra la fuente, el período y el aviso de datos ficticios (lámina 9); mensajes claros ante errores o archivos inválidos. |
| 5 | **Calidad técnica** | **10** | Arquitectura según la lámina 7 (React + Node.js, ejecución local); código organizado y legible; control básico de acceso por perfil; evidencia de pruebas; resultados reproducibles. (El `README` y la ausencia de credenciales se verifican en R4 y R5, Sección 11.2.) |
| 6 | **Innovación** | **10** | Visualizaciones creativas, uso pertinente de IA (consulta, explicación o exploración, nunca para calcular rankings) e indicadores o análisis adicionales útiles, como morosidad, concentración o vencimientos. |
| 7 | **Presentación y demostración** | **10** | Claridad del problema y de la propuesta, demostración funcional en vivo y justificación de las decisiones técnicas y de diseño. (Que todos los integrantes expliquen el código se verifica en R6, Sección 11.2.) |

### 11.1 Cómo se califica el criterio 1 (Exactitud de datos y rankings)
Es la parte mecánica del reto. El jurado compara sus exportaciones (entregables 2, 3 y 4) contra una **clave oficial** calculada con estas mismas reglas. Se revisan seis puntos, de aproximadamente 4 puntos cada uno:
1. **Reporte de calidad:** conteos E1–E4 y universo local válido por período.
2. **Rankings obligatorios** (HIPOTECARIO, CONSTRUCCION, INDUSTRIA, AGROPECUARIO): posiciones y saldos.
3. **Rankings COMERCIO y CONSUMO:** posiciones y saldos.
4. **Ponderación:** `Total_Cartera_Local_Valida` y `Ponderacion_Pct` con el denominador correcto.
5. **Desglose por subactividad**, incluida la reclasificación SB21 a Tarjeta.
6. **Los 3 períodos** procesados y las reconciliaciones 1 y 2 cuadradas.

Durante la evaluación, el jurado les pedirá que muestren en su aplicación o en sus exportaciones un dato de cada punto. Cada punto se marca como correcto o incorrecto (no hay crédito parcial); si no pueden mostrar el dato, cuenta como incorrecto.

Tolerancia: ±0.01 en montos y ±0.0001 en `Ponderacion_Pct`. Las posiciones deben coincidir exactamente.

### 11.2 Requisitos mínimos y descuentos
El jurado marca cada requisito con Sí o No. **Si su equipo no cumple un requisito, se le resta el puntaje indicado en el criterio que ese requisito afecta.** Cada criterio se califica primero de forma normal y el descuento se aplica después. Ningún criterio baja de 0, y lo que cubre un requisito no se penaliza otra vez dentro del criterio.

| Requisito | Si no se cumple |
| :--- | :--- |
| **R1** — El prototipo se ejecuta localmente durante la demostración. | −10 en el criterio 2 (Funcionalidad de la plataforma) |
| **R2** — Los rankings se calculan desde los archivos; no hay saldos, porcentajes ni posiciones fijados a mano en el código. | −25 en el criterio 1 (Exactitud de datos y rankings): el criterio queda en 0 |
| **R3** — La clasificación usa solo los catálogos suministrados (no nombres ni datos del cliente). | −10 en el criterio 1 (Exactitud de datos y rankings) |
| **R4** — El repositorio contiene el código fuente y un `README` con instalación, ejecución y reglas implementadas. | −5 en el criterio 5 (Calidad técnica) |
| **R5** — No hay contraseñas, tokens ni llaves en el repositorio. | −5 en el criterio 5 (Calidad técnica) |
| **R6** — Los integrantes explican el código, la arquitectura y las decisiones técnicas. | −5 en el criterio 7 (Presentación y demostración) |

Ejemplo: un equipo obtiene 8 de 10 en Calidad técnica, pero su repositorio contiene una contraseña (R5). Su puntaje en ese criterio queda en 8 − 5 = 3.

## 12. Lista de autoverificación antes de entregar
- [ ] Mis CSV se leyeron con 61 columnas y los códigos conservan sus ceros a la izquierda (`07`, no `7`).
- [ ] Para cada período: `filas leídas = E1 + E2 + E3 + E4 + universo local válido`.
- [ ] Ningún `Numero_Prestamo` se repite en el universo local válido de un período.
- [ ] Cada ranking tiene 12 bancos y posiciones de 1 a 12 sin huecos.
- [ ] Las reconciliaciones 1 y 2 cuadran **al centavo** para los 12 bancos.
- [ ] El total de CONSUMO por banco es igual con o sin la regla SB21; lo único que cambia es el reparto entre Credito personal y Tarjeta.
- [ ] El denominador `Total_Cartera_Local_Valida` es el mismo en los 6 rankings de un banco en un mismo período.
- [ ] Al agregar un nuevo archivo de corte, el sistema lo procesa y compara sin cambiar el código.
- [ ] Como Público no puedo cargar un período; como Administrador sí. El jurado lo probará en vivo.
- [ ] Puedo mostrar en vivo, en la aplicación o en mis exportaciones, el universo local válido, las posiciones y saldos de cada ranking, la ponderación y el desglose por subactividad de cualquier período.
- [ ] No hay contraseñas, tokens ni llaves en el repositorio.

## 13. Preguntas frecuentes
- **¿Debo unir los tres archivos?** Puede cargarlos juntos, pero las exclusiones, la deduplicación y los rankings se calculan **por período** (`Fecha`). Un préstamo presente en julio y agosto no es un duplicado.
- **¿Qué hago con `Intereses_por_Cobrar`, provisiones o `Valor_Inicial`?** No se suman ni se restan del `Saldo`. Puede usarlos en análisis exploratorios y visualizaciones adicionales.
- **¿Los tramos `Monto_por_Vencer_*` / `Monto_Vencido_*` intervienen en el ranking?** No. Sirven para análisis de vencimientos y morosidad; para los préstamos con `Saldo > 0` su suma es igual al `Saldo`.
- **¿Puedo agregar indicadores propios** (morosidad, concentración, tasa promedio)? Sí, como valor agregado. Esos indicadores no sustituyen los 6 rankings definidos.
- **¿Los perfiles necesitan un inicio de sesión con contraseña?** No es obligatorio. Basta con un selector de perfil o un inicio de sesión local, siempre que cada perfil vea solo sus opciones (entregable 8). Si usa contraseñas, no las guarde en el repositorio (R5).
- **¿La presentación y este documento dicen cosas distintas?** Si encuentra una diferencia, prevalece este documento.
