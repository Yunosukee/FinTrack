const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const authMiddleware = require('../middleware/auth');

// Dodaj trasę dla newsów finansowych
router.get('/news', authMiddleware, newsController.getFinancialNews);

module.exports = router;