const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../data/whatsapp-config.json');

function parseDate(str) {
  if (!str) return null;
  str = String(str);
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  if (str.includes('-')) {
    const p = str.split('T')[0].split('-');
    if (p.length === 3) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function fmt(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getEffectiveValue(entry) {
  return entry.valor_pago || entry.valor || 0;
}

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function getEndOfWeek(today) {
  const end = new Date(today);
  const dayOfWeek = end.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d) {
  return d.toISOString().substring(0, 10);
}

function todayBR() {
  const now = new Date();
  const br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return new Date(br.getFullYear(), br.getMonth(), br.getDate());
}

function generateFullReport(entradas) {
  const today = todayBR();
  const todayKey = dateKey(today);
  const endOfWeek = getEndOfWeek(today);

  const recebidos = [];
  const atrasados = [];
  const semana = [];

  entradas.forEach(e => {
    const status = String(e.status || '').trim().toUpperCase();
    const nome = (e.cliente || '').trim().toUpperCase() || 'SEM NOME';
    const valor = getEffectiveValue(e);

    if (status === 'PAGO') {
      const dtPgto = parseDate(e.data_pagamento);
      if (dtPgto && dateKey(dateOnly(dtPgto)) === todayKey) {
        recebidos.push({ nome, valor });
      }
    } else if (status === 'PENDENTE') {
      const dtVenc = parseDate(e.data_vencimento);
      if (!dtVenc) return;

      const venc = dateOnly(dtVenc);

      if (venc < today) {
        atrasados.push({ nome, valor, vencimento: dtVenc });
      } else if (venc >= today && venc <= endOfWeek) {
        semana.push({ nome, valor, vencimento: dtVenc });
      }
    }
  });

  recebidos.sort((a, b) => b.valor - a.valor);
  atrasados.sort((a, b) => b.valor - a.valor);
  semana.sort((a, b) => a.valor - b.valor);

  let texto = '';

  if (recebidos.length > 0) {
    texto += '*RECEBIDOS*\n\n';
    recebidos.forEach(r => {
      texto += `${fmt(r.valor)} ${r.nome}✅\n`;
    });
    const total = recebidos.reduce((s, r) => s + r.valor, 0);
    texto += `\n*TOTAL ${fmt(total)}*\n`;
  }

  if (atrasados.length > 0) {
    if (texto) texto += '\n';
    texto += '*À RECEBER ATRASADOS*\n\n';
    atrasados.forEach(r => {
      texto += `${fmt(r.valor)} ${r.nome}🟡\n`;
    });
    const total = atrasados.reduce((s, r) => s + r.valor, 0);
    texto += `\n*TOTAL ${fmt(total)}*\n`;
  }

  if (semana.length > 0) {
    if (texto) texto += '\n';
    texto += '*À RECEBER SEMANA*\n\n';
    semana.forEach(r => {
      texto += `${fmt(r.valor)} ${r.nome} (${formatDate(r.vencimento)})\n`;
    });
    const total = semana.reduce((s, r) => s + r.valor, 0);
    texto += `\n*TOTAL ${fmt(total)}*\n`;
  }

  if (!texto) {
    texto = '*RELATÓRIO DIÁRIO*\n\nNenhum lançamento encontrado para hoje.';
  }

  return texto;
}

function generateAtrasadosReport(entradas) {
  const today = todayBR();

  const atrasados = [];

  entradas.forEach(e => {
    const status = String(e.status || '').trim().toUpperCase();
    if (status !== 'PENDENTE') return;

    const dtVenc = parseDate(e.data_vencimento);
    if (!dtVenc) return;

    const venc = dateOnly(dtVenc);
    if (venc < today) {
      atrasados.push({
        nome: ((e.cliente || '').trim().toUpperCase() || 'SEM NOME'),
        valor: getEffectiveValue(e),
        vencimento: dtVenc
      });
    }
  });

  atrasados.sort((a, b) => b.valor - a.valor);

  let texto = '';

  if (atrasados.length > 0) {
    const hoje = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
    texto += `⚠️ *COBRANÇA DO DIA — ${hoje}*\n\n`;
    atrasados.forEach(r => {
      texto += `${fmt(r.valor)} ${r.nome} (venc. ${formatDate(r.vencimento)})\n`;
    });
    const total = atrasados.reduce((s, r) => s + r.valor, 0);
    texto += `\n*TOTAL ATRASADO: ${fmt(total)}*`;
  } else {
    const hoje = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
    texto += `⚠️ *COBRANÇA DO DIA — ${hoje}*\n\nNenhum valor em atraso.`;
  }

  return texto;
}

function generateResumoReport(entradas) {
  const today = todayBR();
  const todayKey = dateKey(today);
  const endOfWeek = getEndOfWeek(today);

  let totalRecebidos = 0;
  let totalAtrasados = 0;
  let totalSemana = 0;

  entradas.forEach(e => {
    const status = String(e.status || '').trim().toUpperCase();

    if (status === 'PAGO') {
      const dtPgto = parseDate(e.data_pagamento);
      if (dtPgto && dateKey(dateOnly(dtPgto)) === todayKey) {
        totalRecebidos += getEffectiveValue(e);
      }
    } else if (status === 'PENDENTE') {
      const dtVenc = parseDate(e.data_vencimento);
      if (!dtVenc) return;
      const venc = dateOnly(dtVenc);
      if (venc < today) {
        totalAtrasados += getEffectiveValue(e);
      } else if (venc >= today && venc <= endOfWeek) {
        totalSemana += getEffectiveValue(e);
      }
    }
  });

  let texto = '*RESUMO DO DIA*\n\n';
  texto += `✅ Recebidos: ${fmt(totalRecebidos)}\n`;
  texto += `🟡 À Receber Atrasados: ${fmt(totalAtrasados)}\n`;
  texto += `📅 À Receber Semana: ${fmt(totalSemana)}\n`;
  texto += `\n💰 *Total Pendente: ${fmt(totalAtrasados + totalSemana)}*`;

  return texto;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao carregar whatsapp-config.json:', e.message);
  }
  return { recipients: [] };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = {
  generateFullReport,
  generateAtrasadosReport,
  generateResumoReport,
  loadConfig,
  saveConfig,
  parseDate,
  dateOnly,
  dateKey
};
