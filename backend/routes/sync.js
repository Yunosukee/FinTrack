const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');
const auth = require('../middleware/auth');

// Wszystkie endpointy wymagają uwierzytelnienia
router.use(auth);

// Pobierz dane (synchronizacja w dół)
router.get('/pull', syncController.pullData);

// Wyślij dane (synchronizacja w górę)
router.post('/push', syncController.pushData);

// Aktualizuj ustawienia użytkownika
router.put('/settings', syncController.updateSettings);

module.exports = router;