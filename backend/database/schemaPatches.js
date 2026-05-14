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
    'ALTER TABLE contas_pagar ADD COLUMN movimento_contas_id INT NULL'
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

  await connection.end();
};

module.exports = { runSchemaPatches };
