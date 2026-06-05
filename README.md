# 💰 Planillas — Gestión de pagos

Mini-sistema web para gestionar los pagos de tus planillas: saber **cuánto le tienes que pagar a cada quién**, llevar el **seguimiento de si ya se pagó** (subiendo la constancia de pago), con flexibilidad para distintos tipos de jornada, modalidades de pago y monedas.

## ¿Qué hace?

- **Trabajadores** con distintos tipos de jornada: tiempo completo, medio tiempo o por horas.
- **Modalidad de pago por persona**: mensual o quincenal (se puede cambiar en cada pago).
- **Cálculo de horas extra**: el valor de la hora se calcula como `sueldo mensual ÷ horas de referencia al mes`. Las horas extra se pagan a ese mismo valor (sin recargo). Total del periodo = `base + horas extra × valor hora`.
- **Monedas**: soles (S/) por defecto, o dólares (US$). Solo etiqueta la moneda, sin conversiones.
- **Seguimiento de pagos**: cada pago está *pendiente* hasta que lo marcas como *pagado* **subiendo la constancia** (PDF o imagen). La constancia queda adjunta y se puede ver cuando quieras.
- **Resumen** de cuánto falta por pagar y cuánto ya se pagó, separado por moneda.

## Cómo correrlo

Requiere [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

Luego abre **http://localhost:3000** en el navegador (compu o celular en la misma red).

Para desarrollo con recarga automática:

```bash
npm run dev
```

## Dónde se guardan los datos

- La base de datos (SQLite) vive en `data/payroll.db`.
- Las constancias subidas se guardan en `uploads/`.

Ambas carpetas están en `.gitignore` (no se suben al repositorio). Si quieres conservar tus datos, **respáldalas**.

## Flujo de uso

1. Ve a **Trabajadores** → *+ Nuevo trabajador*. Define su jornada, modalidad, sueldo mensual, horas de referencia y moneda.
2. Ve a **Pagos** → *+ Nuevo pago* (o el botón *+ Pago* desde la tarjeta del trabajador). Se sugiere automáticamente la base y el valor hora; ajusta las horas extra si las hubo.
3. Cuando hagas el pago real, dale **✓ Marcar pagado + constancia** y sube el comprobante. Listo: queda registrado con fecha y constancia.

## Notas

- v1 sin login (un solo usuario). Se puede agregar autenticación más adelante.
- Stack: Node.js + Express + SQLite (`better-sqlite3`) + frontend en HTML/CSS/JS sin frameworks.
