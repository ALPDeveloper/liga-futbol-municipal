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
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://tu-dominio.com
SUPABASE_URL=https://piwuxmasustltejzhwso.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key-rotada
```

`AUTH_SECRET` se genera automaticamente desde `render.yaml`.

Importante: antes de lanzamiento final, rota/regenera `SUPABASE_SERVICE_ROLE_KEY` en Supabase porque se compartio durante configuracion.

## Variables ya definidas por `render.yaml`

```env
NODE_ENV=production
NODE_VERSION=20.20.2
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
BACKUP_STORAGE_BUCKET=ligatec-backups
```

No definas `API_PORT` en Render. Render entrega `PORT` automaticamente y la app ya lo respeta.

## Comandos esperados

Build command:

```bash
npm ci --include=dev && npm run build
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
2. Ve a `Settings`.
3. Busca `Custom Domains`.
4. Clic en `+ Add Custom Domain`.
5. Agrega el dominio final, por ejemplo `ligatec.mx` o `www.ligatec.mx`.
6. Render mostrara los registros DNS.
7. Copia esos registros en tu proveedor de dominio.
8. Quita registros `AAAA` del dominio si existen.
9. Espera a que Render marque el dominio como verificado y HTTPS activo.
10. Actualiza `CORS_ORIGIN` con el dominio final exacto.

Render conserva el subdominio `onrender.com` aunque agregues dominio propio. Si quieres que solo funcione el dominio oficial, puedes deshabilitar el subdominio de Render despues de confirmar que el dominio propio ya carga bien.

Ejemplo:

```env
CORS_ORIGIN=https://ligatec.mx
```

Si usas `www`, debe quedar exactamente igual:

```env
CORS_ORIGIN=https://www.ligatec.mx
```

Despues de cambiar `CORS_ORIGIN`, redeploya el servicio.

## Backup automatico en Render

La app incluye un respaldo logico JSON:

```bash
npm run backup:db
```

Para produccion, primero configura el bucket privado:

```bash
BACKUP_STORAGE_BUCKET=ligatec-backups npm run setup:backup-storage
```

Luego crea en Render un Cron Job diario con:

```bash
BACKUP_STORAGE_BUCKET=ligatec-backups npm run backup:db
```

Ese Cron Job debe tener estas variables:

```env
NODE_VERSION=20.20.2
DATABASE_PROVIDER=postgres
DATABASE_SSL=true
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
BACKUP_STORAGE_BUCKET=ligatec-backups
```

El respaldo se sube a Supabase Storage en:

```txt
ligatec-backups/database/AAAA-MM-DD/
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
