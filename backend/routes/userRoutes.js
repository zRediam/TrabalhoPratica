const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

// Listar usuários (?all=true inclui inativos)
router.get('/users', userController.list);

// Criar usuário (admin)
router.post('/users', userController.create);

// Desativar (exclusão lógica)
router.delete('/users/:id', userController.deactivate);

// Reativar
router.patch('/users/:id/reactivate', userController.reactivate);

module.exports = router;
