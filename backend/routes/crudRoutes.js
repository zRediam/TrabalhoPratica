const express = require('express');
const router = express.Router();
const crudController = require('../controllers/crudController');
const seedDatabase = require('../database/seed');

// Rotas CRUD genéricas
router.get('/crud/:entity', crudController.list);
router.post('/crud/:entity', crudController.create);
router.put('/crud/:entity/:id', crudController.update);
router.delete('/crud/:entity/:id', crudController.remove);
router.patch('/crud/:entity/:id/reactivate', crudController.reactivate);

// Rota de Seed
router.post('/seed', async (req, res) => {
  try {
    await seedDatabase();
    return res.json({ message: 'Banco de dados populado com 200 registros de teste com sucesso!' });
  } catch (error) {
    console.error('[ROUTE-SEED] Erro:', error.message);
    return res.status(500).json({ error: 'Erro ao disparar seeding no banco de dados.', details: error.message });
  }
});

module.exports = router;
