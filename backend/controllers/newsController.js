const axios = require('axios');

// Pobieranie newsów finansowych
exports.getFinancialNews = async (req, res) => {
  try {
    const ALPHA_VANTAGE_KEY = "WMQB26Z8JG14PFIP";
    
    // Próba pobrania danych z zewnętrznego API
    let articles = [];
    let isExternalApiSuccess = false;
    
    try {
      const response = await axios.get(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&apikey=${ALPHA_VANTAGE_KEY}`);
      
      // Sprawdź, czy odpowiedź zawiera oczekiwane dane
      if (response.data && response.data.feed) {
        // Przekształć dane z Alpha Vantage na nasz format
        articles = response.data.feed
          .slice(0, 3) // Pobierz tylko 3 najnowsze artykuły
          .map(item => {
            // Bezpieczne parsowanie daty
            let dateObj;
            try {
              // Format daty z Alpha Vantage to zazwyczaj: YYYYMMDDTHHMMSS
              // Musimy go przekształcić na format ISO: YYYY-MM-DDTHH:MM:SS
              if (item.time_published) {
                const timeStr = item.time_published;
                // Sprawdź, czy data jest już w formacie ISO
                if (timeStr.includes('-') && timeStr.includes(':')) {
                  dateObj = new Date(timeStr);
                } else {
                  // Jeśli nie, spróbuj przekształcić format Alpha Vantage
                  const year = timeStr.substring(0, 4);
                  const month = timeStr.substring(4, 6);
                  const day = timeStr.substring(6, 8);
                  const hour = timeStr.substring(9, 11) || '00';
                  const minute = timeStr.substring(11, 13) || '00';
                  const second = timeStr.substring(13, 15) || '00';
                  
                  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
                  dateObj = new Date(isoString);
                }
              } else {
                // Jeśli brak daty, użyj aktualnej
                dateObj = new Date();
              }
            } catch (e) {
              console.error('Error parsing date:', e, item.time_published);
              dateObj = new Date(); // Użyj aktualnej daty jako fallback
            }
            
            return {
              title: item.title,
              description: item.summary,
              date: dateObj.toISOString(), // Teraz powinno być bezpieczne
              source: item.source,
              url: item.url
            };
          });
        isExternalApiSuccess = true;
      }
    } catch (apiError) {
      console.error('Error fetching from external API:', apiError);
      // Kontynuuj z przykładowymi danymi
    }
    
    // Jeśli nie udało się pobrać danych z zewnętrznego API, użyj przykładowych danych
    if (!isExternalApiSuccess) {
      // Utwórz przykładowe daty w prawidłowym formacie
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      articles = [
        {
          title: 'Wzrost inflacji w strefie euro',
          description: 'Według najnowszych danych Eurostatu, inflacja w strefie euro wzrosła do 2.5% w porównaniu do poprzedniego miesiąca.',
          date: today.toISOString(),
          source: 'Financial Times',
          url: 'https://www.ft.com'
        },
        {
          title: 'Nowe regulacje bankowe wchodzą w życie',
          description: 'Od przyszłego miesiąca banki będą musiały stosować się do nowych regulacji dotyczących kapitału rezerwowego.',
          date: yesterday.toISOString(),
          source: 'Wall Street Journal',
          url: 'https://www.wsj.com'
        },
        {
          title: 'Bitcoin przekroczył 60 000 USD',
          description: 'Najpopularniejsza kryptowaluta świata ponownie przekroczyła barierę 60 000 USD po okresie spadków.',
          date: twoDaysAgo.toISOString(),
          source: 'Bloomberg',
          url: 'https://www.bloomberg.com'
        }
      ];
    }
    
    // Zwróć dane w odpowiednim formacie
    res.json({ 
      articles,
      timestamp: Date.now(),
      source: isExternalApiSuccess ? 'Alpha Vantage API' : 'Sample Data'
    });
  } catch (error) {
    console.error('Error fetching financial news:', error);
    res.status(500).json({ 
      message: 'Błąd pobierania newsów finansowych', 
      error: error.message 
    });
  }
};