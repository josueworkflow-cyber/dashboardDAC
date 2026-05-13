const { auth } = require('../auth');
const { getSheetsModule } = require('../db');

function registerApiRoutes(app) {
  // Retorna todos os dados (entradas + saídas)
  app.get('/api/all', auth, async (req, res) => {
    try {
      const sheets = getSheetsModule();
      const data = sheets.getCacheData();
      return res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Retorna configuração do servidor
  app.get('/api/config', auth, (req, res) => {
    res.json({
      sheetsMode: true
    });
  });

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      const sheets = getSheetsModule();
      res.json({ status: 'ok', mode: 'sheets', connected: sheets.isConnected() });
    } catch (err) {
      res.status(500).json({ status: 'error', db: err.message });
    }
  });
}

module.exports = { registerApiRoutes };
