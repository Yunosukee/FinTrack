import { checkLoginStatus, isOnline } from "./auth.js";
import { syncData } from "./api.js";
import { addTransaction, getRecentTransactions, initDB, getCurrentBalance } from "./db.js";

// Bazowy URL API
const API_URL = 'http://localhost:3000/api';

// Dodaj kontener na komunikaty, jeśli nie istnieje
function addMessageContainer() {
  if (!document.getElementById('message-container')) {
    const main = document.querySelector('main');
    if (main) {
      const container = document.createElement('div');
      container.id = 'message-container';
      container.className = 'message-container';
      main.prepend(container);
    }
  }
}

// Funkcja do usuwania transakcji
async function deleteTransaction(transactionId) {
  console.log('Rozpoczynam usuwanie transakcji o ID:', transactionId);
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      showMessage('error', 'Musisz być zalogowany, aby usunąć transakcję');
      return false;
    }
    
    console.log('Inicjalizuję bazę danych...');
    const db = await initDB();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    
    console.log('Pobieranie transakcji z bazy...');
    return new Promise((resolve, reject) => {
      const request = store.get(transactionId);
      
      request.onsuccess = async () => {
        const transaction = request.result;
        console.log('Pobrana transakcja:', transaction);
        
        // Sprawdź czy transakcja istnieje
        if (!transaction) {
          console.error('Nie znaleziono transakcji o ID:', transactionId);
          showMessage('error', 'Nie znaleziono transakcji');
          resolve(false);
          return;
        }
      
        if (transaction.userId === userId) {
          console.log('Usuwam transakcję lokalnie...');
          // Usuń lokalnie
          const deleteRequest = store.delete(transactionId);
          
          deleteRequest.onsuccess = async () => {
            console.log('Transakcja usunięta lokalnie');
            
            // Sprawdź, czy jesteśmy online
            const online = await isOnline();
            console.log('Status online:', online);
            
            if (online && transaction.synced === 1) {
              // Jeśli jesteśmy online i transakcja była zsynchronizowana, 
              // wyślij żądanie usunięcia na serwer
              try {
                const token = localStorage.getItem('authToken');
                if (token) {
                  const response = await fetch(`${API_URL}/transactions/${transactionId}`, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  if (response.ok) {
                    console.log(`Transaction ${transactionId} deleted from server`);
                  } else {
                    console.error(`Failed to delete transaction ${transactionId} from server`);
                    // Dodaj do kolejki usunięć, jeśli nie udało się usunąć z serwera
                    await addToDeleteQueue(transactionId);
                  }
                }
              } catch (error) {
                console.error('Error deleting from server:', error);
                // Dodaj do kolejki usunięć w przypadku błędu
                await addToDeleteQueue(transactionId);
              }
            } else if (transaction.synced === 1) {
              // Jeśli jesteśmy offline, ale transakcja była zsynchronizowana,
              // dodaj do kolejki usunięć
              console.log('Dodaję transakcję do kolejki usunięć...');
              await addToDeleteQueue(transactionId);
            }
            
            showMessage('success', 'Transakcja została usunięta');
            
            // Odśwież listę
            loadTransactions(); 
            
            // Aktualizuj wyświetlane saldo
            await updateDisplayedBalance();
            
            resolve(true);
          };
          
          deleteRequest.onerror = (event) => {
            console.error('Error deleting transaction:', event.target.error);
            reject(event.target.error);
          };
        } else {
          console.error('Brak uprawnień do usunięcia transakcji');
          showMessage('error', 'Nie masz uprawnień do usunięcia tej transakcji');
          resolve(false);
        }
      };
      
      request.onerror = (event) => {
        console.error('Error getting transaction for deletion:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Błąd usuwania transakcji:', error);
    showMessage('error', `Błąd: ${error.message}`);
    return false;
  }
}

// Funkcja do dodawania usuniętych transakcji do kolejki usunięć
async function addToDeleteQueue(transactionId) {
  console.log('Dodaję transakcję do kolejki usunięć:', transactionId);
  try {
    const db = await initDB();
    
    // Sprawdź, czy obiekt store 'deleteQueue' istnieje
    if (!db.objectStoreNames.contains('deleteQueue')) {
      console.error('Obiekt store "deleteQueue" nie istnieje!');
      return false;
    }
    
    const tx = db.transaction('deleteQueue', 'readwrite');
    const store = tx.objectStore('deleteQueue');
    
    // Sprawdź, czy indeks 'itemId' istnieje
    if (!store.indexNames.contains('itemId')) {
      console.error('Indeks "itemId" nie istnieje w obiekcie store "deleteQueue"!');
      // Dodaj element bez sprawdzania duplikatów
      return new Promise((resolve, reject) => {
        const request = store.add({
          type: 'transaction',
          itemId: transactionId,
          timestamp: Date.now()
        });
        
        request.onsuccess = () => {
          console.log(`Added transaction ${transactionId} to delete queue`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error('Error adding to delete queue:', event.target.error);
          reject(event.target.error);
        };
      });
    }
    
    return new Promise((resolve, reject) => {
      // Sprawdź, czy transakcja już istnieje w kolejce
      const index = store.index('itemId');
      const checkRequest = index.getAll(transactionId);
      
      checkRequest.onsuccess = (event) => {
        const existingItems = event.target.result;
        if (existingItems && existingItems.length > 0) {
          console.log(`Transaction ${transactionId} already in delete queue`);
          resolve(true);
          return;
        }
        
        // Dodaj do kolejki usunięć
        const request = store.add({
          type: 'transaction',
          itemId: transactionId,
          timestamp: Date.now()
        });
        
        request.onsuccess = () => {
          console.log(`Added transaction ${transactionId} to delete queue`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error('Error adding to delete queue:', event.target.error);
          reject(event.target.error);
        };
      };
      
      checkRequest.onerror = (event) => {
        console.error('Error checking delete queue:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Błąd dodawania do kolejki usunięć:', error);
    return false;
  }
}

// Funkcja do ładowania transakcji
async function loadTransactions() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      showMessage('error', 'Musisz być zalogowany, aby zobaczyć transakcje');
      return;
    }
  
    // Pobierz transakcje z ostatnich 30 dni
    const transactions = await getRecentTransactions(userId);
  
    // Sortuj transakcje od najnowszych
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
    // Wyświetl transakcje
    displayTransactions(transactions);
    
    // Aktualizuj wyświetlane saldo
    await updateDisplayedBalance();
  } catch (error) {
    console.error('Błąd pobierania transakcji:', error);
    showMessage('error', `Błąd: ${error.message}`);
  }
}

// Funkcja wyświetlająca komunikaty
function showMessage(type, message) {
  // Upewnij się, że kontener na komunikaty istnieje
  addMessageContainer();
  
  const messageContainer = document.getElementById('message-container');
  if (!messageContainer) return;

  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;

  messageContainer.appendChild(messageElement);

  // Usuń komunikat po 3 sekundach
  setTimeout(() => {
    messageElement.classList.add('fade-out');
    setTimeout(() => {
      if (messageElement.parentNode === messageContainer) {
        messageContainer.removeChild(messageElement);
      }
    }, 500);
  }, 3000);
}

// Inicjalizacja po załadowaniu DOM - poprawiona wersja
document.addEventListener('DOMContentLoaded', async () => {
  // Sprawdź status logowania
  if (!checkLoginStatus()) {
    window.location.href = '/login.html';
    return;
  }

  // Dodaj kontener na komunikaty
  addMessageContainer();
  
  // Dodaj przycisk synchronizacji
  addSyncButton();

  // Nasłuchuj na zmiany statusu online/offline
  window.addEventListener('online', () => {
    updateOnlineStatus();
    syncData().then(result => {
      if (result.success) {
        showMessage('success', 'Dane zostały zsynchronizowane');
        loadTransactions(); // Odśwież listę
      }
    }).catch(error => {
      console.error('Błąd automatycznej synchronizacji:', error);
    });
  });

  // Nasłuchuj na zmiany stanu połączenia
  window.addEventListener('online', updateOfflineIndicator);
  window.addEventListener('offline', updateOfflineIndicator);

  // Inicjalizuj formularz dodawania transakcji
  const transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', addNewTransaction);
  
    // Ustaw domyślną datę na dzisiaj
    const dateInput = document.getElementById('transaction-date');
    if (dateInput) {
      dateInput.valueAsDate = new Date();
    }
  }
  
  // Obsługa filtrów
  const applyFiltersBtn = document.getElementById('apply-filters');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', filterTransactions);
  }

  const clearFiltersBtn = document.getElementById('clear-filters');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearFilters);
  }
  
  // Załaduj transakcje przy starcie
  loadTransactions();
  
  // Sprawdź status online/offline
  updateOfflineIndicator();
  
  // Aktualizuj wyświetlane saldo
  await updateDisplayedBalance();
});

