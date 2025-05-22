const Transaction = require('../models/Transaction');

// Pobierz wszystkie transakcje dla zalogowanego użytkownika
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ date: -1 })
      .exec();
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Pobierz pojedynczą transakcję
exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Nie znaleziono transakcji' });
    }
    
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Utwórz nową transakcję
exports.createTransaction = async (req, res) => {
  try {
    const { amount, type, category, description, date } = req.body;
    
    // Walidacja
    if (!amount || !type || !category || !date) {
      return res.status(400).json({ message: 'Brakuje wymaganych pól' });
    }
    
    const transaction = new Transaction({
      userId: req.user._id,
      amount,
      type,
      category,
      description: description || '',
      date: new Date(date)
    });
    
    await transaction.save();
    
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Aktualizuj istniejącą transakcję
exports.updateTransaction = async (req, res) => {
  try {
    const { amount, type, category, description, date } = req.body;
    
    // Znajdź i zaktualizuj transakcję
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { amount, type, category, description, date: new Date(date) },
      { new: true, runValidators: true }
    );
    
    if (!transaction) {
      return res.status(404).json({ message: 'Nie znaleziono transakcji' });
    }
    
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Usuń transakcję
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Nie znaleziono transakcji' });
    }
    
    res.json({ message: 'Transakcja została usunięta' });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};