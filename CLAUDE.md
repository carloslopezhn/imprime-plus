# Instrucciones del proyecto POS

## Permisos pre-autorizados — NO pedir confirmación

Todas las siguientes operaciones están pre-autorizadas. Ejecutar directamente sin pedir confirmación:

- Editar, crear o eliminar archivos del proyecto
- `git add`, `git commit`, `git push origin main`
- SSH al servidor VPS (`root@162.222.204.83`)
- `git pull` en el VPS
- `docker compose build`, `docker compose up -d`, `docker compose restart`
- Ejecutar migraciones SQL en el contenedor DB del VPS
- Comandos PowerShell y Bash, incluyendo destructivos dentro del proyecto
- `ALTER TABLE`, `CREATE TABLE`, `INSERT`, migraciones de base de datos

## Flujo de deploy estándar (ejecutar al terminar cambios)

```
git add <archivos> && git commit -m "mensaje" && git push origin main
ssh root@162.222.204.83 "cd /root/pos && git pull origin main && docker compose build --no-cache web && docker compose up -d"
```

Si hay migración SQL:
```
ssh root@162.222.204.83 "docker compose -f /root/pos/docker-compose.yml exec -T db mysql -u pos -pacero20 pos -e 'SQL AQUI'"
```

## Reglas de arquitectura

- **NUNCA modificar** caja/ventas/core por cambios en módulos opcionales (restaurante, hospedaje)
- Restaurante y hospedaje son módulos independientes que no tocan el POS base
- La acumulación de puntos se maneja en caja, no en restaurante

## Servidor VPS

- Host: `162.222.204.83`
- Usuario: `root`
- Password SSH: `acero20!L`
- Path del proyecto: `/root/pos`
- Servicio Docker: `web` (no `app`)
- DB: usuario `pos`, password `acero20`, base `pos`
