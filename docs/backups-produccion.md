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

## Respaldo automatico recomendado

En el servidor final, programar una tarea diaria:

```bash
cd "/ruta/de/la/app"
npm run backup:db
```

Recomendado:

- Ejecutar una vez al dia.
- Guardar respaldos fuera del servidor principal.
- Conservar al menos 30 dias.
- Probar restauracion cada semana con `npm run verify:backup`.
- Mantener tambien los backups nativos de Supabase/Postgres.

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
