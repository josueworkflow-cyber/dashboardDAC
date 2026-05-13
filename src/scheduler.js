const { sendMessage, checkStatus, isConfigured } = require('./whatsapp');
const { generateFullReport, generateAtrasadosReport, generateResumoReport, loadConfig } = require('./reports');
const { getSheetsModule } = require('./db');

let dailySentToday = false;
let morningSentToday = false;
let lastDateCheck = '';

function getBrTimeNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

async function dispatchToRecipients(config, entradas) {
  const active = config.recipients.filter(r => r.active);
  const results = [];

  for (const recipient of active) {
    try {
      let text;
      if (recipient.type === 'completo') {
        text = generateFullReport(entradas);
      } else if (recipient.type === 'atrasados') {
        text = generateAtrasadosReport(entradas);
      } else if (recipient.type === 'resumo') {
        text = generateResumoReport(entradas);
      } else {
        text = generateFullReport(entradas);
      }

      await sendMessage(recipient.number, text);
      results.push({ name: recipient.name, number: recipient.number, success: true });
      console.log(`✅ Mensagem enviada para ${recipient.name} (${recipient.type})`);
    } catch (err) {
      results.push({ name: recipient.name, number: recipient.number, success: false, error: err.message });
      console.error(`❌ Falha ao enviar para ${recipient.name}: ${err.message}`);
    }
  }

  return results;
}

async function executeDailyReport() {
  if (!isConfigured()) {
    console.log('⏰ Scheduler: Evolution API não configurada. Pulando...');
    return;
  }

  const config = loadConfig();
  const hour = config.schedule_hour || 17;
  console.log(`🕔 Iniciando relatório diário (${String(hour).padStart(2, '0')}h)...`);

  try {
    const sheets = getSheetsModule();
    const cache = sheets.getCacheData();

    if (!config.recipients || config.recipients.length === 0) {
      console.log('⚠️ Nenhum destinatário configurado.');
      return;
    }

    const results = await dispatchToRecipients(config, cache.entradas);
    console.log(`📊 Relatório diário concluído. ${results.filter(r => r.success).length}/${results.length} enviados.`);
  } catch (err) {
    console.error('❌ Erro ao executar relatório diário:', err.message);
  }
}

async function executeMorningAlert() {
  if (!isConfigured()) {
    console.log('⏰ Scheduler: Evolution API não configurada. Pulando...');
    return;
  }

  const config = loadConfig();
  const hour = config.morning_hour || 8;
  console.log(`🌅 Iniciando alerta matinal (${String(hour).padStart(2, '0')}h)...`);

  try {
    const sheets = getSheetsModule();
    const cache = sheets.getCacheData();

    const activeRecipients = (config.recipients || []).filter(r =>
      r.active && r.morning_alert !== false && (r.type === 'atrasados' || r.type === 'completo')
    );

    if (activeRecipients.length === 0) {
      console.log('⚠️ Nenhum destinatário de alerta matinal configurado (precisa ser tipo "atrasados" ou "completo").');
      return;
    }

    const atrasadosText = generateAtrasadosReport(cache.entradas);

    for (const recipient of activeRecipients) {
      try {
        await sendMessage(recipient.number, atrasadosText);
        console.log(`✅ Alerta matinal enviado para ${recipient.name}`);
      } catch (err) {
        console.error(`❌ Falha no alerta matinal para ${recipient.name}: ${err.message}`);
      }
    }

    console.log('📊 Alerta matinal concluído.');
  } catch (err) {
    console.error('❌ Erro ao executar alerta matinal:', err.message);
  }
}

function checkAndRun() {
  const now = getBrTimeNow();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  if (dateKey !== lastDateCheck) {
    dailySentToday = false;
    morningSentToday = false;
    lastDateCheck = dateKey;
  }

  if (day === 0 || day === 6) return;

  const dailyEnabled = process.env.WHATSAPP_DAILY_ENABLED !== 'false';
  const morningEnabled = process.env.WHATSAPP_MORNING_ENABLED === 'true';

  if (!dailyEnabled && !morningEnabled) return;

  const config = loadConfig();

  if (morningEnabled && !morningSentToday) {
    const morningHour = config.morning_hour || parseInt(process.env.WHATSAPP_MORNING_HOUR || '8', 10);
    if (hour === morningHour && minute === 0) {
      morningSentToday = true;
      executeMorningAlert();
    }
  }

  if (dailyEnabled && !dailySentToday) {
    const scheduleHour = config.schedule_hour || parseInt(process.env.WHATSAPP_SCHEDULE_HOUR || '17', 10);
    if (hour === scheduleHour && minute === 0) {
      dailySentToday = true;
      executeDailyReport();
    }
  }
}

let intervalId = null;

function initScheduler() {
  const dailyEnabled = process.env.WHATSAPP_DAILY_ENABLED !== 'false';
  const morningEnabled = process.env.WHATSAPP_MORNING_ENABLED === 'true';

  if (!dailyEnabled && !morningEnabled) {
    console.log('⏰ Agendamento WhatsApp desativado (WHATSAPP_DAILY_ENABLED=false e WHATSAPP_MORNING_ENABLED=false)');
    return;
  }

  const config = loadConfig();

  if (dailyEnabled) {
    const h = config.schedule_hour || 17;
    console.log(`⏰ Relatório diário agendado para ${String(h).padStart(2, '0')}:00 BRT (dias úteis)`);
  }

  if (morningEnabled) {
    const h = config.morning_hour || 8;
    console.log(`⏰ Alerta matinal agendado para ${String(h).padStart(2, '0')}:00 BRT (dias úteis)`);
  }

  console.log('   ⏱️  Scheduler verifica a cada 60s — alterações de horário aplicam sem reiniciar');

  intervalId = setInterval(checkAndRun, 60000);
}

module.exports = { initScheduler, executeDailyReport, executeMorningAlert, getBrTimeNow };
