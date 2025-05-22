const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categoriesController');
const auth = require('../middleware/auth');

// Middleware uwierzytelniania dla wszystkich tras
router.use(auth);

// Pobierz wszystkie kategorie
router.get('/', categoriesController.getAllCategories);

module.exports = router;