import { GoogleGenerativeAI } from '@google/generative-ai';
import { CampaignConfig, KeywordData, ScoredKeyword } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Token tracker per sessione
let sessionTokens = {
  input: 0,
  output: 0,
  total: 0
};

export function getTokenUsage() {
  return { ...sessionTokens };
}

export function resetTokenUsage() {
  sessionTokens = { input: 0, output: 0, total: 0 };
}

function trackTokens(result: any) {
  try {
    const usage = result.response.usageMetadata;
    if (usage) {
      sessionTokens.input += usage.promptTokenCount || 0;
      sessionTokens.output += usage.candidatesTokenCount || 0;
      sessionTokens.total = sessionTokens.input + sessionTokens.output;
      console.log(`Tokens: +${usage.promptTokenCount || 0} input, +${usage.candidatesTokenCount || 0} output (totale: ${sessionTokens.total})`);
    }
  } catch (e) {
    // Ignora errori di tracking
  }
}

// Mappa paese -> lingua per generare keyword nella lingua del mercato target
const COUNTRY_LANGUAGE_MAP: Record<string, { language: string; languageName: string }> = {
  'IT': { language: 'it', languageName: 'italiano' },
  'DE': { language: 'de', languageName: 'tedesco' },
  'FR': { language: 'fr', languageName: 'francese' },
  'ES': { language: 'es', languageName: 'spagnolo' },
  'PT': { language: 'pt', languageName: 'portoghese' },
  'NL': { language: 'nl', languageName: 'olandese' },
  'BE': { language: 'nl', languageName: 'olandese/francese' },
  'AT': { language: 'de', languageName: 'tedesco' },
  'CH': { language: 'de', languageName: 'tedesco' },
  'GB': { language: 'en', languageName: 'inglese' },
  'IE': { language: 'en', languageName: 'inglese' },
  'PL': { language: 'pl', languageName: 'polacco' },
  'CZ': { language: 'cs', languageName: 'ceco' },
  'SK': { language: 'sk', languageName: 'slovacco' },
  'HU': { language: 'hu', languageName: 'ungherese' },
  'RO': { language: 'ro', languageName: 'rumeno' },
  'BG': { language: 'bg', languageName: 'bulgaro' },
  'HR': { language: 'hr', languageName: 'croato' },
  'SI': { language: 'sl', languageName: 'sloveno' },
  'RS': { language: 'sr', languageName: 'serbo' },
  'LT': { language: 'lt', languageName: 'lituano' },
  'LV': { language: 'lv', languageName: 'lettone' },
  'EE': { language: 'et', languageName: 'estone' },
  'SE': { language: 'sv', languageName: 'svedese' },
  'NO': { language: 'no', languageName: 'norvegese' },
  'DK': { language: 'da', languageName: 'danese' },
  'FI': { language: 'fi', languageName: 'finlandese' },
  'GR': { language: 'el', languageName: 'greco' },
  'UA': { language: 'uk', languageName: 'ucraino' },
  'US': { language: 'en', languageName: 'inglese' },
  'CA': { language: 'en', languageName: 'inglese' },
  'AU': { language: 'en', languageName: 'inglese' },
  'BR': { language: 'pt', languageName: 'portoghese' },
  'MX': { language: 'es', languageName: 'spagnolo' },
};

function getLanguageForCountry(countryCode: string): { language: string; languageName: string } {
  return COUNTRY_LANGUAGE_MAP[countryCode] || { language: 'en', languageName: 'inglese' };
}

// Helper per retry con backoff esponenziale
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = error?.status === 503 || error?.status === 429;
      if (!isRetryable || i === maxRetries - 1) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} dopo ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}

export async function extractSeedKeywords(
  pageContent: string,
  pageTitle: string,
  pageDescription: string,
  targetCountry: string = 'IT'
): Promise<string[]> {
  console.log('Gemini - Estrazione keyword...');
  console.log('Titolo:', pageTitle);
  console.log('Contenuto length:', pageContent?.length || 0);
  console.log('Paese target:', targetCountry);

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY non configurata!');
    return [];
  }

  const { languageName } = getLanguageForCountry(targetCountry);

  // Usa gemma-3-4b-it che ha limiti più alti
  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

  const prompt = `Analizza questo contenuto di una pagina web e genera le keyword principali per Google Ads.

TITOLO: ${pageTitle}
DESCRIZIONE: ${pageDescription}
CONTENUTO: ${pageContent.slice(0, 5000)}

MERCATO TARGET: ${targetCountry}
LINGUA KEYWORD: ${languageName}

IMPORTANTE: Le keyword devono essere in ${languageName.toUpperCase()} perché il mercato target è ${targetCountry}.
Anche se il contenuto della pagina è in un'altra lingua, TRADUCI e ADATTA le keyword per il mercato ${targetCountry}.

Regole:
1. Genera 20-30 keyword/frasi chiave rilevanti per la pubblicità IN ${languageName.toUpperCase()}
2. Includi sia keyword generiche che long-tail (3+ parole)
3. Pensa a cosa cercherebbe un potenziale cliente su Google nel mercato ${targetCountry}
4. Includi keyword con intento d'acquisto nella lingua target (es. comprare, prezzo, migliore, offerta, recensioni - tradotti in ${languageName})
5. Evita keyword troppo generiche
6. Usa terminologia e modi di dire comuni nel mercato ${targetCountry}

Rispondi SOLO con un JSON array di stringhe, esempio:
["keyword 1", "keyword 2", "keyword 3"]`;

  try {
    console.log('Chiamando Gemini API...');
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    trackTokens(result);
    const response = result.response.text();
    console.log('Risposta Gemini:', response.slice(0, 200));

    // Estrai il JSON dalla risposta
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const keywords = JSON.parse(jsonMatch[0]);
      console.log('Keywords estratte:', keywords.length);
      return keywords;
    }
    console.log('Nessun JSON trovato nella risposta');
    return [];
  } catch (error) {
    console.error('Errore estrazione keywords:', error);
    return [];
  }
}

