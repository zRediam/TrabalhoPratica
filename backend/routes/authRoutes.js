const express = require('express');
const { register, login, logout, getCurrentUser } = require('../controllers/authController');

const router = express.Router();

// POST /auth/register - Registrar novo usuário
router.post('/register', register);

// POST /auth/login - Fazer login
router.post('/login', login);

// POST /auth/logout - Fazer logout
router.post('/logout', logout);

// GET /auth/me - Obter usuário atual
router.get('/me', getCurrentUser);

module.exports = router;
