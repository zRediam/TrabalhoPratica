const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const isDupColumn = (err) => err?.code === 'ER_DUP_FIELDNAME' || err?.errno === 1060;
const isDupKey = (err) => err?.code === 'ER_DUP_KEYNAME' || err?.errno === 1061;

/**
 * Ajustes incrementais para bancos já criados antes das novas colunas/tabelas.
 */
const runSchemaPatches = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1510',
    database: process.env.DB_NAME || 'notas_fiscais',
    multipleStatements: true
  });

  const alters = [
    "ALTER TABLE parcelacontas ADD COLUMN identificacao ENUM('UNICA','PARCELADA') NOT NULL DEFAULT 'UNICA'",
    'ALTER TABLE contas_pagar ADD COLUMN movimento_contas_id INT NULL',
    'ALTER TABLE movimentocontas ADD COLUMN descricao_produtos LONGTEXT',
    "ALTER TABLE movimentocontas ADD COLUMN status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO'"
  ];

  for (const sql of alters) {
    try {
      await connection.query(sql);
    } catch (err) {
      if (!isDupColumn(err) && !isDupKey(err)) {
        console.warn('[schemaPatches] ALTER ignorado ou falhou:', err.message);
      }
    }
  }

  const createContasReceber = `
CREATE TABLE IF NOT EXISTS contas_receber (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faturado_id INT,
  numero_nota_fiscal VARCHAR(50),
  data_emissao DATE,
  data_vencimento DATE,
  valor_total DECIMAL(15, 2),
  status_recebimento ENUM('PENDENTE', 'RECEBIDO', 'BANCARIO') DEFAULT 'PENDENTE',
  tipo_receita_id INT,
  movimento_contas_id INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (faturado_id) REFERENCES mantem_faturado(id),
  FOREIGN KEY (tipo_receita_id) REFERENCES tipo_receita(id),
  FOREIGN KEY (movimento_contas_id) REFERENCES movimentocontas(id)
);`;

  try {
    await connection.query(createContasReceber);
  } catch (err) {
    console.warn('[schemaPatches] contas_receber:', err.message);
  }

  // Garante tabela de usuários
  const createUsuarios = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

  try {
    await connection.query(createUsuarios);
  } catch (err) {
    console.warn('[schemaPatches] usuarios:', err.message);
  }

  // Migrar coluna legada "ativo" para "status", se necessário
  try {
    const [ativoCol] = await connection.query("SHOW COLUMNS FROM usuarios LIKE 'ativo'");
    const [statusCol] = await connection.query("SHOW COLUMNS FROM usuarios LIKE 'status'");
    if (ativoCol.length && !statusCol.length) {
      await connection.query(
        "ALTER TABLE usuarios CHANGE COLUMN ativo status ENUM('ATIVO', 'INATIVO') DEFAULT 'ATIVO'"
      );
    }
  } catch (err) {
    console.warn('[schemaPatches] migração ativo→status:', err.message);
  }

  // Garantir usuário administrador padrão (admin@admin.com / admin123)
  try {
    const crypto = require('crypto');
    const [adminRows] = await connection.query("SELECT id FROM usuarios WHERE email = 'admin@admin.com'");
    if (adminRows.length === 0) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
      const senhaHash = `${salt}:${hash}`;
      await connection.query(
        "INSERT INTO usuarios (email, senha_hash, nome, status) VALUES (?, ?, ?, ?)",
        ['admin@admin.com', senhaHash, 'Administrador', 'ATIVO']
      );
      console.log('[schemaPatches] Usuário admin padrão criado (admin@admin.com / admin123)');
    }
  } catch (err) {
    console.warn('[schemaPatches] admin padrão:', err.message);
  }

  await connection.end();
};

module.exports = { runSchemaPatches };
