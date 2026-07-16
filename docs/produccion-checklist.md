# Checklist de produccion

Este documento sirve para preparar una primera salida real de la Liga Municipal Futbol.

## Antes de cargar datos reales

- Revisar `docs/despliegue-produccion.md`.
- Si se usara Render, revisar `docs/render-produccion.md`.
- Crear `.env` a partir de `.env.example`.
- Si los datos deben sobrevivir a produccion, usar `DATABASE_PROVIDER=postgres`.
- Ejecutar `npm run check:capture` y confirmar que indique `Proveedor: postgres`.
- Cambiar `AUTH_SECRET` por una cadena larga y privada.
- Definir `LOGIN_MAX_ATTEMPTS` y `LOGIN_LOCK_MINUTES`.
- Definir `SEED_DEMO_DATA=false` o dejarlo sin configurar; solo se siembra demo si se activa explicitamente.
- Definir `SEED_DEMO_USERS=false` o dejarlo sin configurar; solo se crean usuarios demo si se activa explicitamente.
- Definir `SHOW_RECOVERY_CODE_IN_RESPONSE=false`.
- No usar SQLite para produccion; `DB_PATH` aplica solo para desarrollo o restauraciones locales.
- Definir `BACKUP_DIR` en una ruta temporal/privada y `BACKUP_STORAGE_BUCKET` para conservar respaldos fuera del servidor.
- Si se hara piloto Supabase, revisar `docs/piloto-supabase.md`.
- Si se hara piloto gratuito, revisar `docs/entorno-gratuito.md`.
- Para Supabase, copiar `.env.supabase.example` como `.env` y configurar `DATABASE_URL`.
- Ejecutar `supabase/schema.sql` en Supabase antes de conectar Postgres.
- Probar conexion con `npm run check:postgres`.
- Probar configuracion segura con `npm run check:production-config`.
- Definir `CORS_ORIGIN` con el dominio publico.
- Verificar que `CORS_ORIGIN` use `https://` en produccion.
- Verificar que `VITE_API_BASE_URL` sea `/api` o una URL publica `https://`.
- Si web y API viven en el mismo dominio, definir `SERVE_STATIC=true` y `VITE_API_BASE_URL=/api`.
- Fijar `NODE_VERSION=20.18.0` en Render o respetar `engines.node`.
- Crear bucket `ligatec-images` en Supabase Storage o definir `SUPABASE_STORAGE_BUCKET`.
- Revisar `docs/supabase-storage.md`.
- Definir `IMAGE_STORAGE_PROVIDER=supabase`.
- Definir `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en la API, nunca en el frontend.
- Crear bucket privado `ligatec-backups` con `npm run setup:backup-storage`.
- Definir `BACKUP_STORAGE_BUCKET=ligatec-backups` para respaldos automaticos.
- Definir `IMAGE_UPLOAD_MAX_BYTES` con un limite razonable para celular.
- Confirmar que `/admin` no se muestra desde la portada publica.
- Crear el super admin real.
- Revisar `docs/usuarios-produccion.md`.
- Deshabilitar o eliminar usuarios demo.
- Confirmar que `data/`, `backups/`, `uploads/`, `uploads-local-test*/`, `.env` y scripts QA locales no esten versionados ni incluidos en Docker.
- Ejecutar `npm run check:production-config` y no lanzar si marca errores.
- Ejecutar `npm run check:deployment`; ahora tambien valida que `dist` no incluya rastros QA/demo y que Render mantenga apagado el seed demo.
- Ejecutar `npm run setup:storage` y confirmar `Supabase Storage OK`.

## Prueba operativa con una liga

- Crear liga real.
- Crear admin de liga.
- Crear torneo activo.
- Registrar equipos.
- Registrar jugadores.
- Generar calendario.
- Editar fecha, hora y cancha de una jornada.
- Capturar actas con goles, amarillas y rojas.
- Confirmar tabla de posiciones, goleo, disciplina y suspendidos.
- Simular baja de equipo y revisar defaults.
- Simular liguilla y marcador global.

## Seguridad minima

- Verificar que un admin de liga no pueda editar otra liga.
- Verificar que no se pueda eliminar el ultimo super admin activo.
- Verificar que un usuario deshabilitado no pueda iniciar sesion.
- Verificar que una cuenta se bloquee despues de varios intentos fallidos.
- Verificar que cambiar la contraseña temporal limpie el bloqueo.
- Verificar que recuperacion de contraseña no muestre codigos en la respuesta.
- Verificar que roles y estados de usuario solo acepten valores validos.
- Verificar que imagenes de jugadores, equipos y publicidad no superen el limite permitido.
- Verificar que enlaces de publicidad usen solo `http://` o `https://`.
- Verificar que las fotos guardadas sean URL de Storage y no base64 en la base productiva.
- Revisar auditoria despues de cambios criticos.
- Probar recuperacion de contraseña.

## Auditoria operativa

- Revisar eventos criticos desde `Super admin > Auditoria`.
- Filtrar por liga cuando se investigue un reclamo operativo.
- Filtrar por `Criticos` despues de cada jornada capturada.
- Revisar accesos fallidos y cuentas bloqueadas.
- Revisar eliminaciones de usuarios o ligas.
- Revisar cambios de reglas, bajas de equipo y defaults administrativos.
- Registrar fuera del sistema cualquier aclaracion oficial que derive de un evento critico.

## Respaldos

- Revisar `docs/backups-produccion.md`.
- Ejecutar respaldo manual:

```bash
npm run backup:db
```

- Validar que el archivo se genere en `BACKUP_DIR` y, en produccion, que se suba al bucket privado configurado.
- Si `DATABASE_PROVIDER=postgres`, confirmar que el respaldo diga `Base origen: postgres`.
- Exportar estado completo a JSON antes de migrar:

```bash
npm run export:store
```

- Confirmar que el export diga `Origen: postgres` cuando se este capturando en la base final.
- Verificar restauracion segura:

```bash
npm run verify:backup -- backups/postgres-store-backup-FECHA.json
```

- Programar respaldo diario en el servidor.
- Si se usa Render, crear Cron Job diario que ejecute `BACKUP_STORAGE_BUCKET=ligatec-backups npm run backup:db`.
- Confirmar que el backup automatico se sube al bucket privado `ligatec-backups`.
- Probar restauracion en una copia antes del lanzamiento.

## Dominio propio

- Agregar el dominio en Render desde `Settings > Custom Domains`.
- Copiar los DNS indicados por Render en el proveedor del dominio.
- Quitar registros `AAAA` si existen.
- Esperar verificacion y certificado HTTPS activo.
- Actualizar `CORS_ORIGIN` al dominio final exacto.
- Redeployar despues del cambio de `CORS_ORIGIN`.
- Probar `https://dominio.com`, `https://dominio.com/admin` y `https://dominio.com/api/health`.

## Pendientes recomendados

- Envio real de recuperacion por correo o WhatsApp.
- Bloqueo temporal por muchos intentos fallidos.
- Pantalla de exportacion/impresion de reportes.
- Politica de privacidad y aviso de uso de datos.
- Monitoreo de errores del servidor.
