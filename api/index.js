'use strict';

// Entrypoint para Vercel: la función serverless usa la app de Express.
// Todas las rutas /api/* se redirigen aquí vía vercel.json.
module.exports = require('../lib/app');
