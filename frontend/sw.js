// Service Worker do obsługi trybu offline w aplikacji PWA

const CACHE_NAME = 'fintrack-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/transactions.html',
  '/analytics.html',
  '/css/style.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/transactions.js',
  '/js/app.js',
  '/js/notifications.js',
  '/manifest.json'
];

// Instalacja Service Workera i cachowanie plików statycznych
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Otwarto cache');
        // Używamy map, aby móc pominąć pliki, które nie istnieją
        return Promise.all(
          ASSETS_TO_CACHE.map(url => {
            return cache.add(url).catch(error => {
              console.warn('Nie można dodać do cache:', url, error);
            });
          })
        );
      })
  );
});

// Aktywacja Service Workera i usunięcie starych cache'ów
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Usuwam stary cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Przechwytywanie zapytań sieciowych
self.addEventListener('fetch', (event) => {
  // Sprawdź, czy zapytanie jest do zewnętrznego API
  const url = new URL(event.request.url);
  
  // Jeśli zapytanie jest kierowane do backendu (localhost:3000), nie przechwytuj go
  if (url.hostname === 'localhost' && url.port === '3000') {
    // Pozwól zapytaniu przejść bez ingerencji Service Workera
    return;
  }
  
  // Obsługa zapytań API
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // W przypadku zapytań API i offline, zwróć błąd
          return new Response(
            JSON.stringify({ error: 'Jesteś w trybie offline. Ta operacja wymaga połączenia z internetem.' }), 
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Strategia Cache First dla zasobów statycznych
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Jeśli zasób jest w cache, zwróć go
        if (response) {
          return response;
        }
        
        // Jeśli nie ma w cache, spróbuj pobrać z sieci
        return fetch(event.request)
          .then((networkResponse) => {
            // Jeśli response jest prawidłowy, dodaj do cache'u
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Jeśli nie ma w cache i nie ma internetu, sprawdź czy jest to HTML
            if (event.request.headers.get('accept').includes('text/html')) {
              // Zwróć stronę offline
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Obsługa synchronizacji w tle
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

// Obsługa powiadomień push
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Nowe powiadomienie',
      icon: '/images/icons/icon-192x192.png',
      badge: '/images/icons/badge-72x72.png',
      vibrate: [100, 50, 100],
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'FinTrack', options)
    );
  }
});

// Obsługa kliknięcia w powiadomienie
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Sprawdź, czy jest już otwarte okno
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Jeśli nie ma otwartego okna, otwórz nowe
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Funkcja do synchronizacji transakcji w tle
function syncTransactions() {
  return self.clients.matchAll()
    .then((clients) => {
      if (clients && clients.length) {
        // Wywołaj funkcję synchronizacji w oknie klienta
        return clients[0].postMessage({
          type: 'SYNC_TRANSACTIONS'
        });
      }
    });
}
