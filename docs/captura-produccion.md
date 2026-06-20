# Captura real con datos que deben sobrevivir a produccion

Este flujo es para capturar datos reales desde la Mac mientras la app apunta a la base Postgres/Supabase que despues se usara en servidores y dominio propio.

## Regla principal

Antes de capturar datos reales, confirma que la app esta usando Postgres:

```bash
npm run check:capture
```

Debe decir:

```text
Proveedor: postgres
OK para capturar datos en la base activa.
```

Si dice `sqlite`, no captures datos reales todavia.

## Levantar la app para captura

Terminal 1:

```bash
cd "/Users/antoniolinaresp/Documents/WEB LIGA FUT"
npm run dev:api:lan
```

Terminal 2:

```bash
cd "/Users/antoniolinaresp/Documents/WEB LIGA FUT"
npm run dev:lan
```

En Mac:

```text
http://localhost:5173/admin
```

En iPhone:

```text
http://IP-DE-TU-MAC:5173/admin
```

La IP actual se revisa con:

```bash
ifconfig en0 | grep "inet "
```

Si cambia la IP, actualiza en `.env`:

```text
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://IP-DE-TU-MAC:5173
VITE_API_BASE_URL=http://IP-DE-TU-MAC:3001/api
```

Despues reinicia API y web.

## Respaldos antes y despues de capturar

Antes de una sesion grande:

```bash
npm run check:capture
npm run backup:db
npm run export:store
```

Despues de capturar:

```bash
npm run backup:db
npm run export:store
```

Con `DATABASE_PROVIDER=postgres`, estos comandos exportan datos desde Postgres, no desde SQLite.

## No hacer cuando ya hay datos reales

- No usar `Reset demo`.
- No ejecutar `npm run import:postgres` sin respaldo reciente.
- No cambiar `DATABASE_URL` sin confirmar que es la base correcta.
- No poner `DATABASE_PROVIDER=sqlite` para capturar datos reales.
- No borrar ligas reales desde Super admin salvo que exista respaldo.

## Antes de lanzamiento publico

- Crear un super admin real.
- Crear admin real de liga.
- Deshabilitar usuarios demo.
- Cambiar `SEED_DEMO_USERS=false`.
- Usar `AUTH_SECRET` largo y privado.
- Definir `CORS_ORIGIN` con el dominio final.
- Definir `VITE_API_BASE_URL` con la URL final de la API.
- Ejecutar:

```bash
npm run check:production-config
npm run check:postgres
npm run build
```

## Migracion a servidor real

Si los datos ya estan en la misma base Supabase/Postgres de produccion, no hay que migrar datos: solo se conectan la API del servidor y el frontend al mismo `DATABASE_URL`.

Si se cambia a otra base Postgres, usa el ultimo JSON:

```bash
npm run export:store
npm run import:postgres -- backups/store-export-FECHA.json
```

Hazlo solo contra la base destino correcta y con respaldo previo.
