const { auth } = require('../auth');
const { getSheetsModule } = require('../db');
const crypto = require('crypto');

const FINANCIAL_STATUSES = new Map([
  ['pago', 'Pago'],
  ['pendente', 'Pendente'],
  ['cancelado', 'Cancelado']
]);

const FINANCIAL_MODALITIES = new Map([
  ['pago', 'Pago'],
  ['pendente', 'Pendente'],
  ['cancelado', 'Cancelado'],
  ['parcial', 'Parcial'],
  ['parcelado', 'Parcelado']
]);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeComparable(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeTipo(value) {
  const normalized = normalizeComparable(value);
  if (normalized === 'entrada') return 'entrada';
  if (normalized === 'saida') return 'saida';
  throw httpError(400, 'Tipo inválido. Use "entrada" ou "saida".');
}

function normalizeMovimentacao(value, fallbackTipo) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallbackTipo === 'entrada'
      ? { tipo: 'entrada', label: 'Entrada' }
      : { tipo: 'saida', label: 'Saída' };
  }

  const normalized = normalizeComparable(value);
  if (normalized === 'entrada') return { tipo: 'entrada', label: 'Entrada' };
  if (normalized === 'saida') return { tipo: 'saida', label: 'Saída' };
  throw httpError(400, 'Movimentação inválida. Use "Entrada" ou "Saída".');
}

function parseMoneyToCents(value, fieldName, { allowZero = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw httpError(400, `${fieldName} é obrigatório.`);
  }

  let parsed;
  if (typeof value === 'number') {
    parsed = value;
  } else {
    let text = String(value)
      .replace(/R\$\s*/gi, '')
      .replace(/\s/g, '')
      .trim();

    if (text.includes(',') && text.includes('.')) {
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        text = text.replace(/,/g, '');
      }
    } else if (text.includes(',')) {
      text = text.replace(/\./g, '').replace(',', '.');
    }
    parsed = Number(text);
  }

  const rawCents = parsed * 100;
  const cents = Math.round(rawCents);
  if (
    !Number.isFinite(parsed) ||
    !Number.isSafeInteger(cents) ||
    Math.abs(rawCents - cents) > 1e-6
  ) {
    throw httpError(400, `${fieldName} deve ser um valor monetário válido.`);
  }
  if (allowZero ? cents < 0 : cents <= 0) {
    throw httpError(400, `${fieldName} deve ser ${allowZero ? 'maior ou igual a zero' : 'maior que zero'}.`);
  }
  return cents;
}

function normalizeDate(value, fieldName, { required = true } = {}) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) {
    if (required) throw httpError(400, `${fieldName} é obrigatória.`);
    return '';
  }

  let day, month, year;
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw httpError(400, `${fieldName} deve estar no formato DD/MM/AAAA ou AAAA-MM-DD.`);
    }
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw httpError(400, `${fieldName} contém uma data inválida.`);
  }

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function normalizeStatus(value, index) {
  const status = FINANCIAL_STATUSES.get(normalizeComparable(value));
  if (!status) {
    throw httpError(
      400,
      `Status inválido no item ${index + 1}. Use Pago, Pendente ou Cancelado.`
    );
  }
  return status;
}

function normalizeModality(value) {
  const modality = FINANCIAL_MODALITIES.get(normalizeComparable(value));
  if (!modality) {
    throw httpError(
      400,
      'Modalidade inválida. Use Pago, Pendente, Cancelado, Parcial ou Parcelado.'
    );
  }
  return modality;
}

function inferModalityFromItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(400, 'itens deve ser um array não vazio.');
  }

  const statuses = rawItems.map((item, index) => normalizeStatus(item && item.status, index));
  if (statuses.every(status => status === 'Pago')) return 'Pago';
  if (statuses.every(status => status === 'Pendente')) {
    return statuses.length > 1 ? 'Parcelado' : 'Pendente';
  }
  if (statuses.every(status => status === 'Cancelado')) return 'Cancelado';

  const onlyPaidAndPending = statuses.every(status => status === 'Pago' || status === 'Pendente');
  const hasPaid = statuses.includes('Pago');
  const hasPending = statuses.includes('Pendente');
  if (onlyPaidAndPending && hasPaid && hasPending) return 'Parcial';

  throw httpError(400, 'Não foi possível inferir a modalidade a partir dos status dos itens.');
}

function extractParcelGroupId(parcelaRef) {
  const match = String(parcelaRef || '').match(/\[(PRC-[^\]]+)\]/i);
  return match ? match[1] : null;
}

function belongsToParcelGroup(parcelaRef, groupId) {
  const extracted = extractParcelGroupId(parcelaRef);
  return Boolean(
    extracted &&
    groupId &&
    extracted.toUpperCase() === String(groupId).toUpperCase()
  );
}

function generateParcelGroupId(cache) {
  const existing = new Set(
    [...(cache.entradas || []), ...(cache.saidas || [])]
      .map(row => extractParcelGroupId(row.parcela_ref))
      .filter(Boolean)
      .map(value => value.toUpperCase())
  );

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const candidate = `PRC-${timestamp}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw httpError(500, 'Não foi possível gerar um identificador único para o parcelamento.');
}

function validateModalityItems(modality, items) {
  if (modality === 'Pago' || modality === 'Pendente' || modality === 'Cancelado') {
    if (!items.every(item => item.status === modality)) {
      throw httpError(
        400,
        `A modalidade ${modality} exige que todos os itens tenham status ${modality}.`
      );
    }
    return;
  }

  if (items.length < 2) {
    throw httpError(400, `A modalidade ${modality} exige pelo menos dois itens.`);
  }

  if (modality === 'Parcelado') {
    if (!items.every(item => item.status === 'Pendente')) {
      throw httpError(400, 'A modalidade Parcelado exige que todos os itens estejam Pendentes.');
    }
    return;
  }

  if (modality === 'Parcial') {
    if (items.some(item => item.status === 'Cancelado')) {
      throw httpError(400, 'A modalidade Parcial aceita somente itens Pagos e Pendentes.');
    }
    const hasPaid = items.some(item => item.status === 'Pago');
    const hasPending = items.some(item => item.status === 'Pendente');
    if (!hasPaid || !hasPending) {
      throw httpError(400, 'A modalidade Parcial exige ao menos um item Pago e um Pendente.');
    }
  }
}

function normalizeReconfigurationItems(rawItems, valorTotalCents, modality) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(400, 'itens deve ser um array não vazio.');
  }
  if (rawItems.length > 48) {
    throw httpError(400, 'O lançamento não pode ter mais de 48 itens.');
  }

  const items = rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw httpError(400, `Item ${index + 1} inválido.`);
    }

    const valorCents = parseMoneyToCents(rawItem.valor, `valor do item ${index + 1}`);
    const status = normalizeStatus(rawItem.status, index);
    const valorPagoCents = parseMoneyToCents(
      rawItem.valor_pago === undefined || rawItem.valor_pago === null || rawItem.valor_pago === ''
        ? 0
        : rawItem.valor_pago,
      `valor_pago do item ${index + 1}`,
      { allowZero: true }
    );
    const dataVencimento = normalizeDate(
      rawItem.data_vencimento,
      `data_vencimento do item ${index + 1}`
    );
    const hasPaymentDate = rawItem.data_pagamento !== undefined &&
      rawItem.data_pagamento !== null &&
      String(rawItem.data_pagamento).trim() !== '';

    let dataPagamento = '';
    if (status === 'Pago') {
      if (valorPagoCents <= 0) {
        throw httpError(
          400,
          `Item ${index + 1} Pago deve ter valor_pago maior que zero.`
        );
      }
      dataPagamento = normalizeDate(
        rawItem.data_pagamento,
        `data_pagamento do item ${index + 1}`
      );
    } else {
      if (valorPagoCents !== 0) {
        throw httpError(
          400,
          `Item ${index + 1} ${status} deve ter valor_pago igual a zero.`
        );
      }
      if (hasPaymentDate) {
        throw httpError(
          400,
          `Item ${index + 1} ${status} não pode ter data_pagamento.`
        );
      }
    }

    return {
      valor: valorCents / 100,
      valorCents,
      data_vencimento: dataVencimento,
      status,
      valor_pago: valorPagoCents / 100,
      data_pagamento: dataPagamento
    };
  });

  const sumCents = items.reduce((sum, item) => sum + item.valorCents, 0);
  if (sumCents !== valorTotalCents) {
    throw httpError(
      400,
      `A soma dos itens (${(sumCents / 100).toFixed(2)}) deve ser igual a valor_total (${(valorTotalCents / 100).toFixed(2)}).`
    );
  }

  validateModalityItems(modality, items);
  return items;
}

function registerLancamentoRoutes(app) {
  // Envia um novo lançamento direto no Google Sheets
  app.post('/api/lancamento', auth, async (req, res) => {
    try {
      const {
        movimentacao, categoria, observacoes, fornecedor, valor,
        conta_bancaria, data_vencimento, data_pagamento, data_emissao, forma_pagamento, status,
        num_parcelas, valor_pago, modo_emissao, nota_fiscal,
        isEstoque, data: dataEstoque, pagamento, parcelas, empresa
      } = req.body;

      if (isEstoque) {
        if (!valor || !dataEstoque) {
          return res.status(400).json({
            error: 'Campos obrigatórios para estoque: valor, data.'
          });
        }
      } else {
        if (!movimentacao || !categoria || !valor || !data_vencimento) {
          return res.status(400).json({
            error: 'Campos obrigatórios: movimentação, categoria, valor, data de vencimento.'
          });
        }
      }

      const sheets = getSheetsModule();
      let data;

      if (isEstoque) {
        data = {
          isEstoque: true,
          fornecedor: fornecedor || '',
          valor: parseFloat(valor) || 0,
          data: dataEstoque || '',
          pagamento: pagamento || '',
          movimentacao: movimentacao || 'Entrada',
          nota_fiscal: nota_fiscal || '',
          parcelas: parcelas || '',
          empresa: empresa || '',
          forma_pagamento: forma_pagamento || '',
          modo_emissao: modo_emissao || '',
          observacao: req.body.observacao || '',
          ref_orcamento: req.body.ref_orcamento || '',
          status: 'Finalizado',
          data_vencimento: '',
          vendedor: ''
        };
      } else {
        data = {
          movimentacao: movimentacao || 'Entrada',
          categoria: categoria || '',
          modo_emissao: modo_emissao || '',
          valor: parseFloat(valor) || 0,
          fornecedor: fornecedor || req.body.cliente || '',
          cliente: fornecedor || req.body.cliente || '',
          conta_bancaria: conta_bancaria || '',
          data_vencimento: data_vencimento || '',
          data_pagamento: data_pagamento || '',
          forma_pagamento: forma_pagamento || '',
          status: status || 'Pendente',
          empresa: empresa || '',
          num_parcelas: parseInt(num_parcelas, 10) || 0,
          valor_pago: parseFloat(valor_pago) || 0,
          parcela_ref: req.body.parcela_ref || '',
          observacoes: observacoes || req.body.observacao || '',
          data_emissao: data_emissao || ''
        };
      }

      const result = await sheets.appendRow(movimentacao, data);
      console.log(`✅ Lançamento gravado no Sheets (${result.sheetName}): ${movimentacao} - ${isEstoque ? data.fornecedor : data.categoria} - R$ ${valor}`);
      return res.json({
        success: true,
        message: `Lançamento registrado na planilha "${result.sheetName}" com sucesso!`
      });

    } catch (err) {
      console.error('❌ Erro ao enviar lançamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Reconfigura um lançamento simples ou um grupo de parcelas de forma atômica.
  // O array `itens` é autoritativo: a linha/grupo anterior é integralmente
  // substituído pelo novo cronograma, inclusive em troca Entrada <-> Saída.
  app.put('/api/lancamento/reconfigurar/:tipo/:id', auth, async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const sourceTipo = normalizeTipo(req.params.tipo);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw httpError(400, 'ID de lançamento inválido.');
      }

      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const sourceRows = sourceTipo === 'entrada' ? cache.entradas : cache.saidas;
      const current = sourceRows.find(row => Number(row.id) === id);
      if (!current) {
        throw httpError(404, 'Lançamento não encontrado.');
      }

      const modality = normalizeModality(payload.modalidade);
      const valorTotalCents = parseMoneyToCents(payload.valor_total, 'valor_total');
      const items = normalizeReconfigurationItems(
        payload.itens,
        valorTotalCents,
        modality
      );

      const movement = normalizeMovimentacao(payload.movimentacao, sourceTipo);
      const targetTipo = movement.tipo;
      const targetRows = targetTipo === 'entrada' ? cache.entradas : cache.saidas;
      const sourceSheetName = sourceTipo === 'entrada' ? 'Entradas' : 'Saídas';
      const targetSheetName = targetTipo === 'entrada' ? 'Entradas' : 'Saídas';

      const existingGroupId = extractParcelGroupId(current.parcela_ref);
      const existingGroupKey = existingGroupId ? existingGroupId.toUpperCase() : null;
      const rowsToReplace = existingGroupId
        ? sourceRows.filter(row => {
          const rowGroupId = extractParcelGroupId(row.parcela_ref);
          return rowGroupId && rowGroupId.toUpperCase() === existingGroupKey;
        })
        : [current];
      const sourceIds = rowsToReplace
        .map(row => Number(row.id))
        .filter(rowId => Number.isInteger(rowId) && rowId > 0);

      if (sourceIds.length === 0) {
        throw httpError(409, 'O lançamento não possui linhas válidas para substituição.');
      }

      const readCommon = (field, fallback = '') => {
        if (payload[field] !== undefined && payload[field] !== null) {
          return String(payload[field]).trim();
        }
        return fallback === undefined || fallback === null ? '' : String(fallback).trim();
      };

      const categoria = readCommon('categoria', current.categoria);
      if (!categoria) throw httpError(400, 'categoria é obrigatória.');

      const personFromRequest = payload.fornecedor !== undefined
        ? payload.fornecedor
        : payload.cliente;
      const person = personFromRequest !== undefined && personFromRequest !== null
        ? String(personFromRequest).trim()
        : String(current.cliente || current.fornecedor || '').trim();

      const observacoes = payload.observacoes !== undefined
        ? readCommon('observacoes')
        : payload.observacao !== undefined
          ? readCommon('observacao')
          : String(current.observacoes || '').trim();
      const dataEmissaoRaw = payload.data_emissao !== undefined
        ? payload.data_emissao
        : current.data_emissao;
      const dataEmissao = normalizeDate(dataEmissaoRaw, 'data_emissao', { required: false });

      const totalItems = items.length;
      const groupId = totalItems > 1
        ? (existingGroupId || generateParcelGroupId(cache))
        : null;

      const commonData = {
        movimentacao: movement.label,
        categoria,
        modo_emissao: readCommon('modo_emissao', current.modo_emissao),
        cliente: person,
        fornecedor: person,
        conta_bancaria: readCommon('conta_bancaria', current.conta_bancaria),
        forma_pagamento: readCommon('forma_pagamento', current.forma_pagamento),
        empresa: readCommon('empresa', current.empresa),
        observacoes,
        data_emissao: dataEmissao
      };

      const newRows = items.map((item, index) => ({
        ...commonData,
        valor: item.valor,
        data_vencimento: item.data_vencimento,
        data_pagamento: item.data_pagamento,
        status: item.status,
        num_parcelas: totalItems,
        valor_pago: item.valor_pago,
        parcela_ref: groupId ? `${index + 1}/${totalItems} [${groupId}]` : ''
      }));

      const lastTargetId = targetRows.reduce((maxId, row) => {
        const rowId = Number(row.id);
        return Number.isInteger(rowId) && rowId > maxId ? rowId : maxId;
      }, 0);
      const targetStartId = sourceTipo === targetTipo
        ? Math.min(...sourceIds)
        : lastTargetId + 1;

      const result = await sheets.replaceRowsAtomic({
        sourceSheetName,
        sourceIds,
        targetSheetName,
        targetStartId,
        rows: newRows
      });

      if (
        !result ||
        result.deletedCount !== sourceIds.length ||
        result.insertedCount !== newRows.length
      ) {
        throw httpError(500, 'O Google Sheets não confirmou todas as linhas da reconfiguração.');
      }

      return res.json({
        success: true,
        message: totalItems > 1
          ? `Lançamento reconfigurado em ${totalItems} parcelas com sucesso!`
          : 'Lançamento reconfigurado com sucesso!',
        modalidade: modality,
        movimentacao: movement.label,
        grupo_id: groupId,
        linhas_removidas: result.deletedCount,
        linhas_criadas: result.insertedCount
      });
    } catch (err) {
      const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
      if (statusCode >= 500) {
        console.error('❌ Erro ao reconfigurar lançamento:', err.message);
      }
      return res.status(statusCode).json({ error: err.message });
    }
  });

  // Exclui um lançamento
  app.delete('/api/lancamento/:tipo/:id', auth, async (req, res) => {
    try {
      const { tipo, id } = req.params;
      const sheets = getSheetsModule();
      let sheetName;
      if (tipo === 'estoque') sheetName = 'Estoque';
      else sheetName = tipo === 'entrada' ? 'Entradas' : 'Saídas';

      // Verifica se faz parte de um grupo de parcelas
      const cache = sheets.getCacheData();
      const rows = tipo === 'entrada' ? cache.entradas : cache.saidas;
      const target = rows.find(r => String(r.id) === String(id));

      const targetGroupId = target ? extractParcelGroupId(target.parcela_ref) : null;
      if (targetGroupId) {
          const idsToDelete = rows
            .filter(r => belongsToParcelGroup(r.parcela_ref, targetGroupId))
            .map(r => r.id);

          if (idsToDelete.length > 1) {
            await sheets.deleteMultipleRows(sheetName, idsToDelete);
            return res.json({ 
              success: true, 
              message: `Todas as ${idsToDelete.length} parcelas do grupo foram excluídas!` 
            });
          }
      }

      // Deleção normal se não for grupo
      await sheets.deleteRow(sheetName, parseInt(id, 10));
      return res.json({ success: true, message: 'Lançamento excluído com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao excluir lançamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Atualiza campo(s) múltiplos
  app.put('/api/lancamento/:tipo/:id', auth, async (req, res) => {
    try {
      const { tipo, id } = req.params;
      
      const allowedFields = [
        'movimentacao', 'categoria', 'observacoes', 'valor', 'fornecedor', 'cliente',
        'conta_bancaria', 'data_vencimento', 'data_pagamento', 'data_emissao',
        'forma_pagamento', 'status', 'num_parcelas', 'valor_pago',
        'data', 'pagamento', 'parcelas', 'empresa', 'modo_emissao', 'parcela_ref', 'nota_fiscal',
        'observacao', 'ref_orcamento', 'vendedor'
      ];
      const updates = {};
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) {
          updates[f] = req.body[f];
          // Se for fornecedor, também seta cliente para compatibilidade com a aba de Entradas
          if (f === 'fornecedor') updates.cliente = req.body[f];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo válido para atualização.' });
      }

      const sheets = getSheetsModule();

      // Lógica de migração para Gestão de Dados (Entradas <-> Saídas)
      if (tipo !== 'estoque' && req.body.movimentacao) {
        // Normaliza para comparação (remove acentos: Saída -> saida)
        const novaMovNorm = req.body.movimentacao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const tipoOriginal = tipo.toLowerCase(); // 'entrada' ou 'saida' (sempre sem acento do params)
        
        const mudouTipo = (tipoOriginal === 'entrada' && novaMovNorm.includes('saida')) || 
                        (tipoOriginal === 'saida' && novaMovNorm.includes('entrada'));

        if (mudouTipo) {
          const sheetNameOriginal = tipoOriginal === 'entrada' ? 'Entradas' : 'Saídas';
          
          // Deleta da aba original
          await sheets.deleteRow(sheetNameOriginal, parseInt(id, 10));
          
          // Prepara dados para adicionar na nova aba
          const dataToAppend = { ...req.body };
          if (novaMovNorm.includes('entrada')) {
            dataToAppend.cliente = dataToAppend.fornecedor || dataToAppend.cliente;
          }
          
          // Adiciona na aba correta (appendRow cuida disso baseado na movimentacao)
          await sheets.appendRow(req.body.movimentacao, dataToAppend);
          
          return res.json({ 
            success: true, 
            message: `Lançamento movido para ${req.body.movimentacao} com sucesso!` 
          });
        }
      }

      let sheetName;
      if (tipo === 'estoque') sheetName = 'Estoque';
      else sheetName = tipo === 'entrada' ? 'Entradas' : 'Saídas';
      await sheets.updateRow(sheetName, parseInt(id, 10), updates);
      return res.json({ success: true, message: 'Registro atualizado com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao atualizar lançamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Novo endpoint para lançamentos parcelados (batch)
  app.post('/api/lancamento/parcelado', auth, async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const rawItems = Array.isArray(payload.parcelas) ? payload.parcelas : payload.itens;
      const movimentacao = String(payload.movimentacao || '').trim();
      const categoria = String(payload.categoria || '').trim();
      if (!movimentacao || !categoria) {
        throw httpError(400, 'Campos obrigatórios: movimentacao e categoria.');
      }

      const movement = normalizeMovimentacao(movimentacao, 'entrada');
      const modality = payload.modalidade === undefined || payload.modalidade === null ||
        String(payload.modalidade).trim() === ''
        ? inferModalityFromItems(rawItems)
        : normalizeModality(payload.modalidade);

      const valorTotalCents = payload.valor_total === undefined || payload.valor_total === null ||
        String(payload.valor_total).trim() === ''
        ? (rawItems || []).reduce(
          (sum, item, index) => sum + parseMoneyToCents(item && item.valor, `valor do item ${index + 1}`),
          0
        )
        : parseMoneyToCents(payload.valor_total, 'valor_total');
      const items = normalizeReconfigurationItems(rawItems, valorTotalCents, modality);
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const totalItems = items.length;
      const groupId = totalItems > 1 ? generateParcelGroupId(cache) : null;
      const person = String(payload.fornecedor ?? payload.cliente ?? '').trim();
      const dataEmissao = normalizeDate(payload.data_emissao, 'data_emissao', { required: false });
      const observacoes = String(payload.observacoes ?? payload.observacao ?? '').trim();

      const dataList = items.map((item, index) => ({
        movimentacao: movement.label,
        categoria,
        modo_emissao: String(payload.modo_emissao || '').trim(),
        observacoes,
        fornecedor: person,
        cliente: person,
        conta_bancaria: String(payload.conta_bancaria || '').trim(),
        forma_pagamento: String(payload.forma_pagamento || '').trim(),
        status: item.status,
        empresa: String(payload.empresa || '').trim(),
        num_parcelas: totalItems,
        valor: item.valor,
        data_vencimento: item.data_vencimento,
        data_pagamento: item.data_pagamento,
        valor_pago: item.valor_pago,
        parcela_ref: groupId ? `${index + 1}/${totalItems} [${groupId}]` : '',
        data_emissao: dataEmissao
      }));

      const result = await sheets.appendMultipleRows(movement.label, dataList);
      if (!result || result.count !== dataList.length) {
        throw httpError(500, 'O Google Sheets não confirmou todas as parcelas criadas.');
      }
      return res.json({
        success: true,
        message: `${dataList.length} parcelas registradas com sucesso na planilha "${result.sheetName}"!`,
        modalidade: modality,
        valor_total: valorTotalCents / 100,
        grupo_id: groupId,
        linhas_criadas: dataList.length
      });
    } catch (err) {
      const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
      if (statusCode >= 500) {
        console.error('❌ Erro ao criar parcelamento:', err.message);
      }
      return res.status(statusCode).json({ error: err.message });
    }
  });

  // Pagamento / edição rápida de parcela individual de um grupo
  app.put('/api/lancamento/pagar-parcela/:tipo/:id', auth, async (req, res) => {
    try {
      const tipo = normalizeTipo(req.params.tipo);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        throw httpError(400, 'ID da parcela inválido.');
      }
      const { status: reqStatus, valor, valor_pago, data_pagamento, recalcular } = req.body;
      const sheets = getSheetsModule();
      const sheetName = tipo === 'entrada' ? 'Entradas' : 'Saídas';
      const cache = sheets.getCacheData();
      const rows = tipo === 'entrada' ? cache.entradas : cache.saidas;
      const current = rows.find(row => String(row.id) === String(id));
      if (!current) throw httpError(404, 'Parcela não encontrada.');

      const wasPaid = normalizeComparable(current.status) === 'pago';
      const targetStatus = reqStatus
        ? (normalizeComparable(reqStatus) === 'pago' ? 'Pago' : 'Pendente')
        : (valor_pago !== undefined ? 'Pago' : current.status || 'Pendente');

      const valorOriginal = Number(current.valor) || 0;

      let novoValor = valorOriginal;
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        novoValor = parseMoneyToCents(valor, 'valor') / 100;
      }

      let paidValue = 0;
      let paymentDate = '';

      if (targetStatus === 'Pago') {
        paidValue = parseMoneyToCents(valor_pago !== undefined ? valor_pago : novoValor, 'valor_pago') / 100;
        paymentDate = normalizeDate(data_pagamento, 'data_pagamento');

        const updateData = {
          status: 'Pago',
          valor_pago: paidValue,
          data_pagamento: paymentDate
        };
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          updateData.valor = novoValor;
        }

        await sheets.updateRow(sheetName, id, updateData);
      } else {
        // Marcando como Pendente (Não paga / desfazendo pagamento)
        const updateData = {
          status: 'Pendente',
          valor: novoValor,
          valor_pago: 0,
          data_pagamento: ''
        };
        await sheets.updateRow(sheetName, id, updateData);
      }

      // Ao recalcular, redistribui a diferença nas demais parcelas pendentes do mesmo grupo
      if (recalcular) {
        if (current.parcela_ref && current.parcela_ref.includes('[PRC-')) {
          const groupMatch = current.parcela_ref.match(/\[(PRC-[^\]]+)\]/);
          if (groupMatch) {
            const grupoId = groupMatch[1];
            let diff = 0;
            if (targetStatus === 'Pago') {
              if (novoValor !== valorOriginal) {
                diff = novoValor - valorOriginal;
              } else if (!wasPaid) {
                diff = paidValue - valorOriginal;
              }
            } else {
              // Quando volta para pendente ou edita valor nominal
              diff = novoValor - valorOriginal;
            }

            if (diff !== 0) {
              const pendentes = rows.filter(r => 
                r.parcela_ref && 
                extractParcelGroupId(r.parcela_ref) === grupoId &&
                normalizeComparable(r.status) === 'pendente' &&
                String(r.id) !== String(id)
              );

              if (pendentes.length > 0) {
                const ajustePorParcela = diff / pendentes.length;
                for (const p of pendentes) {
                  const novoPValor = Math.max(0.01, Math.round(((Number(p.valor) || 0) - ajustePorParcela) * 100) / 100);
                  await sheets.updateRow(sheetName, p.id, { valor: novoPValor });
                }
              }
            }
          }
        }
      }

      return res.json({
        success: true,
        message: targetStatus === 'Pago'
          ? (wasPaid ? 'Pagamento da parcela ajustado com sucesso!' : 'Parcela paga com sucesso!')
          : 'Parcela atualizada para não paga com sucesso!',
        status: targetStatus,
        valor: novoValor,
        valor_pago: paidValue,
        data_pagamento: paymentDate,
        pagamento_ajustado: wasPaid
      });
    } catch (err) {
      const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
      if (statusCode >= 500) console.error('❌ Erro ao processar parcela:', err.message);
      res.status(statusCode).json({ error: err.message });
    }
  });

  // Busca grupo de parcelas
  app.get('/api/lancamento/grupo/:tipo/:grupoId', auth, async (req, res) => {
    try {
      const { tipo, grupoId } = req.params;
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const rows = tipo === 'entrada' ? cache.entradas : cache.saidas;
      
      const grupo = rows.filter(r => extractParcelGroupId(r.parcela_ref) === grupoId);
      // Ordenar por referência (1/3, 2/3...)
      grupo.sort((a, b) => {
        const numA = parseInt(a.parcela_ref) || 0;
        const numB = parseInt(b.parcela_ref) || 0;
        return numA - numB;
      });

      return res.json({ success: true, parcelas: grupo });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerLancamentoRoutes };
