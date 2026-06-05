# Desplegar en Vercel + Supabase

Esta app usa **Supabase** para guardar los datos (Postgres) y las constancias
(Storage), y **Vercel** para hostear la aplicación. Sigue estos pasos una sola vez.

> ⏱️ Toma ~10 minutos. No necesitas instalar nada en tu compu.

---

## 1) Crear el proyecto en Supabase

1. Entra a <https://supabase.com> → crea una cuenta y un **New project**.
2. Anota la **contraseña** de la base de datos que definas (la usarás abajo).
3. Espera a que el proyecto termine de aprovisionarse (~1 min).

### 1a) Crear el bucket de constancias

1. En el menú lateral: **Storage** → **New bucket**.
2. Nombre: `constancias`. Déjalo como **privado** (NO marques "Public bucket").
3. Crear.

> La app genera enlaces temporales firmados para ver cada constancia, por eso
> el bucket puede (y debe) quedar privado.

### 1b) Obtener las credenciales

- **Cadena de conexión (DATABASE_URL):**
  **Project Settings → Database → Connection string → "Connection pooling"**.
  Copia la URI del modo **Transaction** (puerto **6543**) y reemplaza
  `[YOUR-PASSWORD]` por la contraseña del paso 1.
  Debe verse así:
  `postgresql://postgres.xxxx:TU_PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres`

- **SUPABASE_URL** y **SERVICE ROLE KEY:**
  **Project Settings → API**. Copia:
  - *Project URL* → `SUPABASE_URL`
  - *service_role* (¡secreta!) → `SUPABASE_SERVICE_ROLE_KEY`

(Las tablas se crean solas en el primer arranque. Si prefieres crearlas a mano,
pega el contenido de `supabase/schema.sql` en **SQL Editor** y ejecútalo.)

---

## 2) Desplegar en Vercel

1. Sube este repo a GitHub (ya está en tu rama).
2. Entra a <https://vercel.com> → **Add New… → Project** → importa el repositorio.
3. Framework Preset: **Other** (no toca nada más; ya hay `vercel.json`).
4. Antes de hacer deploy, abre **Environment Variables** y agrega:

   | Nombre | Valor |
   |---|---|
   | `DATABASE_URL` | la URI del pooler (puerto 6543) |
   | `SUPABASE_URL` | el Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | la service_role key |
   | `SUPABASE_BUCKET` | `constancias` |

5. **Deploy**. En ~1 minuto tendrás tu URL (algo como `tu-app.vercel.app`).

¡Listo! Abre la URL y empieza a registrar trabajadores y pagos.

---

## Probar localmente (opcional)

```bash
cp .env.example .env   # y completa los valores de Supabase
npm install
npm start              # http://localhost:3000
```

---

## Notas

- **Seguridad:** la app v1 no tiene login (cualquiera con la URL puede entrar).
  Si la vas a exponer públicamente, dime y le agrego autenticación, o protégela
  con [Vercel Password Protection](https://vercel.com/docs/security/deployment-protection).
- La `SERVICE_ROLE_KEY` es secreta y solo vive en el backend (variables de
  entorno de Vercel). Nunca se manda al navegador.
- Plan gratis de Supabase y Vercel: más que suficiente para uso personal.
