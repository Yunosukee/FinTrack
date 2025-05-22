const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Category = require('../models/Category');
const { Double } = require('mongodb');

// Synchronizacja danych (pull)
exports.pullData = async (req, res) => {
  console.log('=== PULL DATA REQUEST ===');
  console.log('User ID:', req.user._id);
  console.log('Last sync timestamp:', req.query.lastSyncTimestamp);
  
  try {
    const { lastSyncTimestamp } = req.query;
    const userId = req.user._id;
    
    // Pobierz dane, które zostały zmienione od ostatniej synchronizacji
    const transactions = await Transaction.find({
      userId,
      updatedAt: { $lt: new Date(parseInt(lastSyncTimestamp)) }
    });
    
    console.log(`Found ${transactions.length} transactions to send to client`);
    
    const categories = await Category.find({
      updatedAt: { $gt: new Date(parseInt(lastSyncTimestamp)) }
    });
    
    console.log(`Found ${categories.length} categories to send to client`);
    
    // Pobierz ustawienia użytkownika
    const user = await User.findById(userId, 'settings');
    
    res.json({
      timestamp: Date.now(),
      transactions,
      categories,
      userSettings: user.settings
    });
  } catch (error) {
    console.error('ERROR in pullData:', error);
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Synchronizacja danych (push)
exports.pushData = async (req, res) => {
  console.log('=== PUSH DATA REQUEST ===');
  console.log('User ID:', req.user._id);
  
  try {
    const { transactions, lastSyncTimestamp } = req.body;
    const userId = req.user._id;
    
    console.log(`Received ${transactions ? transactions.length : 0} transactions to process`);
    
    if (!transactions || transactions.length === 0) {
      return res.json({
        timestamp: Date.now(),
        results: { success: [], conflicts: [], errors: [] }
      });
    }
    
    // Obsługa transakcji do zapisania/aktualizacji
    const syncResults = {
      success: [],
      conflicts: [],
      errors: []
    };
    
    // Zmienna do śledzenia wpływu na saldo
    let balanceChange = 0;
    
    // Przetwarzaj każdą transakcję
    for (const transaction of transactions) {
      try {
        // Przygotuj dane transakcji
        const transactionData = {
          amount: new Double(parseFloat(transaction.amount)),
          description: transaction.description || '',
          category: transaction.category,
          type: transaction.type,
          date: new Date(transaction.date),
          userId,
          updatedAt: new Date()
        };
        
        // Oblicz wpływ na saldo
        if (transaction.type === 'income') {
          balanceChange += parseFloat(transaction.amount);
        } else if (transaction.type === 'expense') {
          balanceChange -= parseFloat(transaction.amount);
        }
        
        // Sprawdź, czy transakcja ma prawidłowe _id
        if (transaction._id && typeof transaction._id !== 'number') {
          // Sprawdź, czy transakcja istnieje
          const existingTransaction = await Transaction.findOne({
            _id: transaction._id,
            userId
          });
          
          if (existingTransaction) {
            // Sprawdź konflikt - czy ktoś już zmodyfikował tę transakcję
            if (lastSyncTimestamp && existingTransaction.updatedAt > new Date(parseInt(lastSyncTimestamp))) {
              syncResults.conflicts.push({
                clientData: transactionData,
                serverData: existingTransaction
              });
              continue;
            }
            
            // Aktualizuj istniejącą transakcję
            const updatedTransaction = await Transaction.findByIdAndUpdate(
              transaction._id,
              transactionData,
              { new: true }
            );
            
            syncResults.success.push(updatedTransaction);
          } else {
            // Transakcja nie istnieje - utwórz nową z podanym _id
            const newTransaction = new Transaction({
              ...transactionData,
              _id: transaction._id
            });
            
            await newTransaction.save();
            syncResults.success.push(newTransaction);
          }
        } else {
          // Nowa transakcja
          const newTransaction = new Transaction(transactionData);
          await newTransaction.save();
          syncResults.success.push(newTransaction);
        }
      } catch (error) {
        console.error('ERROR processing transaction:', error);
        syncResults.errors.push({
          data: transaction,
          error: error.message
        });
      }
    }
    
    // Aktualizuj saldo użytkownika
    if (balanceChange !== 0) {
      try {
        const user = await User.findById(userId);
        const currentBalance = user.balance || 0;
        const newBalance = currentBalance + balanceChange;
        
        await User.findByIdAndUpdate(userId, { balance: newBalance });
        
        console.log(`Updated user balance: ${currentBalance} -> ${newBalance} (change: ${balanceChange})`);
      } catch (error) {
        console.error('ERROR updating user balance:', error);
      }
    }
    
    console.log('Sync results summary:');
    console.log(`- Success: ${syncResults.success.length}`);
    console.log(`- Conflicts: ${syncResults.conflicts.length}`);
    console.log(`- Errors: ${syncResults.errors.length}`);
    
    res.json({
      timestamp: Date.now(),
      results: syncResults
    });
  } catch (error) {
    console.error('ERROR in pushData:', error);
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};

// Aktualizacja ustawień użytkownika
exports.updateSettings = async (req, res) => {
  console.log('=== UPDATE SETTINGS REQUEST ===');
  console.log('User ID:', req.user._id);
  
  try {
    const { settings } = req.body;
    const userId = req.user._id;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { settings },
      { new: true }
    );
    
    res.json({
      timestamp: Date.now(),
      settings: user.settings
    });
  } catch (error) {
    console.error('ERROR in updateSettings:', error);
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
};