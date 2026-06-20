# Publicar LIGATEC en Render

Esta guia usa un solo servicio web Node:

```txt
https://tu-dominio.com
https://tu-dominio.com/admin
https://tu-dominio.com/api/health
```

## Antes de empezar

Confirma en tu Mac:

```bash
npm test
npm run build
npm run check:capture
npm run backup:db
```

## Opcion recomendada: Blueprint con `render.yaml`

El repo ya incluye `render.yaml`.

Pasos:

1. Sube el proyecto a GitHub.
2. Entra a Render.
3. Clic en `New`.
4. Elige `Blueprint`.
5. Conecta el repositorio.
6. Render detectara `render.yaml`.
7. Crea el servicio `ligatec-web`.

Render pedira las variables marcadas como secretas.

## Variables secretas que debes poner en Render

No las subas a GitHub.

```env
AUTH_SECRET=una-clave-nueva-larga-y-privada
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://tu-dominio.com
SUPABASE_URL=https://piwuxmasustltejzhwso.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key-rotada
```

Importante: antes de lanzamiento final, rota/regenera `SUPABASE_SERVICE_ROLE_KEY` en Supabase porque se compartio durante configuracion.

## Variables ya definidas por `render.yaml`

```env
NODE_ENV=production
SERVE_STATIC=true
API_HOST=0.0.0.0
TRUST_PROXY=true
DATABASE_PROVIDER=postgres
DATABASE_SSL=true
IMAGE_STORAGE_PROVIDER=supabase
IMAGE_UPLOAD_MAX_BYTES=1800000
SUPABASE_STORAGE_BUCKET=ligatec-images
SHOW_RECOVERY_CODE_IN_RESPONSE=false
SEED_DEMO_USERS=false
VITE_API_BASE_URL=/api
PUBLIC_CACHE_SECONDS=5
```

No definas `API_PORT` en Render. Render entrega `PORT` automaticamente y la app ya lo respeta.

## Comandos esperados

Build command:

```bash
npm ci && npm run build
```

Start command:

```bash
npm start
```

Health check:

```txt
/api/health
```

## Dominio

Cuando el servicio ya responda:

1. En Render, abre el servicio.
2. Ve a `Settings` o `Custom Domains`.
3. Agrega tu dominio o subdominio.
4. Render mostrara los registros DNS.
5. Copia esos registros en tu proveedor de dominio.
6. Espera a que Render marque HTTPS activo.
7. Actualiza `CORS_ORIGIN` con el dominio final exacto.

Ejemplo:

```env
CORS_ORIGIN=https://ligatec.mx
```

## Prueba final despues del deploy

Abre:

```txt
https://tu-dominio.com
https://tu-dominio.com/admin
https://tu-dominio.com/api/health
```

Valida:

- Login con super admin real.
- Vista publica carga rapido.
- Categorias y liga se mantienen.
- Registro/edicion de jugador.
- Subida de foto autorizada.
- Foto guardada como URL de Supabase Storage.
- Acta de partido guarda marcador y default.
- Backup manual funciona desde el entorno.

## Rollback simple

Antes de cambios grandes:

```bash
npm run backup:db
```

Si algo sale mal, no importes nada a produccion sin probar primero:

```bash
npm run verify:backup -- backups/postgres-store-backup-FECHA.json
```
