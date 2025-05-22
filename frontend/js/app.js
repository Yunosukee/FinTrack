import { checkBudgetAlerts, generatePaymentReminders, updateNotificationBadge } from './notifications.js';
import { initDB, getRecentTransactions, getCurrentBalance } from './db.js';
import { getFinancialNews } from './api.js';
import { isOnline } from './auth.js';
// Główny plik aplikacji FinTrack

// Bazowy URL API
const API_URL = 'http://localhost:3000/api';

// Inicjalizacja aplikacji
document.addEventListener('DOMContentLoaded', async () => {
    // Sprawdź stan połączenia i aktualizuj wskaźnik
    updateOfflineIndicator();
    
    // Nasłuchuj na zmiany stanu połączenia
    window.addEventListener('online', updateOfflineIndicator);
    window.addEventListener('offline', updateOfflineIndicator);
    
    // Sprawdź, czy użytkownik jest zalogowany
    const isLoggedIn = await checkUserSession();
    
    if (isLoggedIn) {
        // Załaduj dane użytkownika
        await loadUserData();
        
        // Załaduj transakcje
        await loadTransactions();
        
        // Załaduj newsy finansowe
        await loadFinancialNews();
        
        // Sprawdź alerty budżetowe
        // const userId = localStorage.getItem('userId');
        // if (userId) {
        //     await checkBudgetAlerts(userId);
        //     await generatePaymentReminders(userId);
        //     await updateNotificationBadge(userId);
        // }
        
    } else {
        // Przekieruj do strony logowania
        window.location.href = 'login.html';
    }
});

// Funkcja do aktualizacji wskaźnika trybu offline
function updateOfflineIndicator() {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (!offlineIndicator) return;
    
    if (isOnline()) {
        offlineIndicator.style.display = 'none';
    } else {
        offlineIndicator.style.display = 'block';
    }
}

// Funkcja do sprawdzania sesji użytkownika
async function checkUserSession() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return false;
        }
        
        // Sprawdź, czy token jest ważny
        // W trybie offline, zakładamy, że token jest ważny
        if (!await isOnline()) {
            return true;
        }
        
        // W trybie online, weryfikuj token na serwerze
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return response.ok;
    } catch (error) {
        console.error('Błąd podczas sprawdzania sesji:', error);
        // W przypadku błędu, zakładamy, że użytkownik jest zalogowany
        // jeśli ma token w localStorage
        return !!localStorage.getItem('authToken');
    }
}

// Funkcja do ładowania danych użytkownika
async function loadUserData() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            return;
        }
        
        // Zamiast używać userDB, możemy użyć localStorage lub innego źródła danych
        const userName = localStorage.getItem('userName') || 'Użytkownik';
        const userEmail = localStorage.getItem('userEmail');
        
        // Aktualizuj interfejs
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = userName || userEmail;
        }
        
        // Pobierz i wyświetl saldo użytkownika
        const balanceResult = await getCurrentBalance();
        
        const balanceElement = document.getElementById('current-balance');
        if (balanceElement && balanceResult.success) {
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
            
            // Jeśli są niezesynchronizowane transakcje, dodaj informację
            if (Math.abs(balanceResult.offlineBalance) > 0.001) {
                const offlineInfo = document.createElement('div');
                offlineInfo.className = 'offline-balance-info';
                offlineInfo.textContent = `(w tym niezesynchronizowane: ${balanceResult.offlineBalance.toFixed(2)} zł)`;
                
                // Usuń poprzednią informację, jeśli istnieje
                const existingInfo = balanceElement.querySelector('.offline-balance-info');
                if (existingInfo) {
                    existingInfo.remove();
                }
                
                balanceElement.appendChild(offlineInfo);
            }
        }
    } catch (error) {
        console.error('Błąd podczas ładowania danych użytkownika:', error);
    }
}

// Funkcja do ładowania transakcji
async function loadTransactions() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            return;
        }
        
        // Pobierz ostatnie transakcje
        const transactions = await getRecentTransactions(userId);
        
        // Aktualizuj saldo
        //updateBalance(transactions);
        
        // Wyświetl transakcje
        displayTransactions(transactions);
    } catch (error) {
        console.error('Błąd podczas ładowania transakcji:', error);
    }
}

// Funkcja do aktualizacji salda
async function updateBalance(transactions) {
    try {
        const balanceElement = document.getElementById('current-balance');
        if (!balanceElement) {
            return;
        }
        
        // Pobierz ustawienia użytkownika
        const db = await initDB();
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const userSettings = await store.get('userSettings');
        
        // Domyślna waluta
        const baseCurrency = userSettings?.value?.baseCurrency || 'PLN';
        
        // Oblicz saldo
        let balance = 0;
        
        for (const transaction of transactions) {
            // Przelicz kwotę na walutę bazową, jeśli potrzeba
            let amount = transaction.amount;
            
            if (transaction.currency && transaction.currency !== baseCurrency) {
                amount = await convertCurrency(
                    transaction.amount,
                    transaction.currency,
                    baseCurrency
                );
            }
            
            if (transaction.type === 'income') {
                balance += amount;
            } else {
                balance -= amount;
            }
        }
        
        // Wyświetl saldo
        balanceElement.textContent = `${balance.toFixed(2)} ${baseCurrency}`;
        
        // Dodaj klasę w zależności od salda
        if (balance < 0) {
            balanceElement.classList.add('negative');
            balanceElement.classList.remove('positive');
        } else {
            balanceElement.classList.add('positive');
            balanceElement.classList.remove('negative');
        }
    } catch (error) {
        console.error('Błąd podczas aktualizacji salda:', error);
    }
}

// Funkcja do wyświetlania transakcji
function displayTransactions(transactions) {
    const transactionsList = document.getElementById('transactions-list');
    if (!transactionsList) {
        return;
    }
    
    // Wyczyść listę
    transactionsList.innerHTML = '';
    
    // Sortuj transakcje od najnowszej stworzonej do najstarszej
    const sortedTransactions = [...transactions].sort((a, b) => {
        // Konwertuj stringi createdAt na obiekty Date
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        
        // Sortuj malejąco (od najnowszej do najstarszej)
        return dateB - dateA;
    });

    // Ogranicz do 5 najnowszych
    const recentTransactions = sortedTransactions.slice(0, 5);
    
    // Wyświetl transakcje
    if (recentTransactions.length === 0) {
        const noTransactions = document.getElementById('no-transactions');
        if (noTransactions) {
            noTransactions.hidden = false;
        } else {
            transactionsList.innerHTML = '<tr><td colspan="4" class="no-data">Brak transakcji</td></tr>';
        }
        return;
    }
    
    // Ukryj komunikat o braku transakcji, jeśli istnieje
    const noTransactions = document.getElementById('no-transactions');
    if (noTransactions) {
        noTransactions.hidden = true;
    }
    
    for (const transaction of recentTransactions) {
        const row = document.createElement('tr');
        row.className = `transaction-row ${transaction.type}`;
        
        const date = new Date(transaction.date);
        const formattedDate = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
        
        row.innerHTML = `
            <td class="transaction-date">${formattedDate}</td>
            <td class="transaction-category">${transaction.category}</td>
            <td class="transaction-description">${transaction.description || '-'}</td>
            <td class="transaction-amount ${transaction.type}">
                ${transaction.type === 'expense' ? '-' : '+'}${transaction.amount}
                <span class="transaction-currency">${transaction.currency || 'PLN'}</span>
            </td>
        `;
        
        transactionsList.appendChild(row);
    }
}

// Funkcja do ładowania newsów finansowych
async function loadFinancialNews() {
    try {
        const newsContainer = document.getElementById('news-container');
        if (!newsContainer) {
            return;
        }
        
        // Pobierz newsy
        const newsData = await getFinancialNews();
        
        // Wyświetl informację o trybie offline
        const offlineMessage = newsContainer.querySelector('.offline-message');
        if (offlineMessage) {
            offlineMessage.hidden = !newsData.isOffline;
        }
        
        // Wyczyść kontener (oprócz komunikatu offline)
        const newsItems = newsContainer.querySelectorAll('.news-item');
        newsItems.forEach(item => item.remove());
        
        // Wyświetl newsy
        if (newsData.articles.length === 0) {
            const noNewsElement = document.createElement('p');
            noNewsElement.className = 'no-data';
            noNewsElement.textContent = 'Brak aktualności finansowych';
            newsContainer.appendChild(noNewsElement);
            return;
        }
        
        for (const news of newsData.articles) {
            const newsElement = document.createElement('div');
            newsElement.className = 'news-item';
            
            // Poprawne formatowanie daty
            let formattedDate = 'Brak daty';
            try {
                const date = new Date(news.date);
                if (!isNaN(date.getTime())) {
                    formattedDate = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
                }
            } catch (e) {
                console.error('Error formatting date:', e);
            }
            
            newsElement.innerHTML = `
                <h3><a href="${news.url || '#'}" target="_blank" rel="noopener noreferrer">${news.title}</a></h3>
                <p>${news.description}</p>
                <div class="news-meta">
                    <span class="news-date">${formattedDate}</span>
                    <span class="news-source">${news.source}</span>
                </div>
            `;
            
            newsContainer.appendChild(newsElement);
        }
    } catch (error) {
        console.error('Błąd podczas ładowania newsów finansowych:', error);
    }
}

// Obsługa wylogowania
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                // Wyczyść dane użytkownika
                await window.security.clearUserData();
                
                // Przekieruj do strony logowania
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Błąd podczas wylogowywania:', error);
                alert('Wystąpił błąd podczas wylogowywania');
            }
        });
    }
});
