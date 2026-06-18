const db = require('../config/db');
const crypto = require('crypto');

const hashPassword = (senha) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const list = async (req, res) => {
  try {
    const { all } = req.query;
    let query = 'SELECT id, email, nome, status FROM usuarios';
    const params = [];
    if (all !== 'true') {
      query += " WHERE status = 'ATIVO'";
    }
    const [rows] = await db.query(query, params);
    const result = rows.map((r) => ({ ...r, status: r.status === 'ATIVO' ? 'ATIVO' : 'INATIVO' }));
    res.json(result);
  } catch (error) {
    console.error('[USER-LIST] Erro:', error.message);
    res.status(500).json({ error: 'Erro ao listar usuários', details: error.message });
  }
};

const create = async (req, res) => {
  try {
    const { email, nome, senha } = req.body;
    if (!email || !nome || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const emailLower = email.toLowerCase();
    const [exist] = await db.query('SELECT id FROM usuarios WHERE email = ?', [emailLower]);
    if (exist.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    const senhaHash = hashPassword(senha);
    const [result] = await db.query(
      'INSERT INTO usuarios (email, nome, senha_hash, status) VALUES (?, ?, ?, ?)',
      [emailLower, nome.trim(), senhaHash, 'ATIVO']
    );
    res.status(201).json({ id: result.insertId, email: emailLower, nome: nome.trim(), status: 'ATIVO' });
  } catch (error) {
    console.error('[USER-CREATE] Erro:', error.message, error);
    res.status(500).json({ error: 'Erro ao criar usuário', details: error.message });
  }
};

const deactivate = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE usuarios SET status = 'INATIVO' WHERE id = ?", [id]);
    res.json({ id, status: 'INATIVO', message: 'Usuário desativado' });
  } catch (error) {
    console.error('[USER-DEACTIVATE] Erro:', error.message);
    res.status(500).json({ error: 'Erro ao desativar usuário' });
  }
};

const reactivate = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE usuarios SET status = 'ATIVO' WHERE id = ?", [id]);
    res.json({ id, status: 'ATIVO', message: 'Usuário reativado' });
  } catch (error) {
    console.error('[USER-REACTIVATE] Erro:', error.message);
    res.status(500).json({ error: 'Erro ao reativar usuário' });
  }
};

module.exports = { list, create, deactivate, reactivate };