// Funkcja do filtrowania transakcji
async function filterTransactions() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      showMessage('error', 'Musisz być zalogowany, aby filtrować transakcje');
      return;
    }
    
    // Pobierz wartości filtrów
    const typeFilter = document.getElementById('filter-type').value;
    const categoryFilter = document.getElementById('filter-category').value;
    const dateFromFilter = document.getElementById('filter-date-from').value;
    const dateToFilter = document.getElementById('filter-date-to').value;
    
    console.log('Applying filters:', { typeFilter, categoryFilter, dateFromFilter, dateToFilter });
    
    // Pobierz wszystkie transakcje
    const allTransactions = await getRecentTransactions(userId, 365); // Pobierz transakcje z ostatniego roku
    
    // Filtruj transakcje
    const filteredTransactions = allTransactions.filter(transaction => {
      // Filtr typu
      if (typeFilter !== 'all' && transaction.type !== typeFilter) {
        return false;
      }
      
      // Filtr kategorii
      if (categoryFilter !== 'all' && transaction.category !== categoryFilter) {
        return false;
      }
      
      // Filtr daty od
      if (dateFromFilter && new Date(transaction.date) < new Date(dateFromFilter)) {
        return false;
      }
      
      // Filtr daty do
      if (dateToFilter && new Date(transaction.date) > new Date(dateToFilter)) {
        return false;
      }
      
      return true;
    });
    
    // Sortuj transakcje od najnowszych
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Wyświetl przefiltrowane transakcje
    displayTransactions(filteredTransactions);
    
    // Pokaż informację o liczbie znalezionych transakcji
    showMessage('info', `Znaleziono ${filteredTransactions.length} transakcji`);
    
  } catch (error) {
    console.error('Błąd filtrowania transakcji:', error);
    showMessage('error', `Błąd: ${error.message}`);
  }
}

// Funkcja do czyszczenia filtrów
function clearFilters() {
  // Resetuj wartości filtrów
  document.getElementById('filter-type').value = 'all';
  document.getElementById('filter-category').value = 'all';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  
  // Załaduj wszystkie transakcje
  loadTransactions();
  
  showMessage('info', 'Filtry zostały wyczyszczone');
}

// Funkcja do aktualizacji wskaźnika trybu offline
function updateOfflineIndicator() {
  const offlineIndicator = document.getElementById('offline-indicator');
  if (!offlineIndicator) {
    // Jeśli nie istnieje, utwórz go
    const header = document.querySelector('header');
    if (header) {
      const indicator = document.createElement('div');
      indicator.id = 'offline-indicator';
      indicator.className = 'offline-indicator';
      indicator.innerHTML = 'Tryb offline - zmiany zostaną zsynchronizowane po połączeniu';
      header.appendChild(indicator);
    }
  } else {
    // Aktualizuj istniejący
    if (isOnline()) {
      offlineIndicator.style.display = 'none';
    } else {
      offlineIndicator.style.display = 'block';
    }
  }
}

// Funkcja do aktualizacji statusu online
function updateOnlineStatus() {
  const online = isOnline();
  console.log(`Online status changed: ${online ? 'online' : 'offline'}`);
  updateOfflineIndicator();
}

// Dodaj brakujący przycisk synchronizacji, jeśli nie istnieje
function addSyncButton() {
  if (!document.getElementById('sync-button')) {
    const header = document.querySelector('header');
    if (header) {
      const syncButton = document.createElement('button');
      syncButton.id = 'sync-button';
      syncButton.className = 'btn-sync';
      syncButton.innerHTML = 'Synchronizuj';
      
      syncButton.addEventListener('click', async () => {
        try {
          if (!await isOnline()) {
            showMessage('error', 'Brak połączenia z internetem. Synchronizacja niemożliwa.');
            return;
          }
          
          showMessage('info', 'Synchronizacja w toku...');
          const result = await syncData();
          
          if (result.success) {
            showMessage('success', 'Dane zostały pomyślnie zsynchronizowane');
            loadTransactions(); // Odśwież listę
            
            // Aktualizuj wyświetlane saldo
            await updateDisplayedBalance();
          } else {
            showMessage('error', result.message || 'Błąd synchronizacji');
          }
        } catch (error) {
          console.error('Błąd synchronizacji:', error);
          showMessage('error', `Błąd: ${error.message}`);
        }
      });
      
      header.appendChild(syncButton);
    }
  }
}

// Funkcja do wyświetlania transakcji - poprawiona
function displayTransactions(transactions) {
  const transactionsList = document.getElementById('transactions-list');
  if (!transactionsList) return;

  // Wyczyść listę
  transactionsList.innerHTML = '';

  if (transactions.length === 0) {
    const noTransactionsRow = document.createElement('tr');
    noTransactionsRow.innerHTML = '<td colspan="5" class="no-transactions">Brak transakcji do wyświetlenia</td>';
    transactionsList.appendChild(noTransactionsRow);
    
    // Pokaż komunikat o braku danych
    const noTransactionsMsg = document.getElementById('no-transactions');
    if (noTransactionsMsg) {
      noTransactionsMsg.hidden = false;
    }
    return;
  }
  
  // Ukryj komunikat o braku danych
  const noTransactionsMsg = document.getElementById('no-transactions');
  if (noTransactionsMsg) {
    noTransactionsMsg.hidden = true;
  }

  // Dodaj każdą transakcję do tabeli
  transactions.forEach(transaction => {
    const row = document.createElement('tr');
    row.className = `transaction-row ${transaction.type === 'expense' ? 'expense' : 'income'}`;
  
    // Oznacz niezesynchronizowane transakcje
    if (transaction.synced === 0) {
      row.classList.add('not-synced');
    }
  
    const date = new Date(transaction.date).toLocaleDateString('pl-PL');
    const amount = `${transaction.amount} zł`;
  
    row.innerHTML = `
      <td>${date}</td>
      <td>${transaction.category}</td>
      <td>${transaction.description}</td>
      <td class="amount ${transaction.type === 'expense' ? 'expense' : 'income'}">${amount}</td>
      <td>
        <button class="btn-delete" data-id="${transaction._id}">Usuń</button>
        ${transaction.synced === 0 ? '<span class="sync-status">⚠️</span>' : ''}
      </td>
    `;
  
    transactionsList.appendChild(row);
  });
  
  // Dodaj obsługę przycisków usuwania
  const deleteButtons = document.querySelectorAll('.btn-delete');
  deleteButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      console.log('Próba usunięcia transakcji o ID:', id);
      
      if (confirm('Czy na pewno chcesz usunąć tę transakcję?')) {
        console.log('Usuwanie transakcji o ID:', id);
        try {
          const result = await deleteTransaction(id);
          console.log('Wynik usuwania:', result);
          
          if (result) {
            showMessage('success', 'Transakcja została usunięta');
            // Odśwież listę transakcji
            loadTransactions();
          }
        } catch (error) {
          console.error('Błąd podczas usuwania transakcji:', error);
          showMessage('error', `Błąd: ${error.message}`);
        }
      }
    });
  });
}

