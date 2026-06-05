'use strict';

const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_BUCKET || 'constancias';
const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente con la service role key: sube/borra archivos saltándose RLS.
// Se usa solo en el backend, NUNCA se expone al navegador.
let supabase = null;
if (URL && SERVICE_KEY) {
  supabase = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
} else {
  console.warn('[storage] Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Las subidas de constancias fallarán.');
}

function ensure() {
  if (!supabase) {
    throw new Error('Almacenamiento no configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
}

async function uploadConstancia(buffer, originalname, contentType) {
  ensure();
  const ext = path.extname(originalname || '').toLowerCase();
  const objectPath = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType: contentType || 'application/octet-stream', upsert: false });
  if (error) throw new Error('No se pudo subir la constancia: ' + error.message);
  return objectPath;
}

// URL firmada temporal para ver la constancia (el bucket es privado).
async function signedUrl(objectPath, expiresIn = 120) {
  ensure();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, expiresIn);
  if (error) throw new Error('No se pudo generar el enlace: ' + error.message);
  return data.signedUrl;
}

async function removeConstancia(objectPath) {
  if (!supabase || !objectPath) return;
  try {
    await supabase.storage.from(BUCKET).remove([objectPath]);
  } catch {
    /* no bloqueamos la operación principal si falla el borrado */
  }
}

module.exports = { uploadConstancia, signedUrl, removeConstancia, configured: () => !!supabase, BUCKET };
