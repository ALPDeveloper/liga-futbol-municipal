# Backups de produccion

La app guarda la operacion en Postgres/Supabase y las imagenes en Supabase Storage.

## Respaldo manual antes de cambios importantes

```bash
npm run backup:db
```

Cuando `DATABASE_PROVIDER=postgres`, esto genera un respaldo logico JSON en `BACKUP_DIR` o en `backups/`.

## Verificar que el respaldo se puede restaurar

Copia la ruta que genero el backup y ejecuta:

```bash
npm run verify:backup -- backups/postgres-store-backup-FECHA.json
```

Esta prueba restaura el JSON en una base SQLite temporal y valida que existan ligas, equipos, jugadores y partidos. No toca la base Postgres real.

## Bucket privado para backups

Los backups contienen datos operativos de jugadores, equipos, partidos y administracion. No deben ir al bucket publico de imagenes.

Configura un bucket privado en Supabase Storage:

```bash
BACKUP_STORAGE_BUCKET=ligatec-backups npm run setup:backup-storage
```

Despues, cualquier respaldo con `BACKUP_STORAGE_BUCKET` definido se guarda localmente y tambien se sube al bucket privado:

```bash
BACKUP_STORAGE_BUCKET=ligatec-backups npm run backup:db
```

La ruta subida tendra este formato:

```txt
ligatec-backups/database/AAAA-MM-DD/postgres-store-backup-FECHA.json
```

## Respaldo automatico recomendado

En el servidor final, programar una tarea diaria:

```bash
cd "/ruta/de/la/app"
BACKUP_STORAGE_BUCKET=ligatec-backups npm run backup:db
```

Recomendado:

- Ejecutar una vez al dia.
- Guardar respaldos fuera del servidor principal, idealmente en el bucket privado `ligatec-backups`.
- Conservar al menos 30 dias.
- Probar restauracion cada semana con `npm run verify:backup`.
- Mantener tambien los backups nativos de Supabase/Postgres.

En Render, la forma recomendada es crear un Cron Job diario que ejecute el mismo comando y use las mismas variables secretas que el servicio web. Como Render usa disco efimero, el respaldo automatico debe subir a Supabase Storage o a otro almacenamiento externo.

## Backups nativos de Supabase

Supabase realiza backups diarios automaticamente en proyectos Pro, Team y Enterprise. En Free, conviene exportar regularmente con Supabase CLI o con el respaldo JSON de esta app y mantener copias fuera del proyecto.

Importante: los backups de base de datos no restauran archivos borrados de Supabase Storage; por eso las fotos deben cuidarse aparte y los respaldos JSON solo guardan URLs.

## Imagenes

Las imagenes viven en Supabase Storage. El respaldo JSON guarda las URL, no los archivos binarios.

Antes de produccion, confirmar:

```bash
npm run setup:storage
npm run check:capture
```

Debe aparecer:

```txt
Storage imagenes: supabase
Bucket imagenes: ligatec-images
```
