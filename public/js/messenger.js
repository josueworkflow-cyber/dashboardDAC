/* ═══════════════════════════════════════════════
   messenger.js — Página Messenger
   Gestão de destinatários e disparos WhatsApp
   ═══════════════════════════════════════════════ */

let msgConfig = { recipients: [], schedule_hour: 17, morning_hour: 8 };

function initMessenger() {
  loadMessengerStatus();
  loadMessengerConfig();
  loadPreview();
}

async function loadMessengerStatus() {
  try {
    const resp = await authFetch('/api/whatsapp/status');
    const data = await resp.json();

    const dot = document.getElementById('msgStatusDot');
    const label = document.getElementById('msgStatusLabel');

    if (data.connected) {
      dot.className = 'msg-status-dot online';
      label.textContent = 'WhatsApp Conectado';
    } else if (!data.configured) {
      dot.className = 'msg-status-dot offline';
      label.textContent = 'API não configurada';
    } else {
      dot.className = 'msg-status-dot offline';
      label.textContent = 'WhatsApp Desconectado';
    }

    document.getElementById('msgLastSync').textContent =
      `Instância: ${data.instance || '—'} · ${data.state || '—'}`;
  } catch (err) {
    document.getElementById('msgStatusDot').className = 'msg-status-dot offline';
    document.getElementById('msgStatusLabel').textContent = 'Erro ao verificar';
  }
}

async function loadMessengerConfig() {
  try {
    const resp = await authFetch('/api/whatsapp/config');
    const data = await resp.json();
    msgConfig = data;

    document.getElementById('msgScheduleHour').value = data.schedule_hour || 17;
    document.getElementById('msgMorningHour').value = data.morning_hour || 8;

    renderRecipients();
  } catch (err) {
    showFeedback('Erro ao carregar configuração: ' + err.message, 'error');
  }
}

function renderRecipients() {
  const tbody = document.getElementById('msgRecipientsTbody');
  const recipients = msgConfig.recipients || [];

  if (recipients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:24px;">Nenhum destinatário configurado</td></tr>';
    return;
  }

  tbody.innerHTML = recipients.map((r, i) => `
    <tr>
      <td style="font-weight:600;">${esc(r.name)}</td>
      <td class="mono">${esc(r.number)}</td>
      <td><span class="msg-badge ${r.type}">${r.type}</span></td>
      <td>
        <label class="msg-toggle">
          <input type="checkbox" ${r.morning_alert !== false ? 'checked' : ''} onchange="toggleMorningAlert(${i}, this.checked)">
          <span class="msg-toggle-slider"></span>
        </label>
      </td>
      <td>
        <label class="msg-toggle">
          <input type="checkbox" ${r.active ? 'checked' : ''} onchange="toggleRecipient(${i}, this.checked)">
          <span class="msg-toggle-slider"></span>
        </label>
      </td>
      <td>
        <button class="msg-btn small" onclick="sendToRecipient(${i})" title="Testar envio" style="margin-right:4px;">📤</button>
        <button class="msg-btn small danger" onclick="removeRecipient(${i})" title="Remover">✕</button>
      </td>
    </tr>
  `).join('');
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function addRecipient() {
  const name = document.getElementById('msgNewName').value.trim();
  const number = document.getElementById('msgNewNumber').value.trim();
  const type = document.getElementById('msgNewType').value;
  const morningAlert = document.getElementById('msgNewMorning').checked;

  if (!name || !number) {
    showFeedback('Preencha nome e número', 'info');
    return;
  }

  if (!/^\d+$/.test(number)) {
    showFeedback('Número deve conter apenas dígitos (ex: 5521999999999)', 'error');
    return;
  }

  const newId = (msgConfig.recipients || []).reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
  msgConfig.recipients = [...(msgConfig.recipients || []), { id: newId, name, number, type, morning_alert: morningAlert, active: true }];

  await saveConfig();

  document.getElementById('msgNewName').value = '';
  document.getElementById('msgNewNumber').value = '';
  renderRecipients();

  showFeedback(`${name} adicionado com sucesso`, 'success');
  setTimeout(() => hideFeedback(), 3000);
}

async function removeRecipient(index) {
  const r = msgConfig.recipients[index];
  if (!r) return;
  if (!confirm(`Remover ${r.name} da lista?`)) return;

  msgConfig.recipients.splice(index, 1);
  await saveConfig();
  renderRecipients();
  showFeedback(`${r.name} removido`, 'success');
  setTimeout(() => hideFeedback(), 3000);
}

async function toggleRecipient(index, active) {
  msgConfig.recipients[index].active = active;
  await saveConfig();
}

async function toggleMorningAlert(index, value) {
  msgConfig.recipients[index].morning_alert = value;
  await saveConfig();
}

async function updateScheduleHours() {
  msgConfig.schedule_hour = parseInt(document.getElementById('msgScheduleHour').value);
  msgConfig.morning_hour = parseInt(document.getElementById('msgMorningHour').value);
  await saveConfig();
  showFeedback('Horários atualizados. Alteração aplica em até 60 segundos.', 'success');
  setTimeout(() => hideFeedback(), 4000);
}

async function saveConfig() {
  try {
    await authFetch('/api/whatsapp/config', {
      method: 'PUT',
      body: JSON.stringify(msgConfig)
    });
  } catch (err) {
    showFeedback('Erro ao salvar: ' + err.message, 'error');
  }
}

async function sendToTarget() {
  const number = document.getElementById('msgTargetNumber').value.trim();
  const type = document.getElementById('msgTargetType').value;

  if (!number) {
    showFeedback('Digite o número de destino', 'info');
    return;
  }

  if (!/^\d+$/.test(number)) {
    showFeedback('Número deve conter apenas dígitos', 'error');
    return;
  }

  if (!confirm(`Enviar relatório "${type}" para ${number}?`)) return;

  showFeedback('Enviando...', 'info');

  try {
    const resp = await authFetch('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ targetNumber: number, reportType: type })
    });
    const data = await resp.json();

    if (data.results && data.results[0]?.success) {
      showFeedback(`✅ Mensagem enviada para ${number}`, 'success');
    } else {
      showFeedback(`Erro: ${data.results?.[0]?.error || data.error || 'Falha'}`, 'error');
    }
  } catch (err) {
    showFeedback('Erro: ' + err.message, 'error');
  }
}

