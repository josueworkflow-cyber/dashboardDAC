const { auth } = require('../auth');
const { sendMessage, checkStatus, isConfigured } = require('../whatsapp');
const {
  generateFullReport,
  generateAtrasadosReport,
  generateResumoReport,
  loadConfig,
  saveConfig
} = require('../reports');
const { getSheetsModule } = require('../db');

function registerWhatsAppRoutes(app) {

  app.get('/api/whatsapp/status', auth, async (req, res) => {
    try {
      const status = await checkStatus();
      const configured = isConfigured();
      const config = loadConfig();
      res.json({
        ...status,
        configured,
        recipientsCount: config.recipients ? config.recipients.length : 0,
        scheduleHour: config.schedule_hour || 17,
        morningHour: config.morning_hour || 8
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/send', auth, async (req, res) => {
    if (req.userRole !== 'gestor') {
      return res.status(403).json({ error: 'Apenas gestores podem disparar mensagens' });
    }

    try {
      if (!isConfigured()) {
        return res.status(400).json({ error: 'Evolution API não configurada no servidor' });
      }

      const config = loadConfig();
      const { targetNumber, reportType } = req.body;

      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();

      let results = [];

      if (targetNumber) {
        const effectiveType = reportType || 'completo';
        let text;
        if (effectiveType === 'completo') text = generateFullReport(cache.entradas);
        else if (effectiveType === 'atrasados') text = generateAtrasadosReport(cache.entradas);
        else if (effectiveType === 'resumo') text = generateResumoReport(cache.entradas);
        else text = generateFullReport(cache.entradas);

        await sendMessage(targetNumber, text);
        results.push({ number: targetNumber, success: true, type: effectiveType });
      } else {
        const active = config.recipients.filter(r => r.active);
        for (const recipient of active) {
          try {
            let text;
            if (recipient.type === 'completo') text = generateFullReport(cache.entradas);
            else if (recipient.type === 'atrasados') text = generateAtrasadosReport(cache.entradas);
            else if (recipient.type === 'resumo') text = generateResumoReport(cache.entradas);
            else text = generateFullReport(cache.entradas);

            await sendMessage(recipient.number, text);
            results.push({ name: recipient.name, number: recipient.number, success: true, type: recipient.type });
          } catch (err) {
            results.push({ name: recipient.name, number: recipient.number, success: false, error: err.message, type: recipient.type });
          }
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/whatsapp/config', auth, async (req, res) => {
    if (req.userRole !== 'gestor') {
      return res.status(403).json({ error: 'Apenas gestores' });
    }
    try {
      const config = loadConfig();
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/whatsapp/config', auth, async (req, res) => {
    if (req.userRole !== 'gestor') {
      return res.status(403).json({ error: 'Apenas gestores' });
    }
    try {
      const newConfig = req.body;
      const current = loadConfig();

      current.schedule_hour = newConfig.schedule_hour ?? current.schedule_hour;
      current.morning_hour = newConfig.morning_hour ?? current.morning_hour;

      if (Array.isArray(newConfig.recipients)) {
        current.recipients = newConfig.recipients;
      }

      saveConfig(current);
      res.json({ success: true, config: current });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/preview', auth, async (req, res) => {
    if (req.userRole !== 'gestor') {
      return res.status(403).json({ error: 'Apenas gestores' });
    }
    try {
      const { reportType } = req.body;
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();

      let text;
      if (reportType === 'completo') text = generateFullReport(cache.entradas);
      else if (reportType === 'atrasados') text = generateAtrasadosReport(cache.entradas);
      else if (reportType === 'resumo') text = generateResumoReport(cache.entradas);
      else text = generateFullReport(cache.entradas);

      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/whatsapp/debug', async (req, res) => {
    try {
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const { parseDate, dateKey, dateOnly } = require('../reports');

      const today = new Date();
      const brNow = new Date(today.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayDateOnly = new Date(brNow.getFullYear(), brNow.getMonth(), brNow.getDate());
      const todayKey = dateKey(todayDateOnly);

      const allStatuses = {};
      const pagoEntries = [];

      cache.entradas.forEach(e => {
        const status = String(e.status || '').trim().toUpperCase();
        allStatuses[status] = (allStatuses[status] || 0) + 1;
      });

      const pagos = cache.entradas
        .filter(e => String(e.status || '').trim().toUpperCase() === 'PAGO')
        .map(e => {
          const dtPgto = parseDate(e.data_pagamento);
          return {
            cliente: e.cliente,
            valor: e.valor || e.valor_pago || 0,
            data_pagamento_raw: String(e.data_pagamento || ''),
            data_pagamento_type: typeof e.data_pagamento,
            data_vencimento: e.data_vencimento,
            parsed: dtPgto ? dateKey(dateOnly(dtPgto)) : null,
            matches: dtPgto ? dateKey(dateOnly(dtPgto)) === todayKey : false,
            empty_data: !e.data_pagamento || String(e.data_pagamento).trim() === ''
          };
        })
        .sort((a, b) => {
          if (a.parsed && b.parsed) return b.parsed.localeCompare(a.parsed);
          if (a.parsed) return -1;
          if (b.parsed) return 1;
          return 0;
        });

      const pagosSemData = pagos.filter(p => p.empty_data);
      const pagosRecentes = pagos.filter(p => !p.empty_data).slice(0, 30);

      res.json({
        serverTime: today.toISOString(),
        serverTimeLocal: today.toString(),
        brTime: brNow.toString(),
        todayDateOnly: todayDateOnly.toISOString(),
        todayKey,
        totalEntradas: cache.entradas.length,
        allStatuses,
        pagoCount: pagos.length,
        semDataPagamento: pagosSemData.length,
        pagosSemData: pagosSemData.slice(0, 10),
        matchToday: pagos.filter(p => p.matches).length,
        pagosRecentes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('📱 Rotas WhatsApp registradas');
}

module.exports = { registerWhatsAppRoutes };
