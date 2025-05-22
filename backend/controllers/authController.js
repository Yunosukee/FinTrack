const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

// Rejestracja nowego użytkownika
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Sprawdź, czy użytkownik już istnieje
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Użytkownik z tym emailem już istnieje' });
    }
    
    // Hash hasła
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Utwórz nowego użytkownika z stringowym _id
    const user = new User({
      _id: uuidv4(), // Generuj UUID jako string
      email,
      passwordHash,
      name
    });
    
    await user.save();
    
    // Wygeneruj token JWT
    const token = jwt.sign(
      { id: user._id }, // _id jest już stringiem
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      user: {
        id: user._id, // _id jest już stringiem
        email: user.email,
        name: user.name
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Logowanie użytkownika
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Znajdź użytkownika
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
    }
    
    // Sprawdź hasło
    const isMatch = await user.isValidPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
    }
    
    // Wygeneruj token JWT
    const token = jwt.sign(
      { id: user._id }, // _id jest już stringiem
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      user: {
        id: user._id, // _id jest już stringiem
        email: user.email,
        name: user.name
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Pobranie profilu użytkownika
exports.getProfile = async (req, res) => {
  try {
    // Użytkownik jest już dostępny dzięki middleware auth
    const user = req.user;
    
    res.json({
      id: user._id.toString(), // Konwertuj ObjectId na string
      email: user.email,
      name: user.name,
      settings: user.settings
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Weryfikacja tokena
exports.verifyToken = async (req, res) => {
  try {
    // Sprawdzanie czy token jest poprawny
    // req.user jest dostępny jeśli middleware auth poprawnie zweryfikowało token
    if (req.user) {
      // Token jest poprawny
      return res.json({
        isValid: true
      });
    } else {
      // Token jest niepoprawny lub brak tokena
      return res.json({
        isValid: false
      });
    }
  } catch (error) {
    console.error('Błąd podczas weryfikacji tokena:', error);
    return res.status(500).json({ 
      isValid: false, 
      message: 'Błąd serwera', 
      error: error.message 
    });
  }
};