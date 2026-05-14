const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractDataFromPdf, confirmDatabaseSave, listEntities, toggleStatus } = require('../controllers/notaFiscalController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Arquivo invalido. Envie apenas PDF.'));
    }
    cb(null, true);
  }
});

router.post('/extract', upload.single('file'), extractDataFromPdf);
router.post('/confirm', confirmDatabaseSave);
router.get('/list', listEntities);
router.patch('/toggle-status', toggleStatus);

module.exports = router;