async function sendToAll() {
  const active = (msgConfig.recipients || []).filter(r => r.active);
  if (active.length === 0) {
    showFeedback('Nenhum destinatário ativo', 'info');
    return;
  }

  const names = active.map(r => r.name).join(', ');
  if (!confirm(`Enviar para ${active.length} destinatário(s): ${names}?`)) return;

  showFeedback(`Enviando para ${active.length} destinatário(s)...`, 'info');

  try {
    const resp = await authFetch('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await resp.json();

    const success = data.results ? data.results.filter(r => r.success).length : 0;
    const failed = data.results ? data.results.filter(r => !r.success).length : 0;

    if (failed === 0) {
      showFeedback(`✅ ${success}/${success} enviados com sucesso`, 'success');
    } else {
      showFeedback(`${success} enviados, ${failed} falhas`, 'error');
    }
  } catch (err) {
    showFeedback('Erro: ' + err.message, 'error');
  }
}

async function sendToRecipient(index) {
  const r = msgConfig.recipients[index];
  if (!r) return;

  if (!confirm(`Enviar relatório "${r.type}" para ${r.name} (${r.number})?`)) return;

  showFeedback('Enviando...', 'info');

  try {
    const resp = await authFetch('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ targetNumber: r.number, reportType: r.type })
    });
    const data = await resp.json();

    if (data.results && data.results[0]?.success) {
      showFeedback(`✅ Enviado para ${r.name}`, 'success');
    } else {
      showFeedback(`Erro: ${data.results?.[0]?.error || data.error || 'Falha'}`, 'error');
    }
  } catch (err) {
    showFeedback('Erro: ' + err.message, 'error');
  }
}

async function loadPreview() {
  const type = document.getElementById('msgPreviewType').value;
  const previewEl = document.getElementById('msgPreview');

  previewEl.textContent = 'Carregando...';

  try {
    const resp = await authFetch('/api/whatsapp/preview', {
      method: 'POST',
      body: JSON.stringify({ reportType: type })
    });
    const data = await resp.json();
    previewEl.textContent = data.text || 'Sem dados para exibir';
  } catch (err) {
    previewEl.textContent = 'Erro ao carregar prévia: ' + err.message;
  }
}

function showFeedback(msg, type) {
  const el = document.getElementById('msgFeedback');
  el.textContent = msg;
  el.className = 'msg-feedback ' + type;
}

function hideFeedback() {
  const el = document.getElementById('msgFeedback');
  el.className = 'msg-feedback';
  el.textContent = '';
}
