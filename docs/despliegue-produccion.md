# Despliegue a produccion con dominio y HTTPS

Objetivo: publicar LIGATEC en un solo dominio, por ejemplo:

```txt
https://tudominio.com
https://tudominio.com/admin
https://tudominio.com/api/health
```

La API y la web viven juntas en el mismo servidor Node. Esto simplifica CORS y evita depender de IP local.

Ruta recomendada para primer lanzamiento: Render con `render.yaml`.

Guia especifica:

```txt
docs/render-produccion.md
```

## Variables de entorno del servidor

Configura estas variables en el hosting, no en frontend publico:

```env
NODE_ENV=production
SERVE_STATIC=true
API_HOST=0.0.0.0

AUTH_SECRET=clave-larga-secreta-minimo-32-caracteres
TOKEN_TTL_HOURS=8
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
LOGIN_IP_WINDOW_MINUTES=15
LOGIN_IP_MAX_ATTEMPTS=40
PASSWORD_RESET_WINDOW_MINUTES=30
PASSWORD_RESET_MAX_REQUESTS=5
SHOW_RECOVERY_CODE_IN_RESPONSE=false
SEED_DEMO_USERS=false
TRUST_PROXY=true
JSON_BODY_LIMIT=2mb
PUBLIC_CACHE_SECONDS=5

DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true

IMAGE_STORAGE_PROVIDER=supabase
IMAGE_UPLOAD_MAX_BYTES=1800000
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key-solo-en-servidor
SUPABASE_STORAGE_BUCKET=ligatec-images

CORS_ORIGIN=https://tu-dominio.com
VITE_API_BASE_URL=/api
```

Nunca pongas `SUPABASE_SERVICE_ROLE_KEY` en Vercel frontend, navegador, GitHub o codigo cliente.

## Comandos del hosting

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

El comando `npm start` arranca Express en produccion y sirve el directorio `dist`.

## Opcion Docker

Si el proveedor acepta Docker, el repo ya incluye `Dockerfile`.

El contenedor:

- instala dependencias
- compila `dist`
- arranca `npm start`
- expone el puerto `3001`

Configura en el hosting las mismas variables de entorno de produccion.

## Antes de publicar

En la Mac, antes de subir cambios:

```bash
npm test
npm run build
npm run check:capture
npm run backup:db
```

Despues verifica el ultimo backup:

```bash
npm run verify:backup -- backups/postgres-store-backup-FECHA.json
```

## Configurar dominio

En el proveedor de hosting:

1. Agrega el dominio o subdominio.
2. Copia los registros DNS que te indique.
3. En tu proveedor de dominio, crea esos registros.
4. Espera a que marque SSL/HTTPS activo.
5. Cambia `CORS_ORIGIN` al dominio final exacto.

Ejemplo:

```env
CORS_ORIGIN=https://ligatec.mx
```

## Pruebas despues de publicar

Abre:

```txt
https://tu-dominio.com
https://tu-dominio.com/admin
https://tu-dominio.com/api/health
```

Valida:

- La portada publica carga.
- Puedes iniciar sesion con el super admin real.
- Puedes registrar/editar un jugador.
- Puedes subir una foto autorizada.
- La foto queda como URL de Supabase Storage.
- Varias visitas publicas cargan rapido; `PUBLIC_CACHE_SECONDS=5` reduce carga de base sin retrasar mucho los cambios.
- `npm run check:capture` sigue limpio desde una terminal conectada al entorno.

## Pendiente de seguridad antes del lanzamiento final

Como la service role key se compartio durante configuracion, antes de produccion final:

1. Regenera/rota la service role key en Supabase.
2. Actualiza `SUPABASE_SERVICE_ROLE_KEY` en el hosting.
3. Reinicia el servicio.
4. Prueba subir una imagen.
