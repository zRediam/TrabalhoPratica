const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const initSqlFile = path.join(__dirname, 'database', 'init.sql');
const { runSchemaPatches } = require('./database/schemaPatches');

const ensureDatabaseSchema = async () => {
  try {
    const initSql = fs.readFileSync(initSqlFile, 'utf8');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '1510',
      multipleStatements: true
    });

    await connection.query(initSql);
    await connection.end();
    console.log('Database schema checked/created successfully.');
  } catch (error) {
    console.error('Erro ao garantir esquema do banco:', error);
  }
};

// Routes
const notaFiscalRoutes = require('./routes/notaFiscalRoutes');

app.use('/api/notas', notaFiscalRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

app.use((error, req, res, next) => {
  if (error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo muito grande. Limite de 10MB.' });
  }

  if (error) {
    return res.status(400).json({ error: error.message || 'Erro ao receber arquivo.' });
  }

  next();
});

ensureDatabaseSchema()
  .then(() => runSchemaPatches())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco:', err);
    process.exit(1);
  });
