import { KeywordData } from './types';

const GOOGLE_ADS_API_VERSION = 'v18';

interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
}

// Ottiene un nuovo access token dal refresh token
async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Errore refresh token: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

// Ottiene la lista degli account Google Ads accessibili
export async function getAccessibleCustomers(config: Omit<GoogleAdsConfig, 'customerId'>): Promise<string[]> {
  const accessToken = await getAccessToken({ ...config, customerId: '' });

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
      },
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Errore lista clienti: ${data.error.message}`);
  }

  // Estrae gli ID dai resource names (formato: "customers/1234567890")
  return (data.resourceNames || []).map((name: string) => name.replace('customers/', ''));
}

// Genera idee keyword da URL
export async function generateKeywordIdeasFromUrl(
  config: GoogleAdsConfig,
  url: string,
  countryCode: string,
  languageCode: string = 'it'
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(config);

  // Mappa codici paese a geo target constants
  const geoTargets: Record<string, string> = {
    // Europa Occidentale
    'IT': '2380', 'DE': '2276', 'FR': '2250', 'ES': '2724',
    'PT': '2620', 'NL': '2528', 'BE': '2056', 'AT': '2040',
    'CH': '2756', 'GB': '2826', 'IE': '2372',
    // Europa Nord-Est
    'PL': '2616', 'CZ': '2203', 'SK': '2703', 'HU': '2348',
    'RO': '2642', 'BG': '2100', 'HR': '2191', 'SI': '2705', 'RS': '2688',
    // Baltici
    'LT': '2440', 'LV': '2428', 'EE': '2233',
    // Scandinavia
    'SE': '2752', 'NO': '2578', 'DK': '2208', 'FI': '2246',
    // Altri Europa
    'GR': '2300', 'UA': '2804',
    // Altri continenti
    'US': '2840', 'CA': '2124', 'AU': '2036', 'BR': '2076', 'MX': '2484',
  };

  // Mappa codici lingua
  const languageTargets: Record<string, string> = {
    'it': '1004', // Italiano
    'en': '1000', // Inglese
    'de': '1001', // Tedesco
    'fr': '1002', // Francese
    'es': '1003', // Spagnolo
    'pt': '1014', // Portoghese
  };

  const geoTarget = geoTargets[countryCode] || '2380';
  const languageTarget = languageTargets[languageCode] || '1004';

  const requestBody = {
    urlSeed: {
      url: url
    },
    geoTargetConstants: [`geoTargetConstants/${geoTarget}`],
    language: `languageConstants/${languageTarget}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false
  };

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:generateKeywordIdeas`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Errore keyword ideas: ${data.error.message}`);
  }

  return parseKeywordResults(data.results || []);
}

// Genera idee keyword da seed keywords
export async function generateKeywordIdeasFromSeeds(
  config: GoogleAdsConfig,
  keywords: string[],
  countryCode: string,
  languageCode: string = 'it'
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(config);

  const geoTargets: Record<string, string> = {
    'IT': '2380', 'DE': '2276', 'FR': '2250', 'ES': '2724',
    'PT': '2620', 'NL': '2528', 'BE': '2056', 'AT': '2040',
    'CH': '2756', 'GB': '2826', 'IE': '2372',
    'PL': '2616', 'CZ': '2203', 'SK': '2703', 'HU': '2348',
    'RO': '2642', 'BG': '2100', 'HR': '2191', 'SI': '2705', 'RS': '2688',
    'LT': '2440', 'LV': '2428', 'EE': '2233',
    'SE': '2752', 'NO': '2578', 'DK': '2208', 'FI': '2246',
    'GR': '2300', 'UA': '2804',
    'US': '2840', 'CA': '2124', 'AU': '2036', 'BR': '2076', 'MX': '2484',
  };

  const languageTargets: Record<string, string> = {
    'it': '1004', 'en': '1000', 'de': '1001', 'fr': '1002',
    'es': '1003', 'pt': '1014', 'pl': '1030', 'cs': '1021',
    'hu': '1024', 'ro': '1032', 'bg': '1020', 'uk': '1036',
    'sv': '1035', 'no': '1029', 'da': '1009', 'fi': '1011',
    'nl': '1010', 'el': '1022', 'hr': '1039', 'sk': '1033',
    'sl': '1034', 'lt': '1026', 'lv': '1028', 'et': '1012', 'sr': '1035',
  };

  const geoTarget = geoTargets[countryCode] || '2380';
  const languageTarget = languageTargets[languageCode] || '1004';

  const requestBody = {
    keywordSeed: {
      keywords: keywords.slice(0, 20) // Max 20 keywords per richiesta
    },
    geoTargetConstants: [`geoTargetConstants/${geoTarget}`],
    language: `languageConstants/${languageTarget}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false
  };

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:generateKeywordIdeas`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Errore keyword ideas: ${data.error.message}`);
  }

  return parseKeywordResults(data.results || []);
}

// Ottiene metriche storiche per keyword specifiche
export async function getKeywordHistoricalMetrics(
  config: GoogleAdsConfig,
  keywords: string[],
  countryCode: string,
  languageCode: string = 'it'
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(config);

  const geoTargets: Record<string, string> = {
    'IT': '2380', 'US': '2840', 'GB': '2826', 'DE': '2276',
    'FR': '2250', 'ES': '2724', 'BR': '2076', 'MX': '2484',
    'AU': '2036', 'CA': '2124',
  };

  const languageTargets: Record<string, string> = {
    'it': '1004', 'en': '1000', 'de': '1001', 'fr': '1002',
    'es': '1003', 'pt': '1014',
  };

  const geoTarget = geoTargets[countryCode] || '2380';
  const languageTarget = languageTargets[languageCode] || '1004';

  const requestBody = {
    keywords: keywords,
    geoTargetConstants: [`geoTargetConstants/${geoTarget}`],
    language: `languageConstants/${languageTarget}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
  };

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:generateKeywordHistoricalMetrics`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Errore historical metrics: ${data.error.message}`);
  }

  return parseKeywordResults(data.results || []);
}

// Parsing dei risultati Google Ads
function parseKeywordResults(results: any[]): KeywordData[] {
  return results.map(result => {
    const metrics = result.keywordIdeaMetrics || {};
    const keyword = result.text || result.keyword || '';

    // Estrai il volume - può essere avgMonthlySearches o monthlySearchVolume
    let volume = 0;
    if (metrics.avgMonthlySearches) {
      volume = parseInt(metrics.avgMonthlySearches) || 0;
    } else if (metrics.monthlySearchVolumes && metrics.monthlySearchVolumes.length > 0) {
      // Media degli ultimi mesi
      const volumes = metrics.monthlySearchVolumes.map((m: any) => parseInt(m.monthlySearches) || 0);
      volume = Math.round(volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length);
    }

    // Competizione
    const competitionValue = metrics.competition || 'UNSPECIFIED';
    const competition: 'low' | 'medium' | 'high' = competitionValue === 'HIGH' ? 'high' :
      competitionValue === 'MEDIUM' ? 'medium' : 'low';

    const competitionIndex = metrics.competitionIndex ||
      (competition === 'high' ? 75 : competition === 'medium' ? 50 : 25);

    // CPC
    const cpcLowMicros = parseInt(metrics.lowTopOfPageBidMicros) || 0;
    const cpcHighMicros = parseInt(metrics.highTopOfPageBidMicros) || 0;
    const cpcLow = cpcLowMicros / 1000000;
    const cpcHigh = cpcHighMicros / 1000000;
    const cpcAvg = (cpcLow + cpcHigh) / 2;

    // Trend mensile (ultimi 12 mesi)
    let trend: number[] = [];
    if (metrics.monthlySearchVolumes && metrics.monthlySearchVolumes.length > 0) {
      trend = metrics.monthlySearchVolumes
        .slice(-12)
        .map((m: any) => {
          const vol = parseInt(m.monthlySearches) || 0;
          // Normalizza a 0-100 basato sul volume max
          return vol;
        });

      // Normalizza il trend
      const maxTrend = Math.max(...trend, 1);
      trend = trend.map(t => Math.round((t / maxTrend) * 100));
    } else {
      // Trend piatto se non disponibile
      trend = Array(12).fill(50);
    }

    return {
      keyword,
      volume,
      competition,
      competitionIndex,
      cpcLow,
      cpcHigh,
      cpcAvg,
      trend
    };
  }).filter(k => k.keyword && k.volume > 0);
}

// Verifica se le credenziali Google Ads sono configurate
export function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

// Ottiene la configurazione dalle variabili d'ambiente
export function getGoogleAdsConfig(): GoogleAdsConfig | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return null;
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customerId: customerId.replace(/-/g, '') // Rimuovi trattini dal customer ID
  };
}
