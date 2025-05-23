import { checkLoginStatus, isOnline } from './auth.js';
import { initDB } from './db.js';
import { loadUserData } from './app.js';
import { syncData } from './api.js';

// Bazowy URL API
const API_URL = 'http://localhost:3000/api';

// Globalne zmienne
let userBudgets = [];
let editingBudgetId = null;
let userNotifications = [];
let editingNotificationId = null;

// Inicjalizacja po załadowaniu DOM
document.addEventListener('DOMContentLoaded', async () => {
      // Sprawdź status logowania
      if (!checkLoginStatus()) {
          window.location.href = '/login.html';
          return;
      }
    
      // Załaduj dane użytkownika
      await loadUserData();
    
      // Załaduj budżety
      await loadBudgets();
    
      // Załaduj powiadomienia
      await loadNotifications();
    
      // Dodaj event listenery
      setupEventListeners();
    
      // Aktualizuj wskaźnik trybu offline
      updateOfflineIndicator();
    
      // Nasłuchuj na zmiany stanu połączenia
      window.addEventListener('online', updateOfflineIndicator);
      window.addEventListener('offline', updateOfflineIndicator);
    
      // Poproś o uprawnienia do powiadomień
      requestNotificationPermission();
});


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

// Funkcja do prośby o uprawnienia do powiadomień
function requestNotificationPermission() {
      if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
          Notification.requestPermission();
      }
}

// Funkcja do ładowania powiadomień
async function loadNotifications() {
      try {
          const userId = localStorage.getItem('userId');
          if (!userId) {
              console.error('Brak ID użytkownika');
              return;
          }
        
          // Pobierz powiadomienia z IndexedDB
          const db = await initDB();
          const tx = db.transaction('notifications', 'readonly');
          const store = tx.objectStore('notifications');
          const index = store.index('userId');
        
          const request = index.getAll(userId);
        
          request.onsuccess = () => {
              userNotifications = request.result || [];
              displayNotifications();
          };
        
          request.onerror = (event) => {
              console.error('Błąd podczas pobierania powiadomień:', event.target.error);
          };
      } catch (error) {
          console.error('Błąd podczas ładowania powiadomień:', error);
      }
}

// Funkcja do wyświetlania powiadomień
function displayNotifications() {
      const notificationsList = document.getElementById('notifications-list');
      if (!notificationsList) return;
    
      // Wyczyść listę
      notificationsList.innerHTML = '';
    
      if (userNotifications.length === 0) {
          notificationsList.innerHTML = '<p class="no-data">Nie masz jeszcze zdefiniowanych powiadomień. Kliknij "Dodaj nowe powiadomienie", aby utworzyć pierwsze.</p>';
          return;
      }
    
      // Sortuj powiadomienia według daty
      userNotifications.sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));
    
      // Wyświetl każde powiadomienie
      userNotifications.forEach(notification => {
          const notificationItem = document.createElement('div');
          notificationItem.className = 'notification-item';
          notificationItem.style.borderLeft = `4px solid ${notification.color || '#2196F3'}`;
        
          // Formatuj datę
          const notificationDate = new Date(notification.date + ' ' + notification.time);
          const formattedDate = notificationDate.toLocaleDateString('pl-PL');
          const formattedTime = notificationDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        
          // Określ status powtarzania
          const repeatStatus = notification.repeat ? 
              `Powtarzanie: ${getFrequencyName(notification.frequency)}` : 
              'Jednorazowe';
        
          notificationItem.innerHTML = `
              <div class="notification-info">
                  <div class="notification-title">${notification.title}</div>
                  <div class="notification-message">${notification.message}</div>
                  <div class="notification-datetime">${formattedDate}, ${formattedTime}</div>
                  <div class="notification-repeat">${repeatStatus}</div>
              </div>
              <div class="notification-actions">
                  <button class="btn-edit" data-id="${notification._id}">
                      <i class="fas fa-edit"></i> Edytuj
                  </button>
                  <button class="btn-delete" data-id="${notification._id}">
                      <i class="fas fa-trash"></i> Usuń
                  </button>
              </div>
          `;
        
          notificationsList.appendChild(notificationItem);
      });
    
      // Dodaj event listenery do przycisków
      const editButtons = document.querySelectorAll('.notification-actions .btn-edit');
      editButtons.forEach(button => {
          button.addEventListener('click', (e) => {
              const notificationId = parseInt(e.currentTarget.dataset.id);
              editNotification(notificationId);
          });
      });
    
      const deleteButtons = document.querySelectorAll('.notification-actions .btn-delete');
      deleteButtons.forEach(button => {
          button.addEventListener('click', (e) => {
              const notificationId = parseInt(e.currentTarget.dataset.id);
              if (confirm('Czy na pewno chcesz usunąć to powiadomienie?')) {
                  deleteNotification(notificationId);
              }
          });
      });
}

// Funkcja do pokazywania formularza powiadomienia
function showNotificationForm(notificationId = null) {
      // Resetuj formularz
      document.getElementById('notification-form').reset();
    
      // Ustaw domyślną datę na dzisiaj
      const today = new Date();
      document.getElementById('notification-date').valueAsDate = today;
    
      // Ustaw domyślną godzinę na aktualną + 1 godzina
      const nextHour = new Date(today.getTime() + 60 * 60 * 1000);
      const timeString = `${nextHour.getHours().toString().padStart(2, '0')}:${nextHour.getMinutes().toString().padStart(2, '0')}`;
      document.getElementById('notification-time').value = timeString;
    
      // Dodaj obsługę pokazywania/ukrywania opcji powtarzania
      const repeatCheckbox = document.getElementById('notification-repeat');
      const repeatOptions = document.getElementById('repeat-options');
    
      repeatCheckbox.addEventListener('change', function() {
          repeatOptions.style.display = this.checked ? 'block' : 'none';
      });
    
      // Jeśli podano ID powiadomienia, wypełnij formularz danymi
      if (notificationId !== null) {
          const notification = userNotifications.find(n => n._id === notificationId);
          if (notification) {
              document.getElementById('notification-id').value = notification._id;
              document.getElementById('notification-type').value = notification.type;
              document.getElementById('notification-title').value = notification.title;
              document.getElementById('notification-message').value = notification.message;
              document.getElementById('notification-date').value = notification.date;
              document.getElementById('notification-time').value = notification.time;
              document.getElementById('notification-repeat').checked = notification.repeat;
            
              if (notification.repeat) {
                  repeatOptions.style.display = 'block';
                  document.getElementById('notification-frequency').value = notification.frequency;
              } else {
                  repeatOptions.style.display = 'none';
              }
            
              document.getElementById('notification-color').value = notification.color || '#2196F3';
            
              // Zmień tytuł formularza
              document.getElementById('notification-form-title').textContent = 'Edytuj powiadomienie';
            
              // Zapisz ID edytowanego powiadomienia
              editingNotificationId = notificationId;
          }
      } else {
          // Zmień tytuł formularza
          document.getElementById('notification-form-title').textContent = 'Dodaj nowe powiadomienie';
        
          // Resetuj ID edytowanego powiadomienia
          editingNotificationId = null;
      }
    
      // Pokaż modal
      const modal = document.getElementById('notification-form-container');
      modal.classList.add('show');
      modal.removeAttribute('hidden');
}

// Funkcja do ukrywania formularza powiadomienia
function hideNotificationForm() {
      const modal = document.getElementById('notification-form-container');
      modal.classList.remove('show');
      modal.setAttribute('hidden', true);
}

// Funkcja do zapisywania powiadomienia
async function saveNotification(event) {
      event.preventDefault();
    
      try {
          const userId = localStorage.getItem('userId');
          if (!userId) {
              showMessage('error', 'Musisz być zalogowany, aby zapisać powiadomienie');
              return;
          }
        
          const notificationId = document.getElementById('notification-id').value;
          const type = document.getElementById('notification-type').value;
          const title = document.getElementById('notification-title').value;
          const message = document.getElementById('notification-message').value;
          const date = document.getElementById('notification-date').value;
          const time = document.getElementById('notification-time').value;
          const repeat = document.getElementById('notification-repeat').checked;
          const frequency = document.getElementById('notification-frequency').value;
          const color = document.getElementById('notification-color').value;
        
          // Walidacja
          if (!title) {
              showMessage('error', 'Tytuł jest wymagany');
              return;
          }
        
          if (!message) {
              showMessage('error', 'Wiadomość jest wymagana');
              return;
          }
        
          if (!date) {
              showMessage('error', 'Data jest wymagana');
              return;
          }
        
          if (!time) {
              showMessage('error', 'Godzina jest wymagana');
              return;
          }
        
          // Przygotuj obiekt powiadomienia
          const notification = {
              userId: userId,
              type,
              title,
              message,
              date,
              time,
              repeat,
              frequency: repeat ? frequency : null,
              color,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              synced: 0 // Nie zsynchronizowane
          };
        
          // Zapisz w IndexedDB
          const db = await initDB();
          const tx = db.transaction('notifications', 'readwrite');
          const store = tx.objectStore('notifications');
        
          if (editingNotificationId) {
              // Aktualizuj istniejące powiadomienie
              notification._id = parseInt(editingNotificationId);
            
              const request = store.put(notification);
            
              request.onsuccess = () => {
                  // Aktualizuj lokalną tablicę powiadomień
                  const index = userNotifications.findIndex(n => n._id === notification._id);
                  if (index !== -1) {
                      userNotifications[index] = notification;
                  } else {
                      userNotifications.push(notification);
                  }
                
                  showMessage('success', 'Powiadomienie zostało zaktualizowane');
                  hideNotificationForm();
                  displayNotifications();
                
                  // Zaplanuj powiadomienie w systemie
                  scheduleNotification(notification);
              };
            
              request.onerror = (event) => {
                  console.error('Błąd podczas aktualizacji powiadomienia:', event.target.error);
                  showMessage('error', 'Błąd podczas aktualizacji powiadomienia');
              };
          } else {
              // Dodaj nowe powiadomienie
              const request = store.add(notification);
            
              request.onsuccess = () => {
                  // Dodaj do lokalnej tablicy powiadomień
                  notification._id = request.result;
                  userNotifications.push(notification);
                
                  showMessage('success', 'Nowe powiadomienie zostało dodane');
                  hideNotificationForm();
                  displayNotifications();
                
                  // Zaplanuj powiadomienie w systemie
                  scheduleNotification(notification);
              };
            
              request.onerror = (event) => {
                  console.error('Błąd podczas dodawania powiadomienia:', event.target.error);
                  showMessage('error', 'Błąd podczas dodawania powiadomienia');
              };
          }
        
          // Jeśli jesteśmy online, spróbuj zsynchronizować
          if (await isOnline()) {
              try {
                  const syncResult = await syncData();
                  if (syncResult.success) {
                      showMessage('success', 'Dane zostały zsynchronizowane z serwerem');
                  }
              } catch (error) {
                  console.error('Błąd podczas synchronizacji:', error);
              }
          }
      } catch (error) {
          console.error('Błąd podczas zapisywania powiadomienia:', error);
          showMessage('error', `Błąd: ${error.message}`);
      }
}

// Funkcja do edycji powiadomienia
function editNotification(notificationId) {
      showNotificationForm(notificationId);
}

// Funkcja do usuwania powiadomienia
async function deleteNotification(notificationId) {
      try {
          const db = await initDB();
          const tx = db.transaction('notifications', 'readwrite');
          const store = tx.objectStore('notifications');
        
          const request = store.delete(notificationId);
        
          request.onsuccess = () => {
              // Usuń z lokalnej tablicy powiadomień
              userNotifications = userNotifications.filter(n => n._id !== notificationId);
            
              showMessage('success', 'Powiadomienie zostało usunięte');
              displayNotifications();
          };
        
          request.onerror = (event) => {
              console.error('Błąd podczas usuwania powiadomienia:', event.target.error);
              showMessage('error', 'Błąd podczas usuwania powiadomienia');
          };
        
          // Jeśli powiadomienie było zsynchronizowane, dodaj do kolejki usunięć
          const notification = userNotifications.find(n => n._id === notificationId);
          if (notification && notification.synced === 1) {
              await addToDeleteQueue(notificationId, 'notification');
          }
        
          // Jeśli jesteśmy online, spróbuj zsynchronizować
          if (await isOnline()) {
              try {
                  const syncResult = await syncData();
                  if (syncResult.success) {
                      showMessage('success', 'Dane zostały zsynchronizowane z serwerem');
                  }
              } catch (error) {
                  console.error('Błąd podczas synchronizacji:', error);
              }
          }
      } catch (error) {
          console.error('Błąd podczas usuwania powiadomienia:', error);
          showMessage('error', `Błąd: ${error.message}`);
      }
}

// Funkcja do planowania powiadomień
function scheduleNotification(notification) {
      // Sprawdź, czy API Notification jest dostępne
      if (!("Notification" in window)) {
          console.log("Ten przeglądarka nie obsługuje powiadomień");
          return;
      }
    
      // Sprawdź uprawnienia
      if (Notification.permission === "granted") {
          createScheduledNotification(notification);
      } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then(permission => {
              if (permission === "granted") {
                  createScheduledNotification(notification);
              }
          });
      }
}

// Funkcja do tworzenia zaplanowanego powiadomienia
function createScheduledNotification(notification) {
      try {
          // Oblicz czas do powiadomienia
          const notificationTime = new Date(notification.date + 'T' + notification.time);
          const now = new Date();
          const timeUntilNotification = notificationTime - now;
        
          // Jeśli czas już minął, nie planuj powiadomienia
          if (timeUntilNotification <= 0) {
              console.log('Czas powiadomienia już minął');
              return;
          }
        
          // Zaplanuj powiadomienie
          setTimeout(() => {
              const notificationOptions = {
                  body: notification.message,
                  icon: '/images/icons/icon-72x72.png',
                  badge: '/images/icons/icon-72x72.png',
                  tag: `notification-${notification._id}`,
                  data: {
                      notificationId: notification._id,
                      type: notification.type
                  }
              };
            
              // Wyświetl powiadomienie
              const notificationInstance = new Notification(notification.title, notificationOptions);
            
              // Obsługa kliknięcia w powiadomienie
              notificationInstance.onclick = function() {
                  window.focus();
                
                  // Przekieruj do odpowiedniej strony w zależności od typu powiadomienia
                  switch (notification.type) {
                      case 'budget':
                          window.location.href = '/settings.html#budgets';
                          break;
                      case 'payment':
                          window.location.href = '/transactions.html';
                          break;
                      case 'report':
                          window.location.href = '/analytics.html';
                          break;
                      default:
                          window.location.href = '/index.html';
                  }
                
                  this.close();
              };
            
              // Jeśli powiadomienie ma się powtarzać, zaplanuj następne
              if (notification.repeat) {
                  scheduleNextNotification(notification);
              }
          }, timeUntilNotification);
        
          console.log(`Zaplanowano powiadomienie "${notification.title}" na ${notificationTime}`);
      } catch (error) {
          console.error('Błąd podczas planowania powiadomienia:', error);
      }
}

// Funkcja do planowania następnego powiadomienia (dla powtarzających się)
function scheduleNextNotification(notification) {
      try {
          // Oblicz datę następnego powiadomienia
          const currentDate = new Date(notification.date + 'T' + notification.time);
          let nextDate = new Date(currentDate);
        
          switch (notification.frequency) {
              case 'daily':
                  nextDate.setDate(nextDate.getDate() + 1);
                  break;
              case 'weekly':
                  nextDate.setDate(nextDate.getDate() + 7);
                  break;
              case 'monthly':
                  nextDate.setMonth(nextDate.getMonth() + 1);
                  break;
              default:
                  return; // Nieznana częstotliwość
          }
        
          // Utwórz nowe powiadomienie z zaktualizowaną datą
          const nextNotification = {
              ...notification,
              date: nextDate.toISOString().split('T')[0],
              updatedAt: Date.now()
          };
        
          // Zapisz nowe powiadomienie w bazie danych
          saveRepeatedNotification(nextNotification);
      } catch (error) {
          console.error('Błąd podczas planowania następnego powiadomienia:', error);
      }
}

// Funkcja do zapisywania powtarzającego się powiadomienia
async function saveRepeatedNotification(notification) {
      try {
          const db = await initDB();
          const tx = db.transaction('notifications', 'readwrite');
          const store = tx.objectStore('notifications');
        
          // Usuń _id, aby utworzyć nowy rekord
          const { _id, ...newNotification } = notification;
        
          const request = store.add(newNotification);
        
          request.onsuccess = () => {
              console.log(`Zaplanowano następne powiadomienie na ${notification.date}`);
            
              // Odśwież listę powiadomień
              loadNotifications();
          };
        
          request.onerror = (event) => {
              console.error('Błąd podczas zapisywania powtarzającego się powiadomienia:', event.target.error);
          };
      } catch (error) {
          console.error('Błąd podczas zapisywania powtarzającego się powiadomienia:', error);
      }
}

// Pomocnicza funkcja do wyświetlania nazw częstotliwości
function getFrequencyName(frequencyCode) {
      const frequencies = {
          'daily': 'Codziennie',
          'weekly': 'Co tydzień',
          'monthly': 'Co miesiąc'
      };
    
      return frequencies[frequencyCode] || frequencyCode;
}

// Funkcja do ładowania budżetów
async function loadBudgets() {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        console.error('Brak ID użytkownika');
        return;
      }
    
      // Pobierz budżety z IndexedDB
      const db = await initDB();
    
      // Sprawdź, czy obiekt store 'budgets' istnieje
      if (!db.objectStoreNames.contains('budgets')) {
        console.log('Obiekt store "budgets" nie istnieje, pomijam ładowanie budżetów');
        return;
      }
    
      const tx = db.transaction('budgets', 'readonly');
      const store = tx.objectStore('budgets');
      const index = store.index('userId');
    
      const request = index.getAll(userId);
    
      request.onsuccess = () => {
        userBudgets = request.result || [];
        displayBudgets();
      };
    
      request.onerror = (event) => {
        console.error('Błąd podczas pobierania budżetów:', event.target.error);
      };
    } catch (error) {
      console.error('Błąd podczas ładowania budżetów:', error);
    }
}

// Funkcja do wyświetlania budżetów
function displayBudgets() {
    const budgetsList = document.getElementById('budgets-list');
    if (!budgetsList) return;
  
    // Wyczyść listę
    budgetsList.innerHTML = '';
  
    if (userBudgets.length === 0) {
      budgetsList.innerHTML = '<p class="no-data">Nie masz jeszcze zdefiniowanych budżetów. Kliknij "Dodaj nowy budżet", aby utworzyć pierwszy.</p>';
      return;
    }
  
    // Sortuj budżety według kategorii
    userBudgets.sort((a, b) => a.category.localeCompare(b.category));
  
    // Wyświetl każdy budżet
    userBudgets.forEach(budget => {
      const budgetItem = document.createElement('div');
      budgetItem.className = 'budget-item';
      budgetItem.style.borderLeft = `4px solid ${budget.color || '#2196F3'}`;
    
      // Formatuj kwotę
      const amount = new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: localStorage.getItem('userCurrency') || 'PLN'
      }).format(budget.amount);
    
      budgetItem.innerHTML = `
        <div class="budget-info">
          <div class="budget-category">${getCategoryName(budget.category)}</div>
          <div class="budget-amount">${amount}</div>
        </div>
        <div class="budget-actions">
          <button class="btn-edit" data-id="${budget._id}">
            <i class="fas fa-edit"></i> Edytuj
          </button>
          <button class="btn-delete" data-id="${budget._id}">
            <i class="fas fa-trash"></i> Usuń
          </button>
        </div>
      `;
    
      budgetsList.appendChild(budgetItem);
    });
  
    // Dodaj event listenery do przycisków
    const editButtons = document.querySelectorAll('.budget-actions .btn-edit');
    editButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const budgetId = parseInt(e.currentTarget.dataset.id);
        editBudget(budgetId);
      });
    });
  
    const deleteButtons = document.querySelectorAll('.budget-actions .btn-delete');
    deleteButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const budgetId = parseInt(e.currentTarget.dataset.id);
        if (confirm('Czy na pewno chcesz usunąć ten budżet?')) {
          deleteBudget(budgetId);
        }
      });
    });
}

// Funkcja do pokazywania formularza budżetu
function showBudgetForm(budgetId = null) {
    // Resetuj formularz
    document.getElementById('budget-form').reset();
  
    // Jeśli podano ID budżetu, wypełnij formularz danymi
    if (budgetId !== null) {
      const budget = userBudgets.find(b => b._id === budgetId);
      if (budget) {
        document.getElementById('budget-id').value = budget._id;
        document.getElementById('budget-category').value = budget.category;
        document.getElementById('budget-amount').value = budget.amount;
      
        document.getElementById('budget-color').value = budget.color || '#4CAF50';
      
        // Zmień tytuł formularza
        document.getElementById('budget-form-title').textContent = 'Edytuj budżet';
      
        // Zapisz ID edytowanego budżetu
        editingBudgetId = budgetId;
      }
    } else {
      // Zmień tytuł formularza
      document.getElementById('budget-form-title').textContent = 'Dodaj nowy budżet';
    
      // Resetuj ID edytowanego budżetu
      editingBudgetId = null;
    }
  
    // Pokaż modal
    const modal = document.getElementById('budget-form-container');
    modal.classList.add('show');
    modal.removeAttribute('hidden');
}

// Funkcja do ukrywania formularza budżetu
function hideBudgetForm() {
    const modal = document.getElementById('budget-form-container');
    modal.classList.remove('show');
    modal.setAttribute('hidden', true);
}

// Funkcja do zapisywania budżetu
async function saveBudget(event) {
    event.preventDefault();
  
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        showMessage('error', 'Musisz być zalogowany, aby zapisać budżet');
        return;
      }
    
      const budgetId = document.getElementById('budget-id').value;
      const category = document.getElementById('budget-category').value;
      const amount = parseFloat(document.getElementById('budget-amount').value);
      const color = document.getElementById('budget-color').value;
    
      // Walidacja
      if (!category) {
        showMessage('error', 'Kategoria jest wymagana');
        return;
      }
    
      if (isNaN(amount) || amount <= 0) {
        showMessage('error', 'Kwota musi być liczbą większą od zera');
        return;
      }
    
      // Przygotuj obiekt budżetu
      const budget = {
        userId: userId,
        category,
        amount,
        color,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: 0 // Nie zsynchronizowane
      };
    
      // Zapisz w IndexedDB
      const db = await initDB();
    
      // Sprawdź, czy obiekt store 'budgets' istnieje
      if (!db.objectStoreNames.contains('budgets')) {
        showMessage('error', 'Baza danych nie zawiera magazynu budżetów. Odśwież stronę lub wyczyść dane przeglądarki.');
        console.error('Obiekt store "budgets" nie istnieje');
        return;
      }
    
      const tx = db.transaction('budgets', 'readwrite');
      const store = tx.objectStore('budgets');
    
      if (editingBudgetId) {
        // Aktualizuj istniejący budżet
        budget._id = parseInt(editingBudgetId);
      
        const request = store.put(budget);
      
        request.onsuccess = () => {
          // Aktualizuj lokalną tablicę budżetów
          const index = userBudgets.findIndex(b => b._id === budget._id);
          if (index !== -1) {
            userBudgets[index] = budget;
          } else {
            userBudgets.push(budget);
          }
        
          showMessage('success', 'Budżet został zaktualizowany');
          hideBudgetForm();
          displayBudgets();
        };
      
        request.onerror = (event) => {
          console.error('Błąd podczas aktualizacji budżetu:', event.target.error);
          showMessage('error', 'Błąd podczas aktualizacji budżetu');
        };
      } else {
        // Dodaj nowy budżet
        const request = store.add(budget);
      
        request.onsuccess = () => {
          // Dodaj do lokalnej tablicy budżetów
          budget._id = request.result;
          userBudgets.push(budget);
        
          showMessage('success', 'Nowy budżet został dodany');
          hideBudgetForm();
          displayBudgets();
        };
      
        request.onerror = (event) => {
          console.error('Błąd podczas dodawania budżetu:', event.target.error);
          showMessage('error', 'Błąd podczas dodawania budżetu');
        };
      }
    
      // Jeśli jesteśmy online, spróbuj zsynchronizować
      if (await isOnline()) {
        try {
          const syncResult = await syncData();
          if (syncResult.success) {
            showMessage('success', 'Dane zostały zsynchronizowane z serwerem');
          }
        } catch (error) {
          console.error('Błąd podczas synchronizacji:', error);
        }
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania budżetu:', error);
      showMessage('error', `Błąd: ${error.message}`);
    }
}

// Funkcja do edycji budżetu
function editBudget(budgetId) {
    showBudgetForm(budgetId);
}

// Funkcja do usuwania budżetu
async function deleteBudget(budgetId) {
    try {
      const db = await initDB();
      const tx = db.transaction('budgets', 'readwrite');
      const store = tx.objectStore('budgets');
    
      const request = store.delete(budgetId);
    
      request.onsuccess = () => {
        // Usuń z lokalnej tablicy budżetów
        userBudgets = userBudgets.filter(b => b._id !== budgetId);
      
        showMessage('success', 'Budżet został usunięty');
        displayBudgets();
      };
    
      request.onerror = (event) => {
        console.error('Błąd podczas usuwania budżetu:', event.target.error);
        showMessage('error', 'Błąd podczas usuwania budżetu');
      };
    
      // Jeśli budżet był zsynchronizowany, dodaj do kolejki usunięć
      const budget = userBudgets.find(b => b._id === budgetId);
      if (budget && budget.synced === 1) {
        await addToDeleteQueue(budgetId, 'budget');
      }
    
      // Jeśli jesteśmy online, spróbuj zsynchronizować
      if (await isOnline()) {
        try {
          const syncResult = await syncData();
          if (syncResult.success) {
            showMessage('success', 'Dane zostały zsynchronizowane z serwerem');
          }
        } catch (error) {
          console.error('Błąd podczas synchronizacji:', error);
        }
      }
    } catch (error) {
      console.error('Błąd podczas usuwania budżetu:', error);
      showMessage('error', `Błąd: ${error.message}`);
    }
}

// Funkcja do dodawania do kolejki usunięć
async function addToDeleteQueue(itemId, type) {
    try {
      const db = await initDB();
      const tx = db.transaction('deleteQueue', 'readwrite');
      const store = tx.objectStore('deleteQueue');
    
      const request = store.add({
        type,
        itemId,
        timestamp: Date.now()
      });
    
      request.onsuccess = () => {
        console.log(`Dodano ${type} o ID ${itemId} do kolejki usunięć`);
      };
    
      request.onerror = (event) => {
        console.error('Błąd podczas dodawania do kolejki usunięć:', event.target.error);
      };
    } catch (error) {
      console.error('Błąd podczas dodawania do kolejki usunięć:', error);
    }
}

// Funkcja do ustawiania event listenerów
function setupEventListeners() {
    // Obsługa nawigacji w ustawieniach
    const navLinks = document.querySelectorAll('.settings-nav a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = e.currentTarget.dataset.tab;
        switchTab(tabId);
      });
    });
  
    // Obsługa dodawania budżetu
    const addBudgetBtn = document.getElementById('add-budget-btn');
    if (addBudgetBtn) {
      addBudgetBtn.addEventListener('click', () => {
        showBudgetForm();
      });
    }
  
    // Obsługa formularza budżetu
    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) {
      budgetForm.addEventListener('submit', saveBudget);
    }
  
    // Obsługa anulowania formularza budżetu
    const cancelBudgetBtn = document.getElementById('cancel-budget-btn');
    if (cancelBudgetBtn) {
      cancelBudgetBtn.addEventListener('click', hideBudgetForm);
    }
  
    // Obsługa zamykania modalu budżetu
    const closeModal = document.querySelector('.close-modal');
    if (closeModal) {
      closeModal.addEventListener('click', hideBudgetForm);
    }
  
    // Obsługa dodawania powiadomienia
    const addNotificationBtn = document.getElementById('add-notification-btn');
    if (addNotificationBtn) {
      addNotificationBtn.addEventListener('click', () => {
        showNotificationForm();
      });
    }
  
    // Obsługa formularza powiadomienia
    const notificationForm = document.getElementById('notification-form');
    if (notificationForm) {
      notificationForm.addEventListener('submit', saveNotification);
    }
  
    // Obsługa anulowania formularza powiadomienia
    const cancelNotificationBtn = document.getElementById('cancel-notification-btn');
    if (cancelNotificationBtn) {
      cancelNotificationBtn.addEventListener('click', hideNotificationForm);
    }
  
    // Obsługa zamykania modalu powiadomienia
    const closeNotificationModal = document.querySelector('.close-notification-modal');
    if (closeNotificationModal) {
      closeNotificationModal.addEventListener('click', hideNotificationForm);
    }
  
    // Obsługa wylogowania
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        window.location.href = '/login.html';
      });
    }
}

// Funkcja do przełączania zakładek
function switchTab(tabId) {
    // Aktualizuj aktywny link w nawigacji
    const navLinks = document.querySelectorAll('.settings-nav a');
    navLinks.forEach(link => {
      if (link.dataset.tab === tabId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  
    // Aktualizuj aktywną sekcję
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(section => {
      if (section.id === tabId) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });
}

// Funkcja do wyświetlania komunikatów
function showMessage(type, message) {
    // Sprawdź, czy kontener na komunikaty istnieje
    let messageContainer = document.getElementById('message-container');
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'message-container';
      messageContainer.className = 'message-container';
      document.body.appendChild(messageContainer);
    }
  
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

// Funkcja do pobierania nazwy kategorii na podstawie kodu
function getCategoryName(categoryCode) {
    const categories = {
      'food': 'Jedzenie',
      'groceries': 'Zakupy spożywcze',
      'restaurant': 'Restauracje',
      'housing': 'Mieszkanie',
      'rent': 'Czynsz',
      'mortgage': 'Kredyt hipoteczny',
      'utilities': 'Media',
      'electricity': 'Prąd',
      'water': 'Woda',
      'gas': 'Gaz',
      'internet': 'Internet',
      'phone': 'Telefon',
      'transportation': 'Transport',
      'fuel': 'Paliwo',
      'public': 'Transport publiczny',
      'car': 'Samochód',
      'entertainment': 'Rozrywka',
      'movies': 'Kino',
      'games': 'Gry',
      'subscription': 'Subskrypcje',
      'health': 'Zdrowie',
      'doctor': 'Lekarz',
      'pharmacy': 'Apteka',
      'insurance': 'Ubezpieczenie',
      'education': 'Edukacja',
      'books': 'Książki',
      'courses': 'Kursy',
      'shopping': 'Zakupy',
      'clothes': 'Ubrania',
      'electronics': 'Elektronika',
      'gifts': 'Prezenty',
      'travel': 'Podróże',
      'hotel': 'Hotel',
      'flight': 'Lot',
      'vacation': 'Wakacje',
      'personal': 'Osobiste',
      'beauty': 'Uroda',
      'fitness': 'Fitness',
      'other': 'Inne',
      'income': 'Przychód',
      'salary': 'Wynagrodzenie',
      'bonus': 'Premia',
      'investment': 'Inwestycje',
      'savings': 'Oszczędności',
      'debt': 'Zadłużenie',
      'loan': 'Pożyczka',
      'credit': 'Kredyt'
    };
  
    return categories[categoryCode] || categoryCode;
}