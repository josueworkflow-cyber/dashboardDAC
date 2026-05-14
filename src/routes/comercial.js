/**
 * comercial.js — Rotas da API para o Funil Unificado (Comercial + Estoque)
 * Tudo agora lê/escreve na aba "Estoque" do Google Sheets
 */

const { auth } = require('../auth');
const { getSheetsModule } = require('../db');

function registerComercialRoutes(app) {

  // Lista todos os pedidos do funil (itens com ref_orcamento no cache estoque)
  app.get('/api/comercial', auth, async (req, res) => {
    try {
      const sheets = getSheetsModule();
      const data = sheets.getCacheData();
      return res.json({ success: true, comercial: data.comercial || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cria novo pedido no funil (escreve na aba Estoque)
  app.post('/api/comercial', auth, async (req, res) => {
    try {
      const { cliente, valor, data, pagamento, forma_pagamento, parcela, modo_emissao, vendedor, observacao } = req.body;

      if (!cliente || !valor) {
        return res.status(400).json({ error: 'Campos obrigatórios: cliente, valor.' });
      }

      const sheets = getSheetsModule();
      const numero = sheets.getNextOrcamentoNumber();

      const rowData = {
        isEstoque: true,
        fornecedor: cliente || '',
        valor: parseFloat(valor) || 0,
        data: data || '',
        pagamento: pagamento || '',
        movimentacao: 'Saída',
        nota_fiscal: '',
        parcelas: parcela || '',
        empresa: '',
        forma_pagamento: forma_pagamento || '',
        modo_emissao: modo_emissao || '',
        observacao: observacao || '',
        ref_orcamento: numero,
        status: req.body.status || 'Cotação / Orçamento',
        data_vencimento: req.body.data_vencimento || '',
        vendedor: vendedor || ''
      };

      await sheets.appendRow('Saída', rowData);
      console.log(`✅ Pedido ${numero} criado no funil: ${cliente} - R$ ${valor}`);

      return res.json({
        success: true,
        message: `Pedido ${numero} criado com sucesso!`,
        numero_orcamento: numero
      });
    } catch (err) {
      console.error('❌ Erro ao criar pedido:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Atualiza campos de um pedido (na aba Estoque)
  app.put('/api/comercial/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        'fornecedor', 'valor', 'data', 'pagamento', 'movimentacao',
        'nota_fiscal', 'parcelas', 'empresa', 'forma_pagamento', 'modo_emissao',
        'observacao', 'ref_orcamento', 'status', 'data_vencimento', 'vendedor'
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
      await sheets.updateRow('Estoque', parseInt(id, 10), updates);

      return res.json({ success: true, message: 'Pedido atualizado com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao atualizar pedido:', err.message);
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

      const validStatuses = [
        'Cotação / Orçamento', 'Pedido', 'Aprovado',
        'Estoque / Separação', 'Expedição / Separado',
        'Rota de Entrega', 'Finalizado'
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Valores aceitos: ${validStatuses.join(', ')}` });
      }

      const sheets = getSheetsModule();
      await sheets.updateRow('Estoque', parseInt(id, 10), { status });
      return res.json({ success: true, message: `Status atualizado para "${status}".` });
    } catch (err) {
      console.error('❌ Erro ao atualizar status:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Exclui um pedido (da aba Estoque)
  app.delete('/api/comercial/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const sheets = getSheetsModule();
      await sheets.deleteRow('Estoque', parseInt(id, 10));
      return res.json({ success: true, message: 'Pedido excluído com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao excluir pedido:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerComercialRoutes };
