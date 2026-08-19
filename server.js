require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { registerAuthRoutes } = require('./src/auth');
const { initDb } = require('./src/db');
const { registerApiRoutes } = require('./src/routes/api');
const { registerLancamentoRoutes } = require('./src/routes/lancamento');
const { registerWhatsAppRoutes } = require('./src/routes/whatsapp');
const { registerComercialRoutes } = require('./src/routes/comercial');
const { registerClientesRoutes } = require('./src/routes/clientes');
const { initScheduler } = require('./src/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializa banco de dados (Google Sheets)
initDb();

// Arquivos estáticos da pasta public/
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
registerAuthRoutes(app);
registerApiRoutes(app);
registerLancamentoRoutes(app);
registerClientesRoutes(app);
registerWhatsAppRoutes(app);
registerComercialRoutes(app);

// Agendamento de mensagens WhatsApp
initScheduler();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 DAC Dashboard rodando na porta ${PORT}`);
});
