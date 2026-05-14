const { auth } = require('../auth');
const { getSheetsModule } = require('../db');

function registerLancamentoRoutes(app) {
  // Envia um novo lançamento direto no Google Sheets
  app.post('/api/lancamento', auth, async (req, res) => {
    try {
      const {
        movimentacao, categoria, observacoes, fornecedor, valor,
        conta_bancaria, data_vencimento, data_pagamento, forma_pagamento, status,
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
          observacoes: observacoes || '',
          valor: parseFloat(valor) || 0,
          fornecedor: fornecedor || '',
          cliente: fornecedor || '',  // Na planilha, Entradas usa "Cliente" no lugar de "Fornecedor"
          conta_bancaria: conta_bancaria || '',
          data_vencimento: data_vencimento || '',
          data_pagamento: data_pagamento || '',
          forma_pagamento: forma_pagamento || '',
          status: status || 'Pendente',
          num_parcelas: parseInt(num_parcelas, 10) || 0,
          valor_pago: parseFloat(valor_pago) || 0,
          modo_emissao: modo_emissao || ''
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

      if (target && target.parcela_ref && target.parcela_ref.includes('[PRC-')) {
        const groupMatch = target.parcela_ref.match(/\[(PRC-[^\]]+)\]/);
        if (groupMatch) {
          const grupoId = groupMatch[1];
          const idsToDelete = rows
            .filter(r => r.parcela_ref && r.parcela_ref.includes(grupoId))
            .map(r => r.id);

          if (idsToDelete.length > 1) {
            await sheets.deleteMultipleRows(sheetName, idsToDelete);
            return res.json({ 
              success: true, 
              message: `Todas as ${idsToDelete.length} parcelas do grupo foram excluídas!` 
            });
          }
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
        'conta_bancaria', 'data_vencimento', 'data_pagamento',
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
      const {
        movimentacao, categoria, observacoes, fornecedor,
        conta_bancaria, forma_pagamento,
        modo_emissao,
        parcelas // Array: [{valor, data_vencimento, status, parcela_ref}]
      } = req.body;

      if (!movimentacao || !categoria || !parcelas || parcelas.length === 0) {
        return res.status(400).json({ error: 'Dados incompletos para parcelamento.' });
      }

      const sheets = getSheetsModule();
      const dataList = parcelas.map(p => ({
        movimentacao,
        categoria,
        observacoes,
        fornecedor,
        cliente: fornecedor,
        conta_bancaria,
        forma_pagamento,
        status: p.status || 'Pendente',
        modo_emissao,
        num_parcelas: parcelas.length,
        valor: parseFloat(p.valor) || 0,
        data_vencimento: p.data_vencimento,
        data_pagamento: p.data_pagamento || '',
        valor_pago: parseFloat(p.valor_pago) || 0,
        parcela_ref: p.parcela_ref
      }));

      const result = await sheets.appendMultipleRows(movimentacao, dataList);
      return res.json({
        success: true,
        message: `${parcelas.length} parcelas registradas com sucesso na planilha "${result.sheetName}"!`
      });
    } catch (err) {
      console.error('❌ Erro ao criar parcelamento:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Pagamento rápido de parcela
  app.put('/api/lancamento/pagar-parcela/:tipo/:id', auth, async (req, res) => {
    try {
      const { tipo, id } = req.params;
      const { valor_pago, data_pagamento, recalcular } = req.body;
      const sheets = getSheetsModule();
      const sheetName = tipo === 'entrada' ? 'Entradas' : 'Saídas';

      // 1. Atualiza a parcela atual
      await sheets.updateRow(sheetName, parseInt(id, 10), {
        status: 'Pago',
        valor_pago: parseFloat(valor_pago),
        data_pagamento
      });

      // 2. Lógica de recálculo (se solicitado e houver diferença)
      if (recalcular) {
        const cache = sheets.getCacheData();
        const rows = tipo === 'entrada' ? cache.entradas : cache.saidas;
        const current = rows.find(r => String(r.id) === String(id));

        if (current && current.parcela_ref && current.parcela_ref.includes('[PRC-')) {
          const groupMatch = current.parcela_ref.match(/\[(PRC-[^\]]+)\]/);
          if (groupMatch) {
            const grupoId = groupMatch[1];
            const valorOriginal = parseFloat(current.valor) || 0;
            const pagoEfetivo = parseFloat(valor_pago) || 0;
            const diff = pagoEfetivo - valorOriginal;

            if (diff !== 0) {
              const pendentes = rows.filter(r => 
                r.parcela_ref && 
                r.parcela_ref.includes(grupoId) && 
                r.status === 'Pendente' &&
                String(r.id) !== String(id)
              );

              if (pendentes.length > 0) {
                const ajustePorParcela = diff / pendentes.length;
                for (const p of pendentes) {
                  const novoValor = Math.max(0, (parseFloat(p.valor) || 0) - ajustePorParcela);
                  await sheets.updateRow(sheetName, p.id, { valor: novoValor });
                }
              }
            }
          }
        }
      }

      return res.json({ success: true, message: 'Parcela paga com sucesso!' });
    } catch (err) {
      console.error('❌ Erro ao pagar parcela:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Busca grupo de parcelas
  app.get('/api/lancamento/grupo/:tipo/:grupoId', auth, async (req, res) => {
    try {
      const { tipo, grupoId } = req.params;
      const sheets = getSheetsModule();
      const cache = sheets.getCacheData();
      const rows = tipo === 'entrada' ? cache.entradas : cache.saidas;
      
      const grupo = rows.filter(r => r.parcela_ref && r.parcela_ref.includes(grupoId));
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