export async function generateKeywordVariations(
  seedKeywords: string[],
  country: string,
  productContext: string
): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });
  const { languageName } = getLanguageForCountry(country);

  const prompt = `Genera variazioni e keyword correlate per Google Ads.

SEED KEYWORDS: ${seedKeywords.join(', ')}
PAESE TARGET: ${country}
LINGUA: ${languageName}
CONTESTO PRODOTTO: ${productContext}

IMPORTANTE: Tutte le keyword devono essere in ${languageName.toUpperCase()} per il mercato ${country}.

Genera 50-70 variazioni IN ${languageName.toUpperCase()} includendo:
1. Sinonimi e varianti del prodotto nella lingua target
2. Keyword con intento d'acquisto (comprare, prezzo, offerta, migliore, economico, scontato, recensioni - tradotti in ${languageName})
3. Keyword long-tail specifiche (3-5 parole) in ${languageName}
4. Keyword comparative (vs, confronto, alternativa - nella lingua target)
5. Domande comuni nella lingua target (come, dove, quale, quanto costa)
6. Keyword con brand + categoria

Rispondi SOLO con un JSON array di stringhe in ${languageName}.`;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    trackTokens(result);
    const response = result.response.text();

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error('Errore generazione variazioni:', error);
    return [];
  }
}

export async function estimateKeywordMetrics(
  keywords: string[],
  country: string,
  currency: string
): Promise<KeywordData[]> {
  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

  // Processiamo in batch per non sovraccaricare
  const batchSize = 20;
  const allResults: KeywordData[] = [];

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);

    const prompt = `Stima le metriche Google Ads per queste keyword nel mercato ${country}.

KEYWORDS: ${batch.join(', ')}
VALUTA: ${currency}

Per ogni keyword stima:
- volume: ricerche mensili (numero intero)
- competition: "low", "medium", o "high"
- competitionIndex: indice 0-100
- cpcLow: CPC minimo in ${currency}
- cpcHigh: CPC massimo in ${currency}
- trend: array di 12 numeri (0-100) rappresentando il trend mensile

Rispondi con un JSON array di oggetti. Esempio:
[{
  "keyword": "esempio keyword",
  "volume": 1500,
  "competition": "medium",
  "competitionIndex": 45,
  "cpcLow": 0.30,
  "cpcHigh": 1.20,
  "trend": [50, 55, 60, 58, 62, 70, 75, 72, 68, 65, 60, 55]
}]

IMPORTANTE: Fornisci stime realistiche basate sulla tua conoscenza del mercato ${country}.`;

    try {
      const result = await retryWithBackoff(() => model.generateContent(prompt));
      trackTokens(result);
      const response = result.response.text();

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const withCpcAvg = parsed.map((k: KeywordData) => ({
          ...k,
          cpcAvg: (k.cpcLow + k.cpcHigh) / 2
        }));
        allResults.push(...withCpcAvg);
      }
    } catch (error) {
      console.error('Errore stima metriche batch:', error);
    }
  }

  return allResults;
}

export async function analyzeKeywordProfitability(
  keyword: KeywordData,
  config: CampaignConfig
): Promise<Partial<ScoredKeyword>> {
  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

  const prompt = `Analizza la profittabilità di questa keyword per una campagna Google Ads.

KEYWORD: ${keyword.keyword}
METRICHE:
- Volume: ${keyword.volume} ricerche/mese
- CPC medio: ${keyword.cpcAvg} ${config.currency}
- Competizione: ${keyword.competition} (${keyword.competitionIndex}/100)
- Trend: ${keyword.trend.join(', ')}

CONFIGURAZIONE CAMPAGNA:
- Obiettivo: ${config.goal}
- Tipo: ${config.type}
- Prezzo prodotto: ${config.productPrice} ${config.currency}
- Paese: ${config.country}

Considera:
1. Se obiettivo è "conversions": priorità a ROI e CPA sostenibile
2. Se obiettivo è "traffic": priorità a CPC basso e volume alto
3. Se obiettivo è "awareness": priorità a volume e reach
4. Se obiettivo è "engagement": priorità a rilevanza e intent

Rispondi con un JSON:
{
  "profitabilityScore": <0-100>,
  "roiEstimate": <percentuale stimata>,
  "stabilityScore": <0-100 basato sul trend>,
  "recommendationLevel": "eccellente" | "buona" | "moderata" | "scarsa",
  "reasoning": "<spiegazione breve in italiano>"
}`;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    trackTokens(result);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Errore analisi profittabilità:', error);
  }

  return {
    profitabilityScore: 50,
    roiEstimate: 0,
    stabilityScore: 50,
    recommendationLevel: 'moderata',
    reasoning: 'Analisi non disponibile'
  };
}
