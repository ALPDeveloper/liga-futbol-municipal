# Piloto con Supabase y Vercel

Objetivo: probar la app con datos reales sin pagar infraestructura grande desde el inicio.

Para la ruta gratuita completa con Vercel + Render + Supabase, revisar `docs/entorno-gratuito.md`.

## Ruta recomendada

1. Mantener desarrollo local con SQLite hasta cerrar flujo operativo.
2. Crear proyecto gratis en Supabase.
3. Ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.
4. Exportar datos locales con `npm run export:store`.
5. Generar SQL de carga con `npm run export:supabase-sql`.
6. Ejecutar el SQL generado en Supabase.
7. Activar adaptador Postgres en la API.
8. Subir frontend a Vercel.
9. Subir API a un servicio Node con variables de entorno.
10. Probar una jornada real de Tingüindín.

## Estado actual

Listo:

- App web responsive.
- Backend Express.
- SQLite local para desarrollo.
- Esquema Postgres compatible en `supabase/schema.sql`.
- Export JSON del estado actual con `npm run export:store`.
- Export SQL para cargar datos en Supabase con `npm run export:supabase-sql`.
- Adaptador inicial Postgres en `server/postgresDatabase.js`.
- API conectada a `DATABASE_PROVIDER=sqlite|postgres` mediante `server/dataLayer.js`.
- Verificacion de conexion Postgres con `npm run check:postgres`.
- Import directo JSON a Postgres con `npm run import:postgres -- backups/store-export-FECHA.json`.
- URLs publicas por liga: `/liga/ID_DE_LIGA`.
- Selector de ligas oculto en vista publica.

Pendiente para Supabase real:

- Probar `DATABASE_PROVIDER=postgres` contra una instancia real de Supabase.
- Configurar correo/WhatsApp real para recuperacion de contraseña.

## Supabase

Crear proyecto y guardar:

- `DATABASE_URL`
- `Project URL`
- `anon public key`
- `service_role key`

Para este backend Express conviene usar `DATABASE_URL` desde servidor, no exponer `service_role` al frontend.

Ejecutar en Supabase SQL Editor:

```sql
-- Copiar el contenido de supabase/schema.sql
```

O, si `DATABASE_URL` ya esta configurado en `.env`, aplicarlo desde terminal:

```bash
npm run setup:postgres-schema
```

## Variables de entorno sugeridas

API:

```bash
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001
AUTH_SECRET=una-clave-larga-y-privada
TOKEN_TTL_HOURS=8
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
SHOW_RECOVERY_CODE_IN_RESPONSE=false
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
DATABASE_SSL=true
CORS_ORIGIN=https://tu-dominio-o-vercel.app
```

Antes de arrancar la API en produccion:

```bash
npm run check:production-config
```

Frontend:

```bash
VITE_API_BASE_URL=https://api-tu-dominio.com/api
```

## Exportar datos actuales

```bash
npm run export:store
```

El archivo queda en `backups/store-export-FECHA.json`.

Ese archivo sirve como snapshot antes de migrar y como base para un importador Postgres.

Para generar el JSON y el SQL del piloto en un solo comando:

```bash
npm run pilot:exports
```

## Generar SQL para Supabase

Despues de ejecutar `supabase/schema.sql` en Supabase:

```bash
npm run export:supabase-sql
```

El archivo queda en `backups/supabase-seed-FECHA.sql`.

Ese archivo contiene usuarios y hashes de contraseña. No se debe compartir publicamente ni subir a git.

Para cargarlo:

1. Abrir Supabase SQL Editor.
2. Copiar el contenido de `backups/supabase-seed-FECHA.sql`.
3. Ejecutarlo.
4. Revisar que existan ligas, equipos, jugadores y usuarios.

## Probar conexion Postgres

Con `DATABASE_URL` configurado:

```bash
npm run check:postgres
```

Debe imprimir cuantas ligas, equipos, jugadores y partidos puede leer desde Postgres.

Para correr la API local apuntando a Supabase/Postgres:

```bash
npm run dev:api:postgres
```

## Importar JSON directo a Postgres

Si prefieres no copiar el seed SQL manualmente, puedes importar el JSON exportado:

```bash
npm run export:store
npm run import:postgres -- backups/store-export-FECHA.json
```

Este comando borra y vuelve a cargar las tablas operativas, conservando usuarios si su liga sigue existiendo.

## URLs por liga

La vista publica ya no muestra selector de todas las ligas.

Cada liga se comparte por URL directa:

```text
https://tu-dominio.com/liga/ID_DE_LIGA
```

El super admin puede ver la URL publica en:

`/admin > Super admin > Membresias por liga`

## Primer piloto real

Checklist minimo:

- Crear super admin real.
- Crear admin de Tingüindín.
- Crear liga Tingüindín.
- Copiar URL publica de Tingüindín.
- Registrar equipos reales.
- Registrar jugadores reales.
- Generar o capturar calendario.
- Capturar una jornada completa.
- Revisar tabla, calendario, goleadores, sanciones y lesionados desde celular.

## Criterio para empezar a pagar

Seguir gratis mientras:

- Solo se prueba con una o pocas ligas.
- No hay trafico alto.
- No se depende de la app como servicio oficial.

Pasar a plan pagado cuando:

- La liga la use oficialmente.
- Se vendan membresias.
- Se requieran backups confiables.
- Haya varias ligas activas.
