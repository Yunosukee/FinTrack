const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const auth = require('../middleware/auth');

// Middleware uwierzytelniania dla wszystkich tras
router.use(auth);

// Aktualizacja profilu użytkownika
router.put('/profile', usersController.updateProfile);

// Aktualizacja ustawień użytkownika
router.put('/settings', usersController.updateSettings);

// Pobieranie salda użytkownika
router.get('/balance', usersController.getBalance);

module.exports = router;