const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');
const auth = require('../middleware/auth');

// Wszystkie endpointy wymagają uwierzytelnienia
router.use(auth);

// Pobierz wszystkie transakcje
router.get('/', transactionsController.getAllTransactions);

// Pobierz pojedynczą transakcję
router.get('/:id', transactionsController.getTransactionById);

// Utwórz nową transakcję
router.post('/', transactionsController.createTransaction);

// Aktualizuj istniejącą transakcję
router.put('/:id', transactionsController.updateTransaction);

// Usuń transakcję
router.delete('/:id', transactionsController.deleteTransaction);

module.exports = router;