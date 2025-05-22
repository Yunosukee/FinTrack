const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Rejestracja nowego użytkownika
router.post('/register', authController.register);

// Logowanie użytkownika
router.post('/login', authController.login);

// Pobieranie profilu użytkownika (wymaga uwierzytelnienia)
router.get('/profile', auth, authController.getProfile);

// Weryfikacja tokenu JWT
router.get('/verify', auth, authController.verifyToken);

module.exports = router;