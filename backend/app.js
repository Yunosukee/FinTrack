const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import konfiguracji
const { MONGODB_URI, MONGODB_OPTIONS } = require('./config/mongodb');

// Import routerów
const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const apiRoutes = require('./routes/api');
const usersRoutes = require('./routes/users');

// Inicjalizacja aplikacji Express
const app = express();

// Middleware
app.use(helmet()); // Zabezpieczenia nagłówków HTTP
app.use(morgan('dev')); // Logowanie zapytań HTTP
app.use(cors()); // Obsługa Cross-Origin Resource Sharing
app.use(express.json({ limit: '5mb' })); // Zwiększony limit rozmiaru dla synchronizacji

// Połączenie z bazą danych MongoDB
mongoose.connect(MONGODB_URI, MONGODB_OPTIONS)
  .then(() => {
    console.log('Połączono z bazą danych MongoDB');
  })
  .catch((err) => {
    console.error('Błąd połączenia z MongoDB:', err);
    process.exit(1);
  });

// Routing API
app.use('/api', apiRoutes); // Dodaj trasę dla newsów finansowych
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes); // Endpointy do synchronizacji danych
app.use('/api/users', usersRoutes); // Endpointy do zarządzania użytkownikami


// Obsługa błędów - middleware dla 404
app.use((req, res, next) => {
  res.status(404).json({ message: 'Nie znaleziono zasobu' });
});

// Obsługa błędów - middleware dla pozostałych błędów
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Wystąpił błąd na serwerze',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Port serwera
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});

module.exports = app;