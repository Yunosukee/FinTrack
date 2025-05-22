import { isOnline } from './auth.js';

// Initialize the database
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fintrackDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create transactions store if it doesn't exist
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: '_id', autoIncrement: true });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
      
      // Create budgets store if it doesn't exist
      if (!db.objectStoreNames.contains('budgets')) {
        const store = db.createObjectStore('budgets', { keyPath: '_id', autoIncrement: true });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
      
      // Create delete queue store if it doesn't exist
      if (!db.objectStoreNames.contains('deleteQueue')) {
        const store = db.createObjectStore('deleteQueue', { keyPath: '_id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Add a transaction to IndexedDB
export async function addTransaction(transaction) {
    try {
      const db = await initDB();
    
      return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
      
        const request = store.add(transaction);
      
        request.onsuccess = () => {
          resolve({ success: true, id: request.result });
        };
      
        request.onerror = () => {
          console.error('Error adding transaction:', request.error);
          reject(request.error);
        };
      
        tx.oncomplete = () => {
          console.log('Transaction added successfully to IndexedDB');
        };
      });
    } catch (error) {
      console.error('Error in addTransaction:', error);
      return { success: false, error: error.message };
    }
}

// Get recent transactions for a user
export async function getRecentTransactions(userId, days = 30) {
    try {
      const db = await initDB();
    
      return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('userId');
      
        const request = index.getAll(userId);
      
        request.onsuccess = () => {
          const allTransactions = request.result;
          console.log(`Retrieved ${allTransactions.length} transactions for user ${userId}`);
        
          // Filter for last X days
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
        
          const recentTransactions = allTransactions.filter(t => 
            new Date(t.date) >= cutoffDate
          );
        
          console.log(`Filtered to ${recentTransactions.length} transactions in the last ${days} days`);
          resolve(recentTransactions);
        };
      
        request.onerror = () => {
          console.error('Error getting transactions:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error in getRecentTransactions:', error);
      return [];
    }
}

// Get offline (unsynced) transactions
export async function getOfflineTransactions() {
    try {
      const db = await initDB();
    
      return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('synced');
      
        const request = index.getAll(0); // 0 = not synced
      
        request.onsuccess = () => {
          console.log(`Found ${request.result.length} unsynced transactions`);
          resolve(request.result);
        };
      
        request.onerror = () => {
          console.error('Error getting offline transactions:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error in getOfflineTransactions:', error);
      return [];
    }
}

// Mark transactions as synced
export async function markTransactionsSynced(transactions, serverTransactions = []) {
  try {
    const db = await initDB();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    
    for (const transaction of transactions) {
      // Znajdź odpowiadającą transakcję z serwera (jeśli istnieje)
      const serverTransaction = serverTransactions.find(t => 
        (t.createdAt === transaction.createdAt && 
         parseFloat(t.amount) === parseFloat(transaction.amount) && 
         t.description === transaction.description)
      );
      
      if (serverTransaction) {
        // Jeśli znaleziono odpowiadającą transakcję z serwera, zaktualizuj lokalną
        // z nowym _id z MongoDB i oznacz jako zsynchronizowaną
        const updatedTransaction = {
          ...transaction,
          _id: serverTransaction._id, // Użyj _id z MongoDB
          amount: parseFloat(serverTransaction.amount), // Upewnij się, że amount jest liczbą
          synced: 1,
          updatedAt: Date.now()
        };
        
        await store.put(updatedTransaction);
        console.log(`Transaction marked as synced with server _id: ${serverTransaction._id}`);
      } else {
        // Jeśli nie znaleziono, po prostu oznacz jako zsynchronizowaną
        const updatedTransaction = {
          ...transaction,
          amount: parseFloat(transaction.amount), // Upewnij się, że amount jest liczbą
          synced: 1,
          updatedAt: Date.now()
        };
        
        await store.put(updatedTransaction);
        console.log(`Transaction marked as synced: ${transaction._id}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error marking transactions as synced:', error);
    return false;
  }
}

// Funkcja do pobierania aktualnego salda użytkownika
export async function getCurrentBalance() {
  try {
    let serverBalance = 0;
    let isOffline = false;
    
    // Pobierz saldo z serwera, jeśli jesteśmy online
    if (await isOnline()) {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await fetch('http://localhost:3000/api/users/balance', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            serverBalance = parseFloat(data.balance);
          } else {
            isOffline = true;
          }
        }
      } catch (error) {
        console.error('Błąd podczas pobierania salda z serwera:', error);
        isOffline = true;
      }
    } else {
      isOffline = true;
    }
    
    // Jeśli jesteśmy offline lub wystąpił błąd, użyj ostatniego znanego salda z localStorage
    if (isOffline) {
      const cachedBalance = localStorage.getItem('serverBalance');
      if (cachedBalance !== null) {
        serverBalance = parseFloat(cachedBalance);
      }
    } else {
      // Zapisz pobrane saldo w localStorage do użycia w trybie offline
      localStorage.setItem('serverBalance', serverBalance.toString());
    }
    
    // Pobierz niezesynchronizowane transakcje z IndexedDB
    const offlineTransactions = await getOfflineTransactions();
    
    // Oblicz wpływ niezesynchronizowanych transakcji na saldo
    let offlineBalance = 0;
    for (const transaction of offlineTransactions) {
      if (transaction.type === 'income') {
        offlineBalance += parseFloat(transaction.amount);
      } else if (transaction.type === 'expense') {
        offlineBalance -= parseFloat(transaction.amount);
      }
    }
    
    // Oblicz aktualne saldo
    const currentBalance = serverBalance + offlineBalance;
    
    return { 
      success: true, 
      balance: currentBalance,
      serverBalance,
      offlineBalance,
      isOffline
    };
  } catch (error) {
    console.error('Błąd pobierania salda:', error);
    return { success: false, balance: 0, error: error.message };
  }
}