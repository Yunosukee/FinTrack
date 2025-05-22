const User = require('../models/User');
const bcrypt = require('bcrypt');

// Aktualizacja profilu użytkownika
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const updates = {};
    
    if (name) updates.name = name;
    if (email) updates.email = email;
    
    // Jeśli użytkownik chce zmienić hasło
    if (currentPassword && newPassword) {
      // Sprawdź, czy aktualne hasło jest poprawne
      const isMatch = await req.user.isValidPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Aktualne hasło jest niepoprawne' });
      }
      
      // Haszuj nowe hasło
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    
    // Aktualizuj profil użytkownika
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json({
      id: user._id,
      email: user.email,
      name: user.name
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Aktualizacja ustawień użytkownika
exports.updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    
    // Aktualizuj ustawienia użytkownika
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { settings },
      { new: true }
    );
    
    res.json({
      id: user._id,
      settings: user.settings
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Pobieranie salda użytkownika
exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id, 'balance');
    
    res.json({
      success: true,
      balance: user.balance || 0
    });
  } catch (error) {
    console.error('ERROR in getBalance:', error);
    res.status(500).json({ success: false, message: 'Błąd serwera', error: error.message });
  }
};