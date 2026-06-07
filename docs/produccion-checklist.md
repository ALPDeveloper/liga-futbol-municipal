# Checklist de produccion

Este documento sirve para preparar una primera salida real de la Liga Municipal Futbol.

## Antes de cargar datos reales

- Crear `.env` a partir de `.env.example`.
- Cambiar `AUTH_SECRET` por una cadena larga y privada.
- Definir `LOGIN_MAX_ATTEMPTS` y `LOGIN_LOCK_MINUTES`.
- Definir `SHOW_RECOVERY_CODE_IN_RESPONSE=false`.
- Definir `DB_PATH` en una ruta persistente del servidor.
- Definir `BACKUP_DIR` en una ruta persistente y respaldada.
- Si se hara piloto Supabase, revisar `docs/piloto-supabase.md`.
- Si se hara piloto gratuito, revisar `docs/entorno-gratuito.md`.
- Para Supabase, copiar `.env.supabase.example` como `.env` y configurar `DATABASE_URL`.
- Ejecutar `supabase/schema.sql` en Supabase antes de conectar Postgres.
- Probar conexion con `npm run check:postgres`.
- Probar configuracion segura con `npm run check:production-config`.
- Definir `CORS_ORIGIN` con el dominio publico.
- Confirmar que `/admin` no se muestra desde la portada publica.
- Crear el super admin real.
- Deshabilitar o eliminar usuarios demo.

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

- Ejecutar respaldo manual:

```bash
npm run backup:db
```

- Validar que el archivo se genere en `BACKUP_DIR`.
- Exportar estado completo a JSON antes de migrar:

```bash
npm run export:store
```

- Programar respaldo diario en el servidor.
- Probar restauracion en una copia antes del lanzamiento.

## Pendientes recomendados

- Envio real de recuperacion por correo o WhatsApp.
- Bloqueo temporal por muchos intentos fallidos.
- Pantalla de exportacion/impresion de reportes.
- Politica de privacidad y aviso de uso de datos.
- Monitoreo de errores del servidor.
