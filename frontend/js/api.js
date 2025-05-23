import { getOfflineTransactions, markTransactionsSynced, initDB } from './db.js';
import { isOnline } from './auth.js';
import { updateDisplayedBalance } from './transactions.js';

// Bazowy URL API
const API_URL = 'http://localhost:3000/api';

// Funkcja do pobierania newsów finansowych
export async function getFinancialNews() {
  try {
    // Sprawdź, czy jesteśmy online
    if (!await isOnline()) {
      console.log('Offline mode: returning cached financial news');
      // Zwróć dane z lokalnego cache, jeśli są dostępne
      const cachedNews = localStorage.getItem('cachedFinancialNews');
      if (cachedNews) {
        return { 
          articles: JSON.parse(cachedNews),
          isOffline: true 
        };
      }
      return { articles: [], isOffline: true };
    }
    
    // Sprawdź, czy minęło wystarczająco dużo czasu od ostatniego odświeżenia
    // (aby nie przekroczyć limitów API)
    const lastUpdate = localStorage.getItem('lastNewsUpdate');
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    
    if (lastUpdate && (now - parseInt(lastUpdate)) < ONE_HOUR) {
      console.log('Using cached news (less than 1 hour old)');
      const cachedNews = localStorage.getItem('cachedFinancialNews');
      if (cachedNews) {
        return { 
          articles: JSON.parse(cachedNews),
          isOffline: false 
        };
      }
    }
    
    console.log('Fetching fresh financial news');
    
    // Ponieważ większość darmowych API wymaga klucza API, który nie powinien być
    // przechowywany w kodzie klienta, użyjemy proxy przez nasz backend
    const response = await fetch(`${API_URL}/news`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch news: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Zapisz dane w lokalnym cache
    localStorage.setItem('cachedFinancialNews', JSON.stringify(data.articles));
    localStorage.setItem('lastNewsUpdate', now.toString());
    
    return { articles: data.articles, isOffline: false };
  } catch (error) {
    console.error('Error fetching financial news:', error);
    
    // W przypadku błędu, spróbuj użyć danych z cache
    const cachedNews = localStorage.getItem('cachedFinancialNews');
    if (cachedNews) {
      return { 
        articles: JSON.parse(cachedNews),
        isOffline: true 
      };
    }
    
    // Jeśli nie ma cache, zwróć przykładowe dane
    return { 
      articles: [
        {
          title: 'Przykładowy news finansowy',
          description: 'To jest przykładowy news finansowy, który jest wyświetlany, gdy nie można pobrać aktualnych danych.',
          date: new Date().toISOString(),
          source: 'FinTrack (offline)'
        },
        {
          title: 'Jak oszczędzać pieniądze',
          description: 'Poznaj 10 sprawdzonych sposobów na oszczędzanie pieniędzy w codziennym życiu.',
          date: new Date().toISOString(),
          source: 'FinTrack (offline)'
        },
        {
          title: 'Inwestowanie dla początkujących',
          description: 'Podstawowe informacje o tym, jak rozpocząć inwestowanie nawet z małym kapitałem.',
          date: new Date().toISOString(),
          source: 'FinTrack (offline)'
        }
      ], 
      isOffline: true 
    };
  }
}

// Funkcja do synchronizacji danych
export async function syncData() {
  console.log('Starting data synchronization...');
  
  if (!await isOnline()) {
    console.log('No internet connection. Synchronization not possible.');
    return { success: false, message: 'Brak połączenia z internetem' };
  }

  try {
    // Pobierz token uwierzytelniający z localStorage
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('No auth token found');
      return { success: false, message: 'Nie jesteś zalogowany' };
    }

    // Pobierz znacznik czasu ostatniej synchronizacji
    const lastSync = localStorage.getItem('lastSyncTimestamp') || 0;
    console.log(`Last sync timestamp: ${lastSync}`);
    
    // 1. PULL - Pobierz nowe dane z serwera
    console.log('STEP 1: Pulling data from server...');
    await pullFromServer(lastSync, token);
    
    // 2. PUSH - Wyślij lokalne zmiany na serwer
    console.log('STEP 2: Pushing local changes to server...');
    await pushToServer(token);
    
    // 3. PROCESS DELETE QUEUE - Przetwórz kolejkę usunięć
    console.log('STEP 3: Processing delete queue...');
    const deleteResult = await processDeleteQueue();
    console.log(`Delete queue processed: ${deleteResult.deleted} items deleted, ${deleteResult.errors} errors`);
    
    // 4. Aktualizuj timestamp synchronizacji
    const newTimestamp = Date.now();
    localStorage.setItem('lastSyncTimestamp', newTimestamp);
    localStorage.setItem('lastSuccessfulSync', newTimestamp);
    console.log(`Synchronization completed. New timestamp: ${newTimestamp}`);
    
    // 5. Aktualizuj wyświetlane saldo
    await updateDisplayedBalance();
    
    return { success: true, timestamp: newTimestamp };
  } catch (error) {
    console.error('Error during synchronization:', error);
    return { success: false, message: error.message };
  }
}

// Pobieranie danych z serwera
async function pullFromServer(lastSync, token) {
  try {
    console.log(`Pulling data from server since ${new Date(parseInt(lastSync))}`);
    
    const response = await fetch(`${API_URL}/sync/pull?lastSyncTimestamp=${lastSync}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Server error: ${response.status} ${errorText}`);
      throw new Error(`Błąd pobierania danych z serwera: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Received data from server: ${JSON.stringify(data, null, 2)}`);
    
    // Zapisz pobrane dane do IndexedDB
    const db = await initDB();
    
    // Zapisz transakcje
    if (data.transactions && data.transactions.length > 0) {
      console.log(`Saving ${data.transactions.length} transactions to IndexedDB`);
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      
      for (const transaction of data.transactions) {
        // Ustaw flagę synced na 1, ponieważ dane pochodzą z serwera
        transaction.synced = 1;
        store.put(transaction);
      }
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    
    // Zapisz budżety
    if (data.budgets && data.budgets.length > 0) {
      console.log(`Saving ${data.budgets.length} budgets to IndexedDB`);
      const tx = db.transaction('budgets', 'readwrite');
      const store = tx.objectStore('budgets');
      
      for (const budget of data.budgets) {
        // Ustaw flagę synced na 1, ponieważ dane pochodzą z serwera
        budget.synced = 1;
        store.put(budget);
      }
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    
    console.log('Pull from server completed successfully');
    return data;
  } catch (error) {
    console.error('Error during pull from server:', error);
    throw error;
  }
}

// Wysyłanie danych na serwer
async function pushToServer(token) {
  try {
    // Pobierz niezesynchronizowane transakcje
    const offlineTransactions = await getOfflineTransactions();
    
    console.log(`Found ${offlineTransactions.length} transactions to sync`);
    
    if (offlineTransactions.length === 0) {
      console.log('No data to synchronize');
      return { success: true, message: 'Brak danych do synchronizacji' };
    }
    
    // Pobierz znacznik czasu ostatniej synchronizacji
    const lastSync = localStorage.getItem('lastSyncTimestamp') || 0;
    
    // KLUCZOWA ZMIANA: Przygotuj transakcje do wysłania - upewnij się, że amount jest double
    const transactionsToSend = offlineTransactions.map(transaction => {
      // Stwórz kopię transakcji
      const processedTransaction = {...transaction};

      return processedTransaction;
    });

    console.log('Sending data to server:', JSON.stringify({ 
      transactions: transactionsToSend,
      lastSyncTimestamp: lastSync
    }));
    
    const response = await fetch(`${API_URL}/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        transactions: transactionsToSend,
        lastSyncTimestamp: lastSync
      })
    });
    
    console.log(`Server response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Server error: ${response.status} ${errorText}`);
      throw new Error(`Błąd wysyłania danych na serwer: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Server response:', result);
    
    // Oznacz transakcje jako zsynchronizowane
    await markTransactionsSynced(offlineTransactions);
    console.log('Transactions marked as synced');
    
    return result;
  } catch (error) {
    console.error('Error during push to server:', error);
    throw error;
  }
}

// Funkcja do przetwarzania kolejki usunięć
async function processDeleteQueue() {
  try {
    const db = await initDB();
    const tx = db.transaction('deleteQueue', 'readonly');
    const store = tx.objectStore('deleteQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = async () => {
        const deleteQueue = request.result;
        console.log(`Found ${deleteQueue.length} items in delete queue`);
        
        if (deleteQueue.length === 0) {
          resolve({ success: true, deleted: 0 });
          return;
        }
        
        const token = localStorage.getItem('authToken');
        if (!token) {
          resolve({ success: false, message: 'Nie jesteś zalogowany' });
          return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        // Przetwórz każdy element kolejki
        for (const item of deleteQueue) {
          if (item.type === 'transaction') {
            try {
              const response = await fetch(`${API_URL}/transactions/${item.itemId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                // Usuń z kolejki po pomyślnym usunięciu z serwera
                await removeFromDeleteQueue(item.itemId);
                successCount++;
              } else {
                console.error(`Failed to delete transaction ${item.itemId} from server`);
                errorCount++;
              }
            } catch (error) {
              console.error(`Error deleting transaction ${item.itemId}:`, error);
              errorCount++;
            }
          }
        }
        
        resolve({ 
          success: true, 
          deleted: successCount, 
          errors: errorCount 
        });
      };
      
      request.onerror = () => {
        console.error('Error getting delete queue:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error processing delete queue:', error);
    return { success: false, message: error.message };
  }
}

// Funkcja do usuwania elementu z kolejki usunięć
async function removeFromDeleteQueue(queueItemId) {
  try {
    const db = await initDB();
    const tx = db.transaction('deleteQueue', 'readwrite');
    const store = tx.objectStore('deleteQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(queueItemId);
      
      request.onsuccess = () => {
        console.log(`Removed item ${queueItemId} from delete queue`);
        resolve(true);
      };
      
      request.onerror = () => {
        console.error('Error removing from delete queue:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error removing from delete queue:', error);
    return false;
  }
}