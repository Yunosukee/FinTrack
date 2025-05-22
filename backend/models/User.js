const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // Dodaj tę zależność do projektu

// Schemat użytkownika ze stringowym _id
const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(), // Generuj UUID jako string
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  name: {
    type: String,
    trim: true
  },
  settings: {
    type: Object,
    default: {}
  },
  balance: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true, // Automatycznie dodaje createdAt i updatedAt
  _id: false // Wyłącz automatyczne generowanie _id przez Mongoose
});

// Metoda do weryfikacji hasła
userSchema.methods.isValidPassword = async function(password) {
  return await bcrypt.compare(password, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

module.exports = User;