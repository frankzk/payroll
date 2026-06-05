'use strict';

// Entrypoint para correr localmente: lee .env y levanta el servidor.
require('dotenv').config();

const app = require('./lib/app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Planillas corriendo en http://localhost:${PORT}`);
});
