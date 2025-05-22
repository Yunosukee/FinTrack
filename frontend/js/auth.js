import { syncData } from './api.js';
import { initDB } from './db.js';

// Stałe API - zmień na pełny URL do backendu
const API_URL = 'http://localhost:3000/api';

// Obsługa przełączania między zakładkami logowania i rejestracji
document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // Aktualizacja aktywnych klas dla przycisków
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Aktualizacja aktywnych klas dla zawartości zakładek
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabId}-tab`) {
          content.classList.add('active');
        }
      });
    });
  });
  
  // Sprawdzenie stanu połączenia
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Sprawdzenie, czy użytkownik jest już zalogowany
  checkLoginStatus();
  
  // Obsługa formularza logowania
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Obsługa formularza rejestracji
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
});


// Ulepszona funkcja do sprawdzania stanu połączenia
export let isOnline = async function() {
  try {
    // Ping do Google z parametrem zapobiegającym cachowaniu
    const response = await fetch('https://www.google.com/generate_204', {
      mode: 'no-cors',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    return true;
  } catch (error) {
    console.log('Brak połączenia z internetem');
    return false;
  }
}

// Funkcja walidująca adres email
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Sprawdzenie stanu online/offline
function updateOnlineStatus() {
  const offlineNotice = document.getElementById('offline-notice');
  
  isOnline().then(online => {
    if (!online && offlineNotice) {
      offlineNotice.style.display = 'block';
    } else if (offlineNotice) {
      offlineNotice.style.display = 'none';
      
      // Jeśli byliśmy offline, a teraz jesteśmy online, spróbuj synchronizować
      if (localStorage.getItem('offlineMode') === 'true') {
        localStorage.removeItem('offlineMode');
        
        // Sprawdź czy użytkownik jest zalogowany
        if (checkLoginStatus()) {
          syncData().then(result => {
            if (result.success) {
              console.log('Dane zostały pomyślnie zsynchronizowane po powrocie online');
            }
          }).catch(error => {
            console.error('Błąd synchronizacji po powrocie online:', error);
          });
        }
      }
    }
  });
}

// Sprawdzenie statusu logowania
export function checkLoginStatus() {
  const authToken = localStorage.getItem('authToken');
  const userId = localStorage.getItem('userId');
  const lastLogin = localStorage.getItem('lastLogin');
  
  // Sprawdź, czy token nie wygasł (np. 24 godziny)
  const tokenExpired = lastLogin && (Date.now() - parseInt(lastLogin, 10) > 24 * 60 * 60 * 1000);
  
  if (tokenExpired) {
    // Wyloguj użytkownika, jeśli token wygasł
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('offlineMode');
    localStorage.removeItem('lastLogin');
    
    // Przekieruj do strony logowania jeśli nie jesteśmy już na niej
    if (!window.location.pathname.includes('login.html') && 
        !window.location.pathname.includes('register.html')) {
      window.location.href = '/login.html';
    }
    return false;
  }
  
  if (authToken && userId) {
    // Użytkownik jest zalogowany
    return true;
  } else if (userId && localStorage.getItem('offlineMode') === 'true') {
    // Użytkownik jest zalogowany w trybie offline
    return true;
  }
  
  // Użytkownik nie jest zalogowany
  return false;
}

// Funkcje pomocnicze
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 3000);
}

// Obsługa logowania
async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  // Walidacja danych wejściowych
  if (!validateEmail(email)) {
    showError('login-error', 'Podaj poprawny adres e-mail');
    return;
  }
  
  if (!password || password.length < 6) {
    showError('login-error', 'Hasło musi mieć co najmniej 6 znaków');
    return;
  }
  
  try {
    // Sprawdź, czy jesteśmy online
    const online = await isOnline();
    
    if (online) {
      // Logowanie online przez API
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Błąd logowania');
      }
      
      const data = await response.json();
      
      // Zapisz token i dane użytkownika
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userEmail', data.user.email);
      localStorage.setItem('lastLogin', Date.now());
      
      // Pobierz dane offline
      await syncData();
      
      // Przekieruj na stronę główną
      window.location.href = 'index.html';
    } else {
      // Offline login - sprawdź dane w lokalnej bazie
      await handleOfflineLogin(email, password);
    }
  } catch (error) {
    console.error('Błąd logowania:', error);
    showError('login-error', error.message || 'Wystąpił problem podczas logowania');
  }
}

// Obsługa logowania offline
async function handleOfflineLogin(email, password) {
  try {
    const db = await initDB();
    const tx = db.transaction('users', 'readonly');
    const store = tx.objectStore('users');
    const index = store.index('email');
    
    return new Promise((resolve, reject) => {
      const request = index.get(email);
      
      request.onsuccess = () => {
        const user = request.result;
        
        if (!user) {
          showError('login-error', 'Nie możesz się zalogować offline, jeśli wcześniej nie logowałeś się online');
          reject(new Error('Użytkownik nie istnieje w trybie offline'));
          return;
        }
        
        // W prawdziwej aplikacji powinno być bezpieczne porównanie hashy, ale dla uproszczenia:
        if (user.hashedPassword === hashPassword(password)) {
          // Zaloguj użytkownika
          localStorage.setItem('userId', user.id);
          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('offlineMode', 'true');
          localStorage.setItem('lastLogin', Date.now());
          
          window.location.href = '/index.html';
          resolve(user);
        } else {
          showError('login-error', 'Nieprawidłowe hasło');
          reject(new Error('Nieprawidłowe hasło'));
        }
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Błąd logowania offline:', error);
    throw error;
  }
}

// Funkcja symulująca haszowanie hasła (w prawdziwej aplikacji użyj bcrypt lub podobnego)
function hashPassword(password) {
  // To nie jest bezpieczne haszowanie - tylko dla celów demonstracyjnych!
  return btoa(password);
}

// Obsługa rejestracji
async function handleRegister(event) {
  event.preventDefault();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-password-confirm').value;
  
  // Walidacja danych wejściowych
  if (!validateEmail(email)) {
    showError('register-error', 'Podaj poprawny adres e-mail');
    return;
  }
  
  if (!password || password.length < 6) {
    showError('register-error', 'Hasło musi mieć co najmniej 6 znaków');
    return;
  }
  
  if (password !== confirmPassword) {
    showError('register-error', 'Hasła nie są identyczne');
    return;
  }
  
  try {
    // Rejestracja wymaga połączenia z internetem
    const online = await isOnline();
    
    if (!online) {
      showError('register-error', 'Rejestracja wymaga połączenia z internetem');
      return;
    }
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Błąd rejestracji');
    }
    
    const data = await response.json();
    
    // Zapisz dane użytkownika lokalnie
    const db = await initDB();
    const tx = db.transaction('users', 'readwrite');
    const store = tx.objectStore('users');
    
    const user = {
      id: data.user.id,
      email: data.user.email,
      hashedPassword: hashPassword(password),
      createdAt: Date.now()
    };
    
    await new Promise((resolve, reject) => {
      const request = store.add(user);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Pokaż komunikat o sukcesie
    alert('Rejestracja zakończona sukcesem. Możesz się teraz zalogować.');
    
    // Przełącz na zakładkę logowania
    document.querySelector('[data-tab="login"]').click();
  } catch (error) {
    console.error('Błąd rejestracji:', error);
    showError('register-error', error.message || 'Wystąpił problem podczas rejestracji');
  }
}

// Funkcja do wylogowania
function handleLogout() {
  // Wyczyść dane logowania
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('offlineMode');
  
  // Przekieruj na stronę logowania
  window.location.href = '/login.html';
}