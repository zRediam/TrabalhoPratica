const crypto = require('crypto');
const db = require('../config/db');

// Gerar hash de senha com salt
const hashPassword = (senha) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

// Verificar senha
const verifyPassword = (senha, hashArmazenado) => {
  const [salt, hash] = hashArmazenado.split(':');
  const hashCalculado = crypto.pbkdf2Sync(senha, salt, 1000, 64, 'sha512').toString('hex');
  return hash === hashCalculado;
};

// Registrar novo usuário
const register = async (req, res) => {
  try {
    const { email, senha, nome } = req.body;

    // Validações básicas
    if (!email || !senha || !nome) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    // Verificar se usuário já existe
    const [existente] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase()]);
    if (existente.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    // Criar hash da senha
    const senhaHash = hashPassword(senha);

    // Inserir usuário
    const [result] = await db.query(
      'INSERT INTO usuarios (email, senha_hash, nome, status) VALUES (?, ?, ?, ?)',
      [email.toLowerCase(), senhaHash, nome.trim(), 'ATIVO']
    );

    console.log('[AUTH] Novo usuário registrado:', email);

    return res.status(201).json({
      id: result.insertId,
      email: email.toLowerCase(),
      nome: nome.trim(),
      mensagem: 'Cadastro realizado com sucesso!'
    });
  } catch (error) {
    console.error('[AUTH] Erro ao registrar:', error.message);
    return res.status(500).json({ error: 'Falha ao registrar usuário.' });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    // Buscar usuário
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ? AND status = ?', [email.toLowerCase(), 'ATIVO']);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    const usuario = rows[0];

    // Verificar senha
    if (!verifyPassword(senha, usuario.senha_hash)) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    req.session.usuario = {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome
    };

    console.log('[AUTH] Login bem-sucedido:', email);

    return res.json({
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      mensagem: 'Login realizado com sucesso!'
    });
  } catch (error) {
    console.error('[AUTH] Erro ao fazer login:', error.message);
    return res.status(500).json({ error: 'Falha ao fazer login.' });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    const email = req.session.usuario?.email;
    req.session.destroy();
    console.log('[AUTH] Logout:', email);
    return res.json({ mensagem: 'Logout realizado com sucesso!' });
  } catch (error) {
    console.error('[AUTH] Erro ao fazer logout:', error.message);
    return res.status(500).json({ error: 'Falha ao fazer logout.' });
  }
};

// Verificar se usuário está autenticado
const getCurrentUser = async (req, res) => {
  try {
    if (!req.session.usuario) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    return res.json({ usuario: req.session.usuario });
  } catch (error) {
    console.error('[AUTH] Erro ao obter usuário atual:', error.message);
    return res.status(500).json({ error: 'Falha ao obter usuário.' });
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  hashPassword,
  verifyPassword
};
