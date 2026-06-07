# Entorno gratuito para piloto

Objetivo: probar la app con una liga real sin pagar infraestructura al inicio, aceptando las limitaciones normales de los planes gratis.

## Arquitectura recomendada

- Frontend publico y panel web: Vercel Hobby.
- API Node/Express: Render Free Web Service.
- Base de datos real: Supabase Free Postgres.
- Desarrollo local: SQLite en `data/liga-futbol.sqlite`.
- Respaldos del piloto: exportaciones manuales con `npm run pilot:exports`.

## Por que asi

Vercel funciona bien para servir la app React/Vite como sitio estatico. La API queda separada porque ya existe como Express y necesita conectarse a Postgres con `DATABASE_URL` desde servidor.

Supabase guarda los datos reales en Postgres. No debemos usar SQLite en un host gratuito porque muchos servicios tienen filesystem efimero: si el servicio duerme, reinicia o redeploya, se pueden perder archivos locales.

Render Free sirve para probar la API, pero puede tardar en responder cuando esta dormida. Para una liga que apenas esta probando la plataforma, eso es aceptable; para uso oficial conviene pasar a un plan pagado.

## Limites a tomar en cuenta

- Supabase Free puede poner el proyecto en solo lectura si la base supera el limite del plan.
- Render Free puede dormir la API despues de inactividad y despertar lento.
- Render Free no debe guardar archivos importantes en disco local.
- Vercel Hobby es buena opcion para piloto, pero hay limites de uso.
- Los servicios gratuitos pueden cambiar condiciones; revisar los paneles antes de lanzar oficialmente.

## Preparacion local

1. Mantener desarrollo con SQLite:

```bash
npm run dev:api
npm run dev:web
```

2. Generar exportaciones antes de subir datos reales:

```bash
npm run pilot:exports
```

3. Guardar los archivos de `backups/` en un lugar privado. El SQL contiene usuarios y hashes de contraseña.

## Supabase

1. Crear proyecto gratuito en Supabase.
2. Abrir SQL Editor.
3. Ejecutar el contenido de `supabase/schema.sql`.
4. Ejecutar el SQL generado por `npm run export:supabase-sql`.
5. Copiar `DATABASE_URL` desde la configuracion de la base.

Si ya tienes `DATABASE_URL` en `.env`, tambien puedes aplicar el esquema desde terminal:

```bash
npm run setup:postgres-schema
```

Probar desde local:

```bash
cp .env.supabase.example .env
npm run check:postgres
```

## API en Render Free

El archivo `render.yaml` deja lista una plantilla para la API.

Variables que debes configurar manualmente en Render:

- `AUTH_SECRET`: cadena larga, privada, minimo 32 caracteres.
- `DATABASE_URL`: URL Postgres de Supabase.
- `CORS_ORIGIN`: URL publica del frontend en Vercel, por ejemplo `https://liga-futbol.vercel.app`.

Comandos configurados:

- Build: `npm ci`
- Start: `npm run start:api:postgres`
- Health check: `/api/health`

Antes de publicar:

```bash
npm run check:production-config
```

## Frontend en Vercel

El archivo `vercel.json` deja lista la app Vite y las rutas tipo `/liga/ID`.

Variable que debes configurar en Vercel:

- `VITE_API_BASE_URL`: URL publica de la API de Render, por ejemplo `https://liga-futbol-api.onrender.com/api`.

Comandos esperados:

- Build: `npm run build`
- Output: `dist`

## Prueba final del piloto

1. Entrar a la URL de Vercel.
2. Abrir una liga por URL directa: `/liga/ID_DE_LIGA`.
3. Entrar al panel privado en `/admin`.
4. Iniciar sesion como super admin real.
5. Crear o validar admin de liga.
6. Capturar equipos, jugadores y una jornada.
7. Revisar desde telefono calendario, tabla, goleo, sanciones y lesionados.

## Cuando dejar de usar gratis

Pasar a plan pagado cuando:

- La liga lo use como medio oficial.
- Haya varias ligas activas.
- El panel admin se use durante jornadas con urgencia.
- Se requieran respaldos automaticos confiables.
- La API dormida de Render afecte a usuarios.
- Supabase se acerque al limite de base de datos.

## Fuentes oficiales revisadas

- Vercel Pricing: https://vercel.com/pricing
- Render Free Docs: https://render.com/docs/free
- Render Pricing: https://render.com/pricing
- Supabase Database Size Docs: https://supabase.com/docs/guides/platform/database-size
