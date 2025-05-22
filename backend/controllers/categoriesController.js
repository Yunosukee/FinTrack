const Category = require('../models/Category');

// Pobierz wszystkie kategorie
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};