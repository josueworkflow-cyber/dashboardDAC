/**
 * comercial.js — Rotas da API para o módulo Comercial (Funil de Vendas)
 * CRUD de orçamentos + envio para aba Estoque
 */

const { auth } = require('../auth');
const { getSheetsModule } = require('../db');

function registerComercialRoutes(app) {

  // Lista todos os orçamentos (do cache)
  app.get('/api/comercial', auth, async (req, res) => {
    try {
      const sheets = getSheetsModule();
      const data = sheets.getCacheData();
      return res.json({ success: true, comercial: data.comercial || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cria novo orçamento (gera nº automático)
  app.post('/api/comercial', auth, async (req, res) => {
    try {
      const { cliente, valor, data, pagamento, forma_pagamento, parcela, modo_emissao, vendedor } = req.body;

      if (!cliente || !valor) {
        return res.status(400).json({ error: 'Campos obrigatórios: cliente, valor.' });
      }

      const sheets = getSheetsModule();
      const numero = sheets.getNextOrcamentoNumber();

      const rowData = {
        _sheet: 'comercial',
        numero_orcamento: numero,
        cliente: cliente || '',
        valor: parseFloat(valor) || 0,
        data: data || '',
        pagamento: pagamento || '',
        forma_pagamento: forma_pagamento || '',
        status: 'Orçamento',
        parcela: parcela || '',
        modo_emissao: modo_emissao || '',
        vendedor: vendedor || ''
      };

      await sheets.appendComercialRow(rowData);
      console.log(`✅ Orçamento ${numero} criado: ${cliente} - R$ ${valor}`);

      return res.json({
        success: true,
        message: `Orçamento ${numero} criado com sucesso!`,
        numero_orcamento: numero
      });
    } catch (err) {
      console.error('❌ Erro ao criar orçamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Atualiza campos de um orçamento
  app.put('/api/comercial/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        'cliente', 'valor', 'data', 'pagamento', 'forma_pagamento',
        'status', 'parcela', 'modo_emissao', 'vendedor'
      ];
      const updates = {};
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) {
          updates[f] = req.body[f];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo válido para atualização.' });
      }

      const sheets = getSheetsModule();
      await sheets.updateRow('Comercial', parseInt(id, 10), updates);
      return res.json({ success: true, message: 'Orçamento atualizado com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao atualizar orçamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Atualiza apenas o status (usado pelo drag-and-drop do Kanban)
  app.put('/api/comercial/:id/status', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório.' });
      }

      const validStatuses = ['Orçamento', 'Negociação', 'Aprovado', 'Enviado ao Estoque', 'Finalizado', 'Cancelado'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Valores aceitos: ${validStatuses.join(', ')}` });
      }

      const sheets = getSheetsModule();
      await sheets.updateRow('Comercial', parseInt(id, 10), { status });
      return res.json({ success: true, message: `Status atualizado para "${status}".` });
    } catch (err) {
      console.error('❌ Erro ao atualizar status:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Envia orçamento para a aba Estoque
  app.post('/api/comercial/:id/enviar-estoque', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const orcamento = (cache.comercial || []).find(o => String(o.id) === String(id));

      if (!orcamento) {
        return res.status(404).json({ error: 'Orçamento não encontrado.' });
      }

      if (orcamento.status === 'Enviado ao Estoque') {
        return res.status(400).json({ error: 'Este orçamento já foi enviado ao estoque.' });
      }

      // Monta dados para a aba Estoque
      const estoqueData = {
        isEstoque: true,
        fornecedor: orcamento.cliente || '',
        valor: parseFloat(orcamento.valor) || 0,
        data: orcamento.data || '',
        pagamento: orcamento.pagamento || '',
        movimentacao: 'Saída',
        nota_fiscal: '',       // Estoque preenche
        parcelas: orcamento.parcela || '',
        empresa: '',           // Estoque preenche
        forma_pagamento: orcamento.forma_pagamento || '',
        modo_emissao: orcamento.modo_emissao || ''
      };

      // 1. Insere na aba Estoque
      await sheets.appendRow('Saída', estoqueData);

      // 2. Atualiza status do orçamento para "Enviado ao Estoque"
      await sheets.updateRow('Comercial', parseInt(id, 10), { status: 'Enviado ao Estoque' });

      console.log(`📦 Orçamento ${orcamento.numero_orcamento} enviado ao estoque: ${orcamento.cliente} - R$ ${orcamento.valor}`);

      return res.json({
        success: true,
        message: `Orçamento ${orcamento.numero_orcamento} enviado ao estoque com sucesso!`
      });
    } catch (err) {
      console.error('❌ Erro ao enviar para estoque:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Exclui um orçamento
  app.delete('/api/comercial/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const sheets = getSheetsModule();
      await sheets.deleteRow('Comercial', parseInt(id, 10));
      return res.json({ success: true, message: 'Orçamento excluído com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao excluir orçamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerComercialRoutes };
