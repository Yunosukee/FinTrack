// Funkcje do tworzenia i zarządzania wykresami dla strony analityki
import { getRecentTransactions, getCurrentBalance } from './db.js';
import { isOnline } from './auth.js';

// Globalne zmienne dla strony analityki
let charts = {};
let currentPeriod = 'month'; // Domyślny okres to bieżący miesiąc

// Inicjalizacja strony analitycznej
export async function initAnalyticsPage() {
    console.log('Inicjalizacja strony analitycznej...');
    
    // Ustaw domyślną datę jako dzisiejszą dla filtrów niestandardowych
    setDefaultDates();
    
    // Dodaj event listenery
    setupEventListeners();
    
    // Pobierz transakcje i analizuj je
    await loadAndAnalyzeTransactions();
}

// Ustawienie event listenerów
function setupEventListeners() {
    console.log('Konfiguracja event listenerów...');
    
    // Obsługa zmiany okresu
    const periodSelect = document.getElementById('period-select');
    if (periodSelect) {
        periodSelect.addEventListener('change', handlePeriodChange);
    }
    
    // Obsługa przycisku stosowania filtru daty
    const applyDateFilterBtn = document.getElementById('apply-date-filter');
    if (applyDateFilterBtn) {
        applyDateFilterBtn.addEventListener('click', applyDateFilter);
    }
}

// Ustaw domyślne daty dla filtrów niestandardowych
function setDefaultDates() {
    console.log('Ustawianie domyślnych dat...');
    const today = new Date();
    
    // Ustaw datę "do" na dzisiaj
    const dateTo = document.getElementById('date-to');
    if (dateTo) {
        dateTo.value = today.toISOString().slice(0, 10);
    }
    
    // Ustaw datę "od" na pierwszy dzień bieżącego miesiąca
    const dateFrom = document.getElementById('date-from');
    if (dateFrom) {
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        dateFrom.value = firstDayOfMonth.toISOString().slice(0, 10);
    }
}

// Obsługa zmiany okresu
function handlePeriodChange() {
    console.log('Zmiana okresu...');
    const periodSelect = document.getElementById('period-select');
    const customRange = document.getElementById('custom-range');
    
    if (periodSelect) {
        currentPeriod = periodSelect.value;
        
        if (currentPeriod === 'custom') {
            if (customRange) customRange.removeAttribute('hidden');
        } else {
            if (customRange) customRange.setAttribute('hidden', true);
            // Automatycznie zastosuj wybrany okres
            applyDateFilter();
        }
    }
}

// Zastosuj filtr daty i przeanalizuj dane
async function applyDateFilter() {
    console.log('Stosowanie filtru daty...');
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            console.error('Brak ID użytkownika');
            return;
        }
        
        let startDate, endDate;
        const today = new Date();
        
        if (currentPeriod === 'custom') {
            // Użyj niestandardowego zakresu dat
            const dateFromInput = document.getElementById('date-from');
            const dateToInput = document.getElementById('date-to');
            
            if (dateFromInput && dateFromInput.value) {
                startDate = new Date(dateFromInput.value);
                startDate.setHours(0, 0, 0, 0);
            } else {
                // Jeśli nie podano daty początkowej, użyj pierwszego dnia bieżącego miesiąca
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            }
            
            if (dateToInput && dateToInput.value) {
                endDate = new Date(dateToInput.value);
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Jeśli nie podano daty końcowej, użyj dzisiejszej
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            }
        } else {
            // Użyj predefiniowanego zakresu
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            
            switch (currentPeriod) {
                case 'month':
                    // Bieżący miesiąc
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    break;
                case 'quarter':
                    // Bieżący kwartał
                    const quarter = Math.floor(today.getMonth() / 3);
                    startDate = new Date(today.getFullYear(), quarter * 3, 1);
                    break;
                case 'year':
                    // Bieżący rok
                    startDate = new Date(today.getFullYear(), 0, 1);
                    break;
                default:
                    // Domyślnie - bieżący miesiąc
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            }
        }
        
        console.log(`Zakres dat: ${startDate.toISOString()} - ${endDate.toISOString()}`);
        
        // Pobierz transakcje z ostatniego roku (maksymalny zakres)
        const allTransactions = await getRecentTransactions(parseInt(userId), 365);
        
        // Filtruj transakcje na podstawie daty
        const filteredTransactions = allTransactions.filter(transaction => {
            const transactionDate = new Date(transaction.date);
            return transactionDate >= startDate && transactionDate <= endDate;
        });
        
        console.log(`Znaleziono ${filteredTransactions.length} transakcji w wybranym okresie`);
        
        // Analizuj dane i aktualizuj interfejs
        analyzeTransactions(filteredTransactions);
    } catch (error) {
        console.error('Błąd podczas stosowania filtru daty:', error);
    }
}

// Pobierz transakcje i analizuj je
async function loadAndAnalyzeTransactions() {
    console.log('Ładowanie i analiza transakcji...');
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            console.error('Brak ID użytkownika');
            return;
        }
        
        // Zastosuj domyślny filtr (bieżący miesiąc)
        await applyDateFilter();
    } catch (error) {
        console.error('Błąd podczas ładowania transakcji:', error);
    }
}

// Analiza transakcji i aktualizacja interfejsu
function analyzeTransactions(transactions) {
    console.log('Analiza transakcji...');
    
    // Oblicz sumy dla przychodów i wydatków
    let totalIncome = 0;
    let totalExpense = 0;
    
    // Słownik do przechowywania wydatków według kategorii
    const expensesByCategory = {};
    
    // Dane do analizy miesięcznej
    const monthlyData = {};
    
    transactions.forEach(transaction => {
        const amount = parseFloat(transaction.amount);
        
        if (transaction.type === 'income') {
            totalIncome += amount;
        } else if (transaction.type === 'expense') {
            totalExpense += amount;
            
            // Dodaj do słownika kategorii
            if (!expensesByCategory[transaction.category]) {
                expensesByCategory[transaction.category] = 0;
            }
            expensesByCategory[transaction.category] += amount;
        }
        
        // Dodaj do analizy miesięcznej
        const date = new Date(transaction.date);
        const yearMonth = `${date.getFullYear()}-${date.getMonth() + 1}`;
        
        if (!monthlyData[yearMonth]) {
            monthlyData[yearMonth] = {
                income: 0,
                expense: 0
            };
        }
        
        if (transaction.type === 'income') {
            monthlyData[yearMonth].income += amount;
        } else if (transaction.type === 'expense') {
            monthlyData[yearMonth].expense += amount;
        }
    });
    
    // Oblicz saldo
    const balance = totalIncome - totalExpense;
    
    // Aktualizuj interfejs - karty podsumowania
    updateSummaryCards(totalIncome, totalExpense, balance);
    
    // Aktualizuj wykresy
    updateCategoryChart(expensesByCategory);
    updateMonthlyTrendsChart(monthlyData);
    
    // Analiza budżetowa (uproszczona - bez faktycznego limitu budżetowego)
    updateBudgetAnalysis(expensesByCategory);
}

// Aktualizacja kart podsumowania
function updateSummaryCards(totalIncome, totalExpense, balance) {
    console.log('Aktualizacja kart podsumowania...');
    
    // Format waluty
    const formatCurrency = new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    });
    
    // Aktualizuj przychody
    const incomeElement = document.getElementById('total-income');
    if (incomeElement) {
        incomeElement.textContent = formatCurrency.format(totalIncome);
    }
    
    // Aktualizuj wydatki
    const expenseElement = document.getElementById('total-expense');
    if (expenseElement) {
        expenseElement.textContent = formatCurrency.format(totalExpense);
    }
    
    // Aktualizuj saldo
    const balanceElement = document.getElementById('balance');
    if (balanceElement) {
        balanceElement.textContent = formatCurrency.format(balance);
        
        // Zmień kolor w zależności od salda
        if (balance < 0) {
            balanceElement.classList.add('negative');
            balanceElement.classList.remove('positive');
        } else {
            balanceElement.classList.add('positive');
            balanceElement.classList.remove('negative');
        }
    }
}

// Aktualizacja wykresu kategorii
function updateCategoryChart(expensesByCategory) {
    console.log('Aktualizacja wykresu kategorii...');
    const ctx = document.getElementById('expenses-by-category');
    if (!ctx) {
        console.error('Nie znaleziono elementu canvas dla wykresu kategorii');
        return;
    }
    
    // Przygotuj dane do wykresu
    const categories = Object.keys(expensesByCategory);
    const amounts = Object.values(expensesByCategory);
    const categoryNames = categories.map(getCategoryName);
    
    // Kolory dla różnych kategorii
    const backgroundColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#8ACA2B', '#EA5F89', '#7B68EE', '#00BFFF'
    ];
    
    // Usuń poprzedni wykres, jeśli istnieje
    if (charts.categoryChart) {
        charts.categoryChart.destroy();
    }
    
    if (categories.length === 0) {
        // Brak danych do wyświetlenia
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    // Stwórz nowy wykres
    charts.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categoryNames,
            datasets: [{
                data: amounts,
                backgroundColor: backgroundColors.slice(0, categories.length),
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            },
            maintainAspectRatio: false
        }
    });
}

// Aktualizacja wykresu trendów miesięcznych
function updateMonthlyTrendsChart(monthlyData) {
    console.log('Aktualizacja wykresu trendów miesięcznych...');
    const ctx = document.getElementById('monthly-trends');
    if (!ctx) {
        console.error('Nie znaleziono elementu canvas dla wykresu trendów');
        return;
    }
    
    // Posortuj dane według miesięcy
    const sortedMonths = Object.keys(monthlyData).sort();
    
    // Przygotuj dane do wykresu
    const labels = sortedMonths.map(formatMonthLabel);
    const incomeData = sortedMonths.map(month => monthlyData[month].income);
    const expenseData = sortedMonths.map(month => monthlyData[month].expense);
    
    // Usuń poprzedni wykres, jeśli istnieje
    if (charts.monthlyChart) {
        charts.monthlyChart.destroy();
    }
    
    if (sortedMonths.length === 0) {
        // Brak danych do wyświetlenia
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    // Stwórz nowy wykres
    charts.monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Przychody',
                    data: incomeData,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Wydatki',
                    data: expenseData,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            maintainAspectRatio: false
        }
    });
}

// Aktualizacja analizy budżetu
function updateBudgetAnalysis(expensesByCategory) {
    console.log('Aktualizacja analizy budżetu...');
    const budgetList = document.getElementById('budget-list');
    if (!budgetList) {
        console.error('Nie znaleziono elementu dla listy budżetu');
        return;
    }
    
    // Wyczyść aktualną listę
    budgetList.innerHTML = '';
    
    // Domyślne limity budżetowe dla demonstracji
    // W rzeczywistej aplikacji byłyby one ustawiane przez użytkownika
    const defaultBudgets = {
        'food': 1000,
        'transport': 500,
        'entertainment': 300,
        'housing': 1500,
        'utilities': 600,
        'health': 400,
        'education': 300,
        'shopping': 500,
        'other': 300
    };
    
    // Dodaj wiersz dla każdej kategorii wydatków
    Object.keys(expensesByCategory).forEach(category => {
        const expense = expensesByCategory[category];
        const budget = defaultBudgets[category] || 1000; // Domyślny budżet
        const remaining = budget - expense;
        const usage = (expense / budget) * 100;
        
        const row = document.createElement('tr');
        
        // Ustaw kolor tła w zależności od wykorzystania budżetu
        if (usage > 100) {
            row.className = 'budget-exceeded';
        } else if (usage > 80) {
            row.className = 'budget-warning';
        }
        
        row.innerHTML = `
            <td>${getCategoryName(category)}</td>
            <td>${formatCurrency(budget)}</td>
            <td>${formatCurrency(expense)}</td>
            <td>${formatCurrency(remaining)}</td>
            <td>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${Math.min(usage, 100)}%"></div>
                </div>
                ${usage.toFixed(1)}%
            </td>
        `;
        
        budgetList.appendChild(row);
    });
    
    // Jeśli nie ma żadnych kategorii wydatków, wyświetl komunikat
    if (Object.keys(expensesByCategory).length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="5" class="no-data">Brak danych o wydatkach w wybranym okresie</td>';
        budgetList.appendChild(emptyRow);
    }
}

// Formatowanie etykiety miesiąca
function formatMonthLabel(yearMonth) {
    const [year, month] = yearMonth.split('-');
    const date = new Date(year, month - 1, 1);
    
    return date.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' });
}

// Formatowanie waluty
function formatCurrency(value) {
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    }).format(value);
}

// Pomocnicza funkcja do wyświetlania nazw kategorii
function getCategoryName(categoryCode) {
    const categories = {
        // Wydatki
        'food': 'Jedzenie',
        'transport': 'Transport',
        'entertainment': 'Rozrywka',
        'housing': 'Mieszkanie',
        'utilities': 'Rachunki',
        'health': 'Zdrowie',
        'education': 'Edukacja',
        'shopping': 'Zakupy',
        'other': 'Inne wydatki',
        
        // Przychody
        'salary': 'Wynagrodzenie',
        'business': 'Działalność gospodarcza',
        'gift': 'Prezent',
        'investment': 'Inwestycje',
        'rental': 'Wynajem',
        'other_income': 'Inne przychody'
    };
    
    return categories[categoryCode] || categoryCode;
}

// Funkcja do sprawdzania, czy wykres Chart.js jest dostępny
function isChartJsAvailable() {
    return typeof Chart !== 'undefined';
}

// Funkcja do wyświetlania komunikatu o błędzie, jeśli Chart.js nie jest dostępny
function showChartJsError() {
    const chartContainers = document.querySelectorAll('.chart-wrapper');
    chartContainers.forEach(container => {
        container.innerHTML = '<div class="error-message">Nie można załadować biblioteki wykresów. Sprawdź połączenie z internetem.</div>';
    });
}

// Dodatkowa funkcja do obsługi błędów podczas ładowania danych
function handleDataLoadError(error) {
    console.error('Błąd podczas ładowania danych:', error);
    
    // Wyświetl komunikat o błędzie w interfejsie
    const main = document.querySelector('main');
    if (main) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Wystąpił błąd podczas ładowania danych. Spróbuj odświeżyć stronę.';
        
        // Dodaj przycisk odświeżania
        const refreshButton = document.createElement('button');
        refreshButton.className = 'btn';
        refreshButton.textContent = 'Odśwież stronę';
        refreshButton.addEventListener('click', () => {
            window.location.reload();
        });
        
        errorMessage.appendChild(document.createElement('br'));
        errorMessage.appendChild(refreshButton);
        
        // Dodaj na początku main
        main.insertBefore(errorMessage, main.firstChild);
    }
}