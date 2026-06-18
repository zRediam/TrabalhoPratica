const db = require('../config/db');

// Mapeamento das tabelas
const tableMap = {
  fornecedor: 'mantem_fornecedor',
  cliente: 'mantem_cliente',
  faturado: 'mantem_faturado',
  despesa: 'tipo_despesa',
  receita: 'tipo_receita',
  conta: 'movimentocontas'
};

// Mapeamento de colunas para busca múltipla
const searchFields = {
  fornecedor: ['razao_social', 'nome_fantasia', 'cnpj'],
  cliente: ['nome', 'documento', 'endereco'],
  faturado: ['nome', 'documento', 'endereco'],
  despesa: ['descricao'],
  receita: ['descricao'],
  conta: ['numero_nota_fiscal', 'descricao_produtos']
};

const getListQuery = (entity) => {
  const table = tableMap[entity];
  if (entity === 'conta') {
    return `
      SELECT m.*, 
             f.razao_social AS fornecedor_nome, 
             fat.nome AS faturado_nome, 
             d.descricao AS despesa_nome 
      FROM movimentocontas m 
      LEFT JOIN mantem_fornecedor f ON m.fornecedor_id = f.id 
      LEFT JOIN mantem_faturado fat ON m.faturado_id = fat.id 
      LEFT JOIN tipo_despesa d ON m.tipo_despesa_id = d.id
    `;
  }
  return `SELECT * FROM ${table}`;
};

