# Usuarios de produccion

Antes de lanzar, no debe quedar como unico acceso `super@ligafut.local`.

## Crear super admin real

Usa un correo real y una contraseña fuerte:

```bash
REAL_SUPER_ADMIN_NAME="Tu Nombre" \
REAL_SUPER_ADMIN_EMAIL="tu-correo@dominio.com" \
REAL_SUPER_ADMIN_PASSWORD="ContraseñaFuerte123" \
npm run prepare:production-users
```

La contraseña debe tener:

- minimo 10 caracteres
- una mayuscula
- una minuscula
- un numero

## Deshabilitar usuarios demo/local

Despues de confirmar que puedes entrar con el super admin real:

```bash
DISABLE_DEMO_USERS=true npm run prepare:production-users
```

El script no deshabilita usuarios demo si no existe al menos un super admin real activo.

## Verificacion

```bash
npm run check:capture
```

Para estar mas cerca de produccion, ya no debe advertir usuarios demo/local.
