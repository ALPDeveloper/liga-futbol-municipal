# Revision Rapida de Rendimiento

Fecha: 2026-06-11

## Resultado Actual

Comandos ejecutados:

- `npm test`: OK.
- `npm run build`: OK.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.

Build actual:

| Archivo | Tamano aproximado |
| --- | ---: |
| `index.html` | 0.41 kB |
| CSS | 43 kB |
| JS principal | 611 kB |
| imagen hero | 2.06 MB |

## Observaciones

- Vite advierte que el JS principal supera 500 kB. No bloquea el uso, pero conviene dividir codigo antes del piloto publico.
- La imagen hero pesa mas de 2 MB. En moviles puede afectar carga inicial.
- La app consulta y guarda el store completo. Funciona para piloto chico, pero para muchas ligas conviene endpoints por liga/torneo.
- SQLite local es suficiente para desarrollo. Para uso real multiusuario, Postgres/Supabase es mejor por concurrencia, backups y acceso remoto.

## Recomendaciones Prioritarias

1. Optimizar imagen hero a WebP/AVIF y generar versiones responsive.
2. Dividir panel admin con `React.lazy` para que el publico no cargue toda la administracion.
3. Crear endpoints publicos por liga: tabla, calendario, goleadores, sanciones, lesiones.
4. Evitar `PUT /api/store` completo a mediano plazo; cambiar a operaciones especificas por recurso.
5. Cachear respuestas publicas de calendario/tabla por pocos segundos cuando haya usuarios reales.
6. Medir en telefono real: carga inicial, scroll en calendario, apertura de detalle de partido y guardado de acta.

## Umbrales Sugeridos Para Piloto

- JS inicial publico menor a 250 kB gzip.
- Imagen principal menor a 300 kB en movil.
- Respuesta API publica menor a 500 ms en red normal.
- Build y pruebas obligatorias antes de cada despliegue.
