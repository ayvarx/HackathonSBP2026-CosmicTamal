# Reglas implementadas, una por una

Detalle de cómo la plataforma aplica cada regla de `INDICACIONES_RETO_RANKING_CREDITO.md`. Cada sección indica el archivo y el objeto SQL donde vive la regla. Todo el cálculo se hace en Postgres con `NUMERIC` exacto; los archivos son [`db/01_esquema.sql`](../db/01_esquema.sql), [`db/02_motor.sql`](../db/02_motor.sql) y [`db/03_indicadores.sql`](../db/03_indicadores.sql).

Flujo general: `at03_filas` (filas tal cual llegan) → `v_cascada` (E1–E4 y clasificación, fila por fila) → `res_filas` → `v_universo` (filas válidas) → `v_subactividades` / `v_rankings` → `v_movimientos` → `v_reconciliaciones`. La función `recalcular()` llena las tablas `res_*` desde las vistas `v_*` y la ingesta la llama después de cada carga.

## 1. Formato de los CSV y validación de la carga

Archivo: [`lib/ingesta.js`](../lib/ingesta.js) (`analizarCorte`, `validarCorte`, `cargarCorte`). Esquema: [`db/01_esquema.sql`](../db/01_esquema.sql).

- Se lee con un parser CSV real (comillas, BOM, CRLF o LF) y **todo queda como texto**, sin convertir tipos: así `07`, `001` o `010` conservan sus ceros. En la base, las 61 columnas son `TEXT`; solo `saldo` es una columna generada `NUMERIC(20,2)` derivada del texto original.
- El encabezado debe tener las 61 columnas con los nombres y el orden de `datos/Diccionario_datos_AT03_reto.csv`.
- Por fila se verifica: cantidad de columnas, ausencia de celdas vacías (el AT03 usa `NA`), `Fecha` con formato `AAAAMMDD` y fecha real, `Saldo` decimal con punto y hasta 2 decimales, `Numero_Prestamo` presente, y que los códigos de largo fijo (`Facilidad_Crediticia`, `Tipo_Credito`, `Codigo_Region`, etc.) no hayan perdido ceros a la izquierda.
- Cada error indica fila y columna (se devuelven hasta 25 detalles; el total siempre se informa). Si hay algún error, no se carga nada. La carga es una transacción: o entra el corte completo o no entra nada.
- Un período ya cargado se rechaza salvo que se pida reemplazarlo. Cada fila guarda `archivo` y `fila_archivo` (línea física; el encabezado es la 1), lo que hace trazable cada exclusión. De cada archivo se guarda su huella SHA-256.
- El período de cada fila es su columna `Fecha`, no el nombre del archivo. Si el nombre sugiere otro mes, se muestra una advertencia y se usa la columna.
- Archivos de ejemplo defectuosos: `datos/pruebas_invalidas/`.

## 2. Cascada de exclusiones E1–E4

Objeto: vista `v_cascada` (columna `filtro`), `v_exclusiones` y `v_calidad` en [`db/02_motor.sql`](../db/02_motor.sql).

`filtro` recibe el **primer** filtro que incumple la fila, mediante un `CASE` ordenado; por eso una fila nunca se cuenta dos veces.

| Filtro | Condición | Detalle |
| :---: | :--- | :--- |
| E1 | `ocurrencia > 1` | `ROW_NUMBER() OVER (PARTITION BY fecha, numero_prestamo ORDER BY corte_id, fila_archivo)`: se conserva la primera aparición según el orden del archivo, **dentro de cada período**. Un préstamo en julio y agosto no es duplicado. |
| E2 | `destino <> 'L'` | Comparación exacta (distingue mayúsculas, sin espacios). |
| E3 | `saldo <= 0` | Saldo cero o negativo. |
| E4 | actividad sin coincidencia en `catalogo_cinu` | `LEFT JOIN` por `Tipo_Actividad = Codigo_CINU`. |

El universo local válido es `filtro IS NULL` (`v_universo`). `v_calidad` entrega por período: filas leídas, E1–E4, universo válido, saldo del universo y `cuadre_cascada` (`SI` si leídas = E1+E2+E3+E4+válidas). Aparte, y rotulados como independientes, los conteos `indep_*` de cada regla sobre todas las filas.

`v_exclusiones` lista cada fila excluida con archivo, fila, préstamo, filtro y motivo (se exporta en `/api/exportar/exclusiones`).

## 3. Clasificación por CINU

Objeto: `v_cascada` ([`db/02_motor.sql`](../db/02_motor.sql)). La llave es `AT03.Tipo_Actividad = catalogo_cinu.codigo_cinu`. `macroactividad_reto` y `subactividad_reto` salen del catálogo (`datos/Catalogo_CINU_SB109_reto.csv`). `codigo_sb08_referencia` se guarda pero **no** se usa como llave (el código `2103` se repite en dos subactividades). Ni el nombre ni la identificación del cliente participan en la clasificación.

## 4. Regla especial de CONSUMO / SB21

Objeto: columna `subactividad` de `v_cascada`; alertas en `v_alertas` ([`db/02_motor.sql`](../db/02_motor.sql)).

```
macroactividad = 'CONSUMO' AND subactividad_catalogo = 'Credito personal' AND facilidad = '07'
    → subactividad = 'Tarjeta'
en cualquier otro caso → la subactividad del catálogo CINU
```

- La reclasificación ocurre sobre la misma fila, así que el saldo sale de "Credito personal" y entra a "Tarjeta" sin contarse dos veces, y no cambia `Saldo_Actividad_Banco` de CONSUMO ni de otro ranking.
- Alertas (no excluyen): CINU de Tarjeta con facilidad distinta de `07` (`TARJETA_SIN_FACILIDAD_07`) y CINU de Automóvil con facilidad distinta de `03` (`AUTOMOVIL_SIN_FACILIDAD_03`). Se mantiene la subactividad del catálogo.
- Otras alertas: `BANCO_NO_CATALOGADO` y `FACILIDAD_NO_CATALOGADA` (integridad referencial; también el conteo `alertas_integridad` de `v_calidad`). No son causal de exclusión.

## 5. Agregaciones, denominador, ponderación, ranking y desempate

Objeto: `v_subactividades` y `v_rankings` ([`db/02_motor.sql`](../db/02_motor.sql)).

1. `Saldo_Subactividad = SUM(saldo)` por período, macroactividad, subactividad y banco (22 subactividades × 12 bancos). Se usa un `CROSS JOIN` con todas las subactividades y bancos, de modo que un banco sin saldo aparece con `0.00`.
2. `Saldo_Actividad_Banco = SUM(saldo)` por período, macroactividad y banco.
3. **Denominador** `Total_Cartera_Local_Valida_Banco`: CTE `cartera`, suma de `saldo` del universo válido del banco en el período, **sin filtrar por ranking**. Es el mismo valor en los 6 rankings de un banco.
4. `Ponderacion_Pct = ROUND(saldo_actividad * 100 / total_cartera_local_valida, 4)`, con `NUMERIC` (el redondeo de `NUMERIC` es aritmético, mitad alejándose de cero). Si el total es 0, la ponderación es 0. La suma de las 6 ponderaciones de un banco puede diferir de 100.0000 en la cuarta cifra por el redondeo.
5. `Posicion = ROW_NUMBER() OVER (PARTITION BY fecha, ranking ORDER BY saldo_actividad DESC, codigo_banco ASC)`: mayor saldo = posición 1; en empate exacto, `Codigo_Banco` ascendente. Cada ranking incluye los 12 bancos.
6. `Operaciones_Validas` es el número de préstamos que suman el saldo de la actividad.

Los 6 rankings son los valores de `Macroactividad_Reto` del catálogo: HIPOTECARIO, CONSTRUCCION, INDUSTRIA, AGROPECUARIO (obligatorios), COMERCIO (recomendado) y CONSUMO (bonus).

## 6. Reconciliaciones

Objeto: `v_reconciliaciones` ([`db/02_motor.sql`](../db/02_motor.sql)); pantalla `/verificacion`. La diferencia es `esperado − obtenido`; `cuadra = 'SI'` solo si es exactamente cero.

| # | Nivel | Comprobación |
| :---: | :--- | :--- |
| 1 | banco × ranking × período | Σ `Saldo_Subactividad` = `Saldo_Actividad_Banco` |
| 2 | banco × período | Σ `Saldo_Actividad_Banco` de las 6 macroactividades = `Total_Cartera_Local_Valida_Banco` (y el total es el mismo en los 6 rankings) |
| 3 | período | Σ `Total_Cartera_Local_Valida_Banco` de los 12 bancos = Σ `saldo` del universo válido |

## 7. Comparación entre períodos