// Listar ou Buscar
const list = async (req, res) => {
  try {
    const { entity } = req.params;
    const { q, all } = req.query;
    const table = tableMap[entity];

    if (!table) {
      return res.status(400).json({ error: 'Entidade inválida' });
    }

    let query = getListQuery(entity);
    let params = [];
    let conditions = [];

    // Se "all=true" (Botão Inativos), carrega apenas registros inativos
    if (all === 'true') {
      if (entity === 'conta') {
        conditions.push("m.status = 'INATIVO'");
      } else {
        conditions.push("status = 'INATIVO'");
      }
    }

    // Se houver busca por múltiplos campos (q)
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      const fields = searchFields[entity];
      let orConds = [];

      if (entity === 'conta') {
        fields.forEach(field => orConds.push(`m.${field} LIKE ?`));
        // Permitir buscar por nome do fornecedor ou faturado nas contas
        orConds.push('f.razao_social LIKE ?');
        orConds.push('fat.nome LIKE ?');
        params.push(term, term, term, term);
      } else {
        fields.forEach(field => orConds.push(`${field} LIKE ?`));
        fields.forEach(() => params.push(term));
      }

      conditions.push(`(${orConds.join(' OR ')})`);
    }

    // Comportamento padrão: sem busca e sem "all", carrega apenas registros ativos
    if (!q && (!all || all !== 'true')) {
      if (entity === 'conta') {
        conditions.push("m.status = 'ATIVO'");
      } else {
        conditions.push("status = 'ATIVO'");
      }
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Adiciona ordenação e limite
    if (entity === 'conta') {
      query += ' ORDER BY m.id DESC LIMIT 100';
    } else {
      query += ' ORDER BY id DESC LIMIT 100';
    }

    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (error) {
    console.error(`[CRUD-LIST] Erro ao listar ${req.params.entity}:`, error.message);
    return res.status(500).json({ error: 'Erro ao listar registros' });
  }
};

// Criar
const create = async (req, res) => {
  try {
    const { entity } = req.params;
    const table = tableMap[entity];
    const data = req.body;

    if (!table) {
      return res.status(400).json({ error: 'Entidade inválida' });
    }

    // Requisito 3.g: No CREATE campo STATUS oculto == ATIVO
    data.status = 'ATIVO';

    if (entity === 'conta') {
      // Inserir na tabela movimentocontas
      const {
        fornecedor_id,
        faturado_id,
        numero_nota_fiscal,
        data_emissao,
        data_vencimento,
        valor_total,
        tipo_despesa_id,
        tipo,
        status_pagamento,
        descricao_produtos
      } = data;

      const [movRes] = await db.query(
        `INSERT INTO movimentocontas 
          (fornecedor_id, faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, tipo_despesa_id, tipo, status_pagamento, status, descricao_produtos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tipo === 'APAGAR' ? (fornecedor_id || null) : null,
          faturado_id || null,
          numero_nota_fiscal || null,
          data_emissao || null,
          data_vencimento || null,
          valor_total || 0,
          tipo === 'APAGAR' ? (tipo_despesa_id || null) : null,
          tipo || 'APAGAR',
          status_pagamento || 'PENDENTE',
          'ATIVO',
          descricao_produtos || ''
        ]
      );

      const movimentoId = movRes.insertId;

      // Inserir na tabela pivot de categorias
      if (tipo === 'APAGAR' && tipo_despesa_id) {
        await db.query(
          'INSERT INTO movimentocontas_tipos_despesas (movimento_contas_id, tipo_despesa_id) VALUES (?, ?)',
          [movimentoId, tipo_despesa_id]
        );

        // contas_pagar
        await db.query(
          `INSERT INTO contas_pagar (fornecedor_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_pagamento, tipo_despesa_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fornecedor_id || null, numero_nota_fiscal || null, data_emissao || null, data_vencimento || null, valor_total || 0, status_pagamento || 'PENDENTE', tipo_despesa_id || null, movimentoId]
        );
      } else if (tipo === 'ARECEBER') {
        // Obter uma classificação de receita padrão se não especificada
        const [recs] = await db.query('SELECT id FROM tipo_receita LIMIT 1');
        const tipoReceitaId = recs[0]?.id || null;

        if (tipoReceitaId) {
          await db.query(
            'INSERT INTO movimentocontas_tipos_receitas (movimento_contas_id, tipo_receita_id) VALUES (?, ?)',
            [movimentoId, tipoReceitaId]
          );
        }

        // contas_receber
        await db.query(
          `INSERT INTO contas_receber (faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_recebimento, tipo_receita_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [faturado_id || null, numero_nota_fiscal || null, data_emissao || null, data_vencimento || null, valor_total || 0, status_pagamento === 'PENDENTE' ? 'PENDENTE' : 'RECEBIDO', tipoReceitaId, movimentoId]
        );
      }

      // Criar 1 parcela padrão no parcelacontas
      await db.query(
        `INSERT INTO parcelacontas (movimento_contas_id, parcela_numero, valor, data_vencimento, identificacao, status_pagamento)
         VALUES (?, 1, ?, ?, 'UNICA', ?)`,
        [movimentoId, valor_total || 0, data_vencimento || null, status_pagamento || 'PENDENTE']
      );

      return res.status(201).json({ id: movimentoId, ...data });
    }

    // Outros CRUDs simples
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

    const [result] = await db.query(query, values);
    return res.status(201).json({ id: result.insertId, ...data });
  } catch (error) {
    console.error(`[CRUD-CREATE] Erro ao criar ${req.params.entity}:`, error.message);
    return res.status(500).json({ error: 'Erro ao criar registro' });
  }
};

// Atualizar
const update = async (req, res) => {
  try {
    const { entity, id } = req.params;
    const table = tableMap[entity];
    const data = req.body;

    if (!table) {
      return res.status(400).json({ error: 'Entidade inválida' });
    }

    // Requisito 3.h: No UPDATE campo STATUS oculto -> Removemos o status para não alterar
    delete data.status;

    if (entity === 'conta') {
      const {
        fornecedor_id,
        faturado_id,
        numero_nota_fiscal,
        data_emissao,
        data_vencimento,
        valor_total,
        tipo_despesa_id,
        tipo,
        status_pagamento,
        descricao_produtos
      } = data;

      // Atualizar movimentocontas
      await db.query(
        `UPDATE movimentocontas SET 
          fornecedor_id = ?, 
          faturado_id = ?, 
          numero_nota_fiscal = ?, 
          data_emissao = ?, 
          data_vencimento = ?, 
          valor_total = ?, 
          tipo_despesa_id = ?, 
          tipo = ?, 
          status_pagamento = ?, 
          descricao_produtos = ?
         WHERE id = ?`,
        [
          tipo === 'APAGAR' ? (fornecedor_id || null) : null,
          faturado_id || null,
          numero_nota_fiscal || null,
          data_emissao || null,
          data_vencimento || null,
          valor_total || 0,
          tipo === 'APAGAR' ? (tipo_despesa_id || null) : null,
          tipo || 'APAGAR',
          status_pagamento || 'PENDENTE',
          descricao_produtos || '',
          id
        ]
      );

      // Sincronizar tabelas vinculadas
      if (tipo === 'APAGAR') {
        // Limpar pivôs antigos
        await db.query('DELETE FROM movimentocontas_tipos_despesas WHERE movimento_contas_id = ?', [id]);
        if (tipo_despesa_id) {
          await db.query(
            'INSERT INTO movimentocontas_tipos_despesas (movimento_contas_id, tipo_despesa_id) VALUES (?, ?)',
            [id, tipo_despesa_id]
          );
        }

        // contas_pagar
        await db.query('DELETE FROM contas_pagar WHERE movimento_contas_id = ?', [id]);
        await db.query(
          `INSERT INTO contas_pagar (fornecedor_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_pagamento, tipo_despesa_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fornecedor_id || null, numero_nota_fiscal || null, data_emissao || null, data_vencimento || null, valor_total || 0, status_pagamento || 'PENDENTE', tipo_despesa_id || null, id]
        );
      } else if (tipo === 'ARECEBER') {
        // contas_receber
        await db.query('DELETE FROM contas_receber WHERE movimento_contas_id = ?', [id]);
        
        // Obter classificação padrão de receita
        const [recs] = await db.query('SELECT id FROM tipo_receita LIMIT 1');
        const tipoReceitaId = recs[0]?.id || null;

        await db.query(
          `INSERT INTO contas_receber (faturado_id, numero_nota_fiscal, data_emissao, data_vencimento, valor_total, status_recebimento, tipo_receita_id, movimento_contas_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [faturado_id || null, numero_nota_fiscal || null, data_emissao || null, data_vencimento || null, valor_total || 0, status_pagamento === 'PENDENTE' ? 'PENDENTE' : 'RECEBIDO', tipoReceitaId, id]
        );
      }

      // Atualizar valor e vencimento da parcela
      await db.query(
        `UPDATE parcelacontas SET valor = ?, data_vencimento = ?, status_pagamento = ? WHERE movimento_contas_id = ? AND parcela_numero = 1`,
        [valor_total || 0, data_vencimento || null, status_pagamento || 'PENDENTE', id]
      );

      return res.json({ id, ...data });
    }

    // Outros CRUDs simples
    const sets = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(data), id];
    const query = `UPDATE ${table} SET ${sets} WHERE id = ?`;

    await db.query(query, values);
    return res.json({ id, ...data });
  } catch (error) {
    console.error(`[CRUD-UPDATE] Erro ao editar ${req.params.entity}:`, error.message);
    return res.status(500).json({ error: 'Erro ao editar registro' });
  }
};

// Deleção Lógica
const remove = async (req, res) => {
  try {
    const { entity, id } = req.params;
    const table = tableMap[entity];

    if (!table) {
      return res.status(400).json({ error: 'Entidade inválida' });
    }

    // Requisito 3.i: No DELETE altera campo STATUS == INATIVO
    await db.query(`UPDATE ${table} SET status = 'INATIVO' WHERE id = ?`, [id]);
    return res.json({ id, status: 'INATIVO', message: 'Registro desativado com sucesso (exclusão lógica).' });
  } catch (error) {
    console.error(`[CRUD-DELETE] Erro ao desativar ${req.params.entity}:`, error.message);
    return res.status(500).json({ error: 'Erro ao excluir (desativar) registro' });
  }
};

const reactivate = async (req, res) => {
  try {
    const { entity, id } = req.params;
    const table = tableMap[entity];
    if (!table) {
      return res.status(400).json({ error: 'Entidade inválida' });
    }
    // Reativar registro lógico
    await db.query(`UPDATE ${table} SET status = 'ATIVO' WHERE id = ?`, [id]);
    return res.json({ id, status: 'ATIVO', message: 'Registro reativado com sucesso.' });
  } catch (error) {
    console.error(`[CRUD-REACTIVATE] Erro ao reativar ${req.params.entity}:`, error.message);
    return res.status(500).json({ error: 'Erro ao reativar registro' });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  reactivate,
};