// Funkcja do dodawania nowej transakcji
async function addNewTransaction(event) {
  event.preventDefault();
  
  // Pobierz dane z formularza
  const amountInput = document.getElementById('transaction-amount').value;
  const description = document.getElementById('transaction-description').value;
  const category = document.getElementById('transaction-category').value;
  const type = document.getElementById('transaction-type').value;
  const date = document.getElementById('transaction-date').value || new Date().toISOString().split('T')[0];
  
  // Walidacja
  if (isNaN(amountInput) || amountInput <= 0) {
    showMessage('error', 'Kwota musi być liczbą większą od zera');
    return;
  }

  if (!description) {
    showMessage('error', 'Opis jest wymagany');
    return;
  }

  if (!category) {
    showMessage('error', 'Kategoria jest wymagana');
    return;
  }

  // Pobierz ID użytkownika
  const userId = localStorage.getItem('userId');
  if (!userId) {
    showMessage('error', 'Musisz być zalogowany, aby dodać transakcję');
    return;
  }

  // Przygotuj obiekt transakcji - używaj liczby dla amount, nie stringa
  const transaction = {
    userId: parseInt(userId),
    amount: parseFloat(amountInput), // Zapisz jako liczba, nie string
    description,
    category,
    type,
    date,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    synced: 0 // Nie zsynchronizowane
  };

  console.log('Dodaję transakcję:', transaction);
  console.log('Typ amount:', typeof transaction.amount, transaction.amount);

  try {
    // Zapisz w lokalnej bazie IndexedDB
    const result = await addTransaction(transaction);
    
    if (!result.success) {
      throw new Error('Błąd podczas zapisywania transakcji lokalnie');
    }
    
    // Sprawdź, czy jesteśmy online
    const online = await isOnline();
  
    // Jeśli jesteśmy online, spróbuj zsynchronizować od razu
    if (online) {
      const syncResult = await syncData();
      if (syncResult.success) {
        showMessage('success', 'Transakcja została dodana i zsynchronizowana z serwerem');
      } else {
        showMessage('warning', 'Transakcja została dodana lokalnie, ale nie zsynchronizowana z serwerem');
      }
    } else {
      showMessage('success', 'Transakcja została dodana lokalnie i zostanie zsynchronizowana gdy połączenie wróci');
    }
    
    // Resetowanie poszczególnych pól formularza
    document.getElementById('transaction-description').value = '';
    document.getElementById('transaction-amount').value = '';
    document.getElementById('transaction-type').value = 'expense'; // lub inna domyślna wartość
    document.getElementById('transaction-category').value = 'food'; // lub inna domyślna wartość
    document.getElementById('transaction-date').valueAsDate = new Date(); // ustaw dzisiejszą datę

    // Odśwież listę transakcji
    loadTransactions();
    
    // Aktualizuj wyświetlane saldo
    await updateDisplayedBalance();
  } catch (error) {
    console.error('Błąd dodawania transakcji:', error);
    showMessage('error', `Błąd: ${error.message}`);
  }
}

// Funkcja do aktualizacji wyświetlanego salda
export async function updateDisplayedBalance() {
  try {
    // Pobierz aktualne saldo
    const balanceResult = await getCurrentBalance();
    
    if (balanceResult.success) {
      // Znajdź element salda, jeśli istnieje
      const balanceElement = document.getElementById('current-balance');
      if (balanceElement) {
        // Formatuj saldo z dwoma miejscami po przecinku
        balanceElement.textContent = `${balanceResult.balance.toFixed(2)} zł`;
        
        // Dodaj klasę w zależności od salda
        if (balanceResult.balance < 0) {
          balanceElement.classList.add('negative');
          balanceElement.classList.remove('positive');
        } else {
          balanceElement.classList.add('positive');
          balanceElement.classList.remove('negative');
        }
      }
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji wyświetlanego salda:', error);
  }
}