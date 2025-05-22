const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware do weryfikacji tokenu JWT
const auth = async (req, res, next) => {
  try {
    // Pobierz token z nagłówka
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Brak tokenu uwierzytelniającego' });
    }
    
    // Weryfikuj token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Znajdź użytkownika po ID (teraz jako string)
    const user = await User.findOne({ _id: decoded.id });
    if (!user) {
      return res.status(401).json({ message: 'Nieprawidłowy token' });
    }
    
    // Dodaj obiekt użytkownika do req, aby mógł być używany w następnych kontrolerach
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    res.status(401).json({ message: 'Nieprawidłowy token', error: error.message });
  }
};

module.exports = auth;