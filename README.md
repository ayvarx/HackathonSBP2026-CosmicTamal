# HackathonSBP2026-CosmicTamal

Reto: reconstrucción automatizada de rankings de crédito y análisis bancario (Hackathon SBP 2026).

## Estructura
```
backend/    Node.js + Express (API de rankings)
frontend/   React + Vite (panel, filtros, gráficos)
datos/      Paquete AT03 de la SBP (no se sube al repositorio)
```

## Instalación y ejecución (local)
Requisitos: Node.js 18 o superior.

```bash
cd backend && npm install && npm start      # http://localhost:8000/api/health
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## Estado
- Base del proyecto lista: backend con `/api/health` y frontend que lo consulta.
- Pendiente: carga de datos AT03, catálogos, cálculo de rankings y reglas de la Sección 4 de las indicaciones.