Objeto: `v_movimientos` y `v_descomposicion` ([`db/02_motor.sql`](../db/02_motor.sql)). Se calcula para **todos los pares** de períodos (anterior < actual); la columna `consecutivos` indica si no hay un período cargado entre ambos (julio→agosto y agosto→septiembre son consecutivos; julio→septiembre no).

- `Cambio_Posicion = Posicion_anterior − Posicion_actual`: positivo = el banco sube; negativo = baja; 0 = se mantiene.
- `Var_Saldo = Saldo_actual − Saldo_anterior`; `Var_Saldo_Pct = Var_Saldo / Saldo_anterior × 100` a 4 decimales (vacío si el saldo anterior es 0).
- `Cambio_De_Lider = SI` cuando cambia el banco en la posición 1; se marca en el que gana el primer lugar y en el que lo pierde.
- `v_descomposicion` sigue cada préstamo por `Numero_Prestamo`, macroactividad y banco, y separa la variación en: saldo de préstamos **nuevos** (+), saldo de préstamos que **salieron** (−) y variación de los que **continúan** (amortización o crecimiento). Las tres partes suman exactamente `Var_Saldo`. Con esto la pantalla `/comparar` y el resumen `/admin/resumen` explican cada movimiento con plantillas de texto fijas (`explicarMovimiento()` en [`lib/consultas-admin.js`](../lib/consultas-admin.js)).

## 8. Movimiento significativo (definición del equipo)

Parámetros: tabla `parametros` en [`db/01_esquema.sql`](../db/01_esquema.sql). Evaluación: función `movimientos()` en [`lib/consultas.js`](../lib/consultas.js), que lee los parámetros vigentes en cada consulta (por eso un cambio aplica de inmediato). Es una condición O: basta cumplir una.

| Clave | Valor por defecto | Condición |
| :--- | :---: | :--- |
| `min_cambio_posicion` | `2` | `ABS(Cambio_Posicion) >= valor` (y distinto de 0). Entero de 1 a 11. |
| `marcar_cambio_lider` | `si` | Si vale `si`, todo cambio de líder es significativo (`si` o `no`). |
| `min_var_saldo_pct` | `20` | `ABS(Var_Saldo_Pct) >= valor`. Decimal mayor o igual a 0, hasta 4 decimales. |
| (fija) | | El banco pasa de saldo `0.00` a tener saldo en el ranking. |

El campo `Motivo` concatena las condiciones cumplidas (por ejemplo "Sube 3 posiciones; Saldo varía 12.3456%"). El administrador cambia los umbrales en `/admin/parametros` o con `POST /api/admin/parametros`; `guardarParametro()` ([`lib/consultas.js`](../lib/consultas.js)) valida el valor, actualiza la tabla y registra el cambio en la bitácora. `reglaSignificativo()` ([`lib/consultas-admin.js`](../lib/consultas-admin.js)) la redacta en palabras y `efectoRegla()` cuenta cuántos movimientos marca en cada par de períodos.

## 9. Bitácora y parámetros de administración

Tabla `bitacora` ([`db/01_esquema.sql`](../db/01_esquema.sql)): momento, perfil, operación, detalle, resultado (`ok` o `error`) y duración. Registra cargas y reemplazos de cortes, eliminaciones, cargas de catálogos, cambios de parámetros, descargas y los intentos rechazados por permisos o por archivo inválido. Se consulta en `/admin/bitacora`.

## 10. Indicadores adicionales

Archivo: [`db/03_indicadores.sql`](../db/03_indicadores.sql); consultas en [`lib/consultas-indicadores.js`](../lib/consultas-indicadores.js). Se calculan sobre el universo local válido y no modifican los rankings.

- `morosidad_pct = vencido × 100 / saldo`, donde `vencido` es la suma de los 7 tramos `Monto_Vencido_*`.
- `mora_90_pct = saldo con Dias_Mora > 90 × 100 / saldo`.
- `tasa_ponderada = Σ(tasa × saldo) / Σ saldo`.
- Participación = saldo del banco en la actividad ÷ saldo de los 12 bancos en esa actividad (distinta de la "ponderación" del reto). HHI = Σ(participación %)², de 0 a 10,000, calculado con la participación sin redondear; también la participación de los 3 mayores y el HHI de la cartera de cada banco por macroactividad.
- Control: se cuenta cuántas filas no cumplen "saldo = suma de los 16 tramos" (`filas_descuadradas`), según el diccionario de datos.
- `ind_num()` convierte texto a número de forma segura (lo que no sea decimal válido cuenta 0).
