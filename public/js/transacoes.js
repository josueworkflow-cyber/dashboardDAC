/* ═══════════════════════════════════════════════
   transacoes.js — Tabelas de Entradas e Saídas
   ═══════════════════════════════════════════════ */

function renderEntradas() {
  const cl = document.getElementById('eCliente').value;
  const fp = document.getElementById('eForma').value;
  const fromVal = document.getElementById('eDateFrom').value;
  const toVal = document.getElementById('eDateTo').value;

  let rows = ENT;
  if (fromVal && toVal) rows = rows.filter(r =>
    isInRange(r.data_pagamento, fromVal, toVal) || isInRange(r.data_vencimento, fromVal, toVal)
  );
  if (cl) rows = rows.filter(r => r.cliente === cl);
  if (fp) rows = rows.filter(r => r.forma_pagamento === fp);

  document.getElementById('tbEntFull').innerHTML = rows.map(r => {
    const statusHtml = typeof renderStatusBadge === 'function' ? renderStatusBadge(r) : `<span class="stag sn">${r.status || 'Pendente'}</span>`;
    return `<tr>
      <td><span class="cbadge cbb">${r.categoria || ''}</span></td>
      <td class="tm">${r.observacoes || ''}</td>
      <td class="mono tg">${fmt(r.valor)}</td>
      <td><strong>${r.cliente || '—'}</strong></td>
      <td class="tm">${r.conta_bancaria || ''}</td>
      <td class="tm">${r.data_vencimento || ''}</td>
      <td class="tm">${r.data_pagamento || ''}</td>
      <td>${r.forma_pagamento || ''}</td>
      <td>${statusHtml}</td>
      <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : '—'}</td>
      <td class="tm">${r.nota_fiscal || '—'}</td>
    </tr>`;
  }).join('');
}

function renderSaidas() {
  const cat = document.getElementById('sCat').value;
  const forn = document.getElementById('sForn').value;
  const fromVal = document.getElementById('sDateFrom').value;
  const toVal = document.getElementById('sDateTo').value;

  let rows = SAI;
  if (fromVal && toVal) rows = rows.filter(r =>
    isInRange(r.data_pagamento, fromVal, toVal) || isInRange(r.data_vencimento, fromVal, toVal)
  );
  if (cat) rows = rows.filter(r => r.categoria === cat);
  if (forn) rows = rows.filter(r => r.fornecedor === forn);

  document.getElementById('tbSaiFull').innerHTML = rows.map(r => {
    const statusHtml = typeof renderStatusBadge === 'function' ? renderStatusBadge(r) : `<span class="stag sn">${r.status || 'Pendente'}</span>`;
    return `<tr>
      <td><span class="cbadge cbr">${r.categoria || ''}</span></td>
      <td class="tm">${r.observacoes || ''}</td>
      <td class="mono tr">${fmt(r.valor)}</td>
      <td><strong>${r.fornecedor || '—'}</strong></td>
      <td class="tm">${r.conta_bancaria || ''}</td>
      <td class="tm">${r.data_vencimento || ''}</td>
      <td class="tm">${r.data_pagamento || ''}</td>
      <td>${r.forma_pagamento || ''}</td>
      <td>${statusHtml}</td>
      <td>${typeof renderParcelaBadge === 'function' ? renderParcelaBadge(r) : '—'}</td>
    </tr>`;
  }).join('');
}
