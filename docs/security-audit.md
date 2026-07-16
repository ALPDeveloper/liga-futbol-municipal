# Auditoria Rapida de Seguridad

Fecha: 2026-06-11

## Estado Actual

La app corre como web Vite y API Express. En desarrollo se puede abrir solo localmente o exponer temporalmente a la red local para probar en telefono.

Puertos esperados:

| Servicio | Puerto | Host recomendado | Uso |
| --- | ---: | --- | --- |
| Web Vite local | 5173 | `127.0.0.1` | Desarrollo en la Mac |
| Web Vite LAN | 5173 | `0.0.0.0` temporal | Pruebas en telefono, misma Wi-Fi |
| API local | 3001 | `127.0.0.1` | Desarrollo seguro |
| API LAN | 3001 | `0.0.0.0` temporal | Pruebas en telefono, misma Wi-Fi |

## Hallazgos Principales

| Riesgo | Severidad | Estado |
| --- | --- | --- |
| Credenciales reales en `.env` local | Alta | Mitigado localmente: `.env` queda en SQLite y sin URL externa. Rotar credencial externa si fue compartida. |
| API expuesta en LAN durante pruebas | Media | Documentado. Usar solo temporalmente y con CORS limitado a origen exacto. |
| Usuarios y datos demo en produccion | Alta | Mitigado: no se siembran por default; `SEED_DEMO_DATA=true` y `SEED_DEMO_USERS=true` deben activarse explicitamente solo en pruebas locales. |
| Recuperacion mostrando codigo | Alta | Mitigado: default `SHOW_RECOVERY_CODE_IN_RESPONSE=false`. |
| Login sin limite por IP | Alta | Mitigado: rate limit por IP en login. |
| Recuperacion sin limite por IP/correo | Alta | Mitigado: rate limit por IP/correo. |
| Contraseñas debiles nuevas | Alta | Mitigado: minimo 10 caracteres, mayuscula, minuscula y numero. |
| Store publico con campos internos | Media | Mitigado: respuesta publica saneada; respuesta completa solo con token. |
| Headers basicos ausentes | Media | Mitigado: `nosniff`, `DENY`, `Permissions-Policy`, HSTS en produccion. |
| `npm audit` sin revisar | Media | Revisado: 0 vulnerabilidades al 2026-06-11. |

## Cambios Aplicados

- `server/security.js`: rate limit, headers, saneamiento publico y politica de password.
- `server/index.js`: usa headers, CORS con metodos/headers definidos, limites de login/reset, store segun rol.
- `server/runtimeConfig.js`: nuevas variables de seguridad y validaciones de produccion.
- `server/auth.js` y `server/password.js`: tolerancia a tokens/hashes malformados sin error 500.
- `server/database.js` y `server/postgresDatabase.js`: no siembran datos ni usuarios demo cuando `SEED_DEMO_DATA=false` y `SEED_DEMO_USERS=false`.
- `src/lib/api.js` y `src/main.jsx`: carga store autenticado cuando existe token.
- `.env`: entorno local limpio, SQLite, CORS explicito y recuperacion sin exponer codigo.

## Pendientes Antes de Produccion

1. Rotar cualquier contraseña externa que haya sido pegada en archivos, capturas, chat o logs.
2. Crear usuarios reales con contraseñas fuertes y deshabilitar/eliminar usuarios demo.
3. Configurar canal real de recuperacion: correo, WhatsApp o proceso manual de super admin.
4. Usar HTTPS obligatorio en dominio publico.
5. Configurar `CORS_ORIGIN` con el dominio final, no con `*`.
6. Configurar backups automaticos de base de datos.
7. Revisar roles y permisos endpoint por endpoint antes de abrir a mas ligas.
8. Agregar monitoreo de errores y logs de auditoria con retencion.

## Configuracion Segura de Produccion

```env
NODE_ENV=production
API_HOST=0.0.0.0
AUTH_SECRET=valor-largo-aleatorio-minimo-32-caracteres
SHOW_RECOVERY_CODE_IN_RESPONSE=false
SEED_DEMO_DATA=false
SEED_DEMO_USERS=false
TRUST_PROXY=true
CORS_ORIGIN=https://tu-dominio.com
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
VITE_API_BASE_URL=https://tu-api.com/api
```

## Mantenimiento Recomendado

- Ejecutar `npm audit --audit-level=moderate` cada semana.
- Ejecutar `npm test` y `npm run build` antes de subir cambios.
- Crear backup antes de cambios de base: `npm run backup:db`.
- Rotar `AUTH_SECRET` y credenciales de base ante cualquier sospecha de exposicion.
- Revisar usuarios activos mensualmente.
- Revisar logs de auditoria despues de torneos, liguillas y cambios administrativos.
