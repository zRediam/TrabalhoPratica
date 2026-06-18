const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    connectTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Testa a conexão ao iniciar
(async () => {
    try {
        const connection = await pool.getConnection();

        console.log('=================================');
        console.log('Banco conectado com sucesso');
        console.log(`Host: ${process.env.DB_HOST}`);
        console.log(`Porta: ${process.env.DB_PORT}`);
        console.log(`Banco: ${process.env.DB_NAME}`);
        console.log('=================================');

        connection.release();
    } catch (error) {
        console.error('=================================');
        console.error('Erro ao conectar ao banco:');
        console.error(error);
        console.error('=================================');
    }
})();

module.exports = pool;