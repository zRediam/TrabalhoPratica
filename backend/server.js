const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'seu-segredo-super-secreto-aqui',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
}));

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
    console.log('Esquema do banco verificado/criado com sucesso.');
  } catch (error) {
    console.error('Erro ao garantir esquema do banco:', error);
  }
};

// Rotas
const notaFiscalRoutes = require('./routes/notaFiscalRoutes');
const authRoutes = require('./routes/authRoutes');
const crudRoutes = require('./routes/crudRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/notas', notaFiscalRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', userRoutes);
app.use('/api', crudRoutes);

app.get('/api/health', (req, res) => {
  const openrouterConfigured = Boolean(String(process.env.OPENROUTER_API_KEY || '').trim());
  const openrouterKeyPreview = openrouterConfigured 
    ? process.env.OPENROUTER_API_KEY.substring(0, 10) + '***' 
    : 'NÃO CONFIGURADA';
  
  res.json({ 
    status: 'ok', 
    message: 'Backend em execução!',
    config: {
      provider: 'OpenRouter (Gemini desativado)',
      openrouterConfigured,
      openrouterKeyPreview,
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free',
      database: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root'
      }
    }
  });
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
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao preparar o banco:', err);
    process.exit(1);
  });
