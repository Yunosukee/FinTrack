const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: String, // Zmiana z mongoose.Schema.Types.ObjectId na String
    required: true
  },
  amount: {
    type: Number, // Mongoose automatycznie obsłuży konwersję na double
    required: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  date: {
    type: Date,
    required: true
  }
}, {
  timestamps: true // Automatycznie dodaje createdAt i updatedAt
});

// Indeksy dla szybszego wyszukiwania
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userId: 1, category: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;