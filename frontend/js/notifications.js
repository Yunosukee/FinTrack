import { initDB } from './db.js';

// System powiadomień dla aplikacji FinTrack
// Funkcja do rejestracji powiadomień push
async function registerPushNotifications() {
    if (!('Notification' in window)) {
        console.log('Ten przeglądarka nie obsługuje powiadomień');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

// Funkcja do tworzenia powiadomienia
async function createNotification(title, options = {}) {
    if (!('Notification' in window)) {
        return false;
    }

    if (Notification.permission !== 'granted') {
        const permission = await registerPushNotifications();
        if (!permission) {
            return false;
        }
    }

    // Domyślne opcje
    const defaultOptions = {
        icon: '/images/icons/icon-192x192.png',
        badge: '/images/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfCreation: Date.now(),
            primaryKey: 1
        }
    };

    // Połącz opcje
    const notificationOptions = { ...defaultOptions, ...options };

    // Utwórz powiadomienie
    const notification = new Notification(title, notificationOptions);

    // Obsługa kliknięcia
    notification.onclick = function(event) {
        event.preventDefault();
        if (notificationOptions.data && notificationOptions.data.url) {
            window.open(notificationOptions.data.url, '_blank');
        } else {
            window.focus();
        }
        notification.close();
    };

    return true;
}

// Funkcja do zapisywania powiadomienia w IndexedDB
async function saveNotification(notification) {
    try {
        const db = await initDB();
        const tx = db.transaction('notifications', 'readwrite');
        const store = tx.objectStore('notifications');

        return new Promise((resolve, reject) => {
            const request = store.add(notification);

            request.onsuccess = () => {
                resolve({ success: true, id: request.result });
            };

            request.onerror = () => {
                reject({ success: false, error: request.error });
            };
        });
    } catch (error) {
        console.error('Błąd podczas zapisywania powiadomienia:', error);
        return { success: false, error };
    }
}

// Funkcja do pobierania nieprzeczytanych powiadomień
async function getUnreadNotifications(userId) {
    try {
        const db = await initDB();
        const tx = db.transaction('notifications', 'readonly');
        const store = tx.objectStore('notifications');
        const index = store.index('userId');

        return new Promise((resolve, reject) => {
            const request = index.getAll(userId);

            request.onsuccess = () => {
                const notifications = request.result;
                const unreadNotifications = notifications.filter(notification => !notification.read);
                resolve(unreadNotifications);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('Błąd podczas pobierania powiadomień:', error);
        throw error;
    }
}

// Funkcja do oznaczania powiadomienia jako przeczytane
async function markNotificationAsRead(id) {
    try {
        const db = await initDB();
        const tx = db.transaction('notifications', 'readwrite');
        const store = tx.objectStore('notifications');

        return new Promise((resolve, reject) => {
            const request = store.get(id);

            request.onsuccess = () => {
                const notification = request.result;
                if (!notification) {
                    reject('Powiadomienie nie istnieje');
                    return;
                }

                notification.read = true;
                const updateRequest = store.put(notification);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = () => {
                    reject(updateRequest.error);
                };
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('Błąd podczas oznaczania powiadomienia jako przeczytane:', error);
        throw error;
    }
}

// Funkcja do sprawdzania przekroczenia budżetu
export async function checkBudgetAlerts(userId) {
    try {
        const db = await initDB();
        
        // Pobierz budżety użytkownika
        const budgets = await budgetDB.getAllForUser(userId);
        
        // Pobierz transakcje z bieżącego miesiąca
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const transactions = await transactionDB.getByDateRange(userId, startDate, endDate);
        
        // Sprawdź każdy budżet
        for (const budget of budgets) {
            if (budget.month !== currentMonth) {
                continue;
            }
            
            // Oblicz sumę wydatków dla danej kategorii
            const categoryTransactions = transactions.filter(
                t => t.type === 'expense' && t.category === budget.category
            );
            
            let totalSpent = 0;
            for (const transaction of categoryTransactions) {
                // Jeśli waluta transakcji jest inna niż waluta budżetu, przelicz
                if (transaction.currency !== budget.currency) {
                    const convertedAmount = await convertCurrency(
                        transaction.amount,
                        transaction.currency,
                        budget.currency
                    );
                    totalSpent += convertedAmount;
                } else {
                    totalSpent += transaction.amount;
                }
            }
            
            // Sprawdź, czy przekroczono budżet
            const budgetAmount = budget.amount;
            const percentUsed = (totalSpent / budgetAmount) * 100;
            
            // Alerty przy różnych progach
            if (percentUsed >= 100 && !budget.alertSent100) {
                // Przekroczono budżet
                await createNotification(
                    'Przekroczono budżet!',
                    {
                        body: `Przekroczono budżet dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                        data: {
                            type: 'budget_alert',
                            category: budget.category,
                            severity: 'critical'
                        }
                    }
                );
                
                // Zapisz powiadomienie w bazie
                await saveNotification({
                    userId,
                    type: 'budget_alert',
                    title: 'Przekroczono budżet!',
                    message: `Przekroczono budżet dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                    date: new Date(),
                    read: false,
                    severity: 'critical'
                });
                
                // Oznacz, że alert został wysłany
                budget.alertSent100 = true;
                await budgetDB.update(budget);
            } else if (percentUsed >= 90 && !budget.alertSent90) {
                // Zbliżamy się do limitu
                await createNotification(
                    'Uwaga! Zbliżasz się do limitu budżetu',
                    {
                        body: `Wykorzystano 90% budżetu dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                        data: {
                            type: 'budget_alert',
                            category: budget.category,
                            severity: 'warning'
                        }
                    }
                );
                
                // Zapisz powiadomienie w bazie
                await saveNotification({
                    userId,
                    type: 'budget_alert',
                    title: 'Uwaga! Zbliżasz się do limitu budżetu',
                    message: `Wykorzystano 90% budżetu dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                    date: new Date(),
                    read: false,
                    severity: 'warning'
                });
                
                // Oznacz, że alert został wysłany
                budget.alertSent90 = true;
                await budgetDB.update(budget);
            } else if (percentUsed >= 75 && !budget.alertSent75) {
                // Informacja o wykorzystaniu 3/4 budżetu
                await createNotification(
                    'Informacja o budżecie',
                    {
                        body: `Wykorzystano 75% budżetu dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                        data: {
                            type: 'budget_alert',
                            category: budget.category,
                            severity: 'info'
                        }
                    }
                );
                
                // Zapisz powiadomienie w bazie
                await saveNotification({
                    userId,
                    type: 'budget_alert',
                    title: 'Informacja o budżecie',
                    message: `Wykorzystano 75% budżetu dla kategorii ${budget.category}. Wydano ${totalSpent.toFixed(2)} ${budget.currency} z ${budgetAmount.toFixed(2)} ${budget.currency}.`,
                    date: new Date(),
                    read: false,
                    severity: 'info'
                });
                
                // Oznacz, że alert został wysłany
                budget.alertSent75 = true;
                await budgetDB.update(budget);
            }
        }
    } catch (error) {
        console.error('Błąd podczas sprawdzania alertów budżetowych:', error);
    }
}

// Funkcja do generowania przypomnień o płatnościach
export async function generatePaymentReminders(userId) {
    try {
        // W rzeczywistej aplikacji, pobieralibyśmy zaplanowane płatności z bazy danych
        // Tutaj symulujemy przypomnienie
        const now = new Date();
        const dayOfMonth = now.getDate();
        
        // Przykładowe przypomnienie na 1. dzień miesiąca
        if (dayOfMonth === 1) {
            await createNotification(
                'Przypomnienie o płatnościach',
                {
                    body: 'Dziś jest pierwszy dzień miesiąca. Pamiętaj o opłaceniu rachunków.',
                    data: {
                        type: 'payment_reminder',
                        severity: 'info'
                    }
                }
            );
            
            // Zapisz powiadomienie w bazie
            await saveNotification({
                userId,
                type: 'payment_reminder',
                title: 'Przypomnienie o płatnościach',
                message: 'Dziś jest pierwszy dzień miesiąca. Pamiętaj o opłaceniu rachunków.',
                date: new Date(),
                read: false,
                severity: 'info'
            });
        }
    } catch (error) {
        console.error('Błąd podczas generowania przypomnień o płatnościach:', error);
    }
}

// Funkcja do aktualizacji licznika nieprzeczytanych powiadomień
export async function updateNotificationBadge(userId) {
    try {
        const unreadNotifications = await getUnreadNotifications(userId);
        const badgeElement = document.getElementById('notification-badge');
        
        if (badgeElement) {
            if (unreadNotifications.length > 0) {
                badgeElement.textContent = unreadNotifications.length;
                badgeElement.style.display = 'flex';
            } else {
                badgeElement.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Błąd podczas aktualizacji licznika powiadomień:', error);
    }
}