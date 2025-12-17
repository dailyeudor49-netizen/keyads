import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  CountryPricing,
  CountryCopyResult,
  FacebookAngle,
  GoogleDemandGen,
  SUPPORTED_COUNTRIES
} from './types';

// Usa API key separata per copy generation (limiti indipendenti)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_COPY_API_KEY || '');

// Token tracker per sessione copy
let copySessionTokens = {
  input: 0,
  output: 0,
  total: 0
};

export function getCopyTokenUsage() {
  return { ...copySessionTokens };
}

export function resetCopyTokenUsage() {
  copySessionTokens = { input: 0, output: 0, total: 0 };
}

function trackCopyTokens(result: any) {
  try {
    const usage = result.response.usageMetadata;
    if (usage) {
      copySessionTokens.input += usage.promptTokenCount || 0;
      copySessionTokens.output += usage.candidatesTokenCount || 0;
      copySessionTokens.total = copySessionTokens.input + copySessionTokens.output;
      console.log(`Copy Tokens: +${usage.promptTokenCount || 0} input, +${usage.candidatesTokenCount || 0} output (totale: ${copySessionTokens.total})`);
    }
  } catch (e) {
    // Ignora errori di tracking
  }
}

// Mappa paese -> lingua per generare copy nella lingua del mercato target
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

function getCountryName(countryCode: string): string {
  const country = SUPPORTED_COUNTRIES.find(c => c.code === countryCode);
  return country?.name || countryCode;
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

// Genera copy pubblicitari per una singola nazione
export async function generateAdCopyForCountry(
  landingContent: string,
  landingTitle: string,
  competitorContent: string | null,
  countryPricing: CountryPricing
): Promise<CountryCopyResult> {
  console.log('Gemini Copy - Generando copy per:', countryPricing.countryCode);

  if (!process.env.GEMINI_COPY_API_KEY) {
    console.error('GEMINI_COPY_API_KEY non configurata!');
    throw new Error('API key per copy generation non configurata');
  }

  const { languageName } = getLanguageForCountry(countryPricing.countryCode);
  const countryName = getCountryName(countryPricing.countryCode);

  // Formatta il prezzo
  const priceDisplay = countryPricing.originalPrice
    ? `${countryPricing.originalPrice} ${countryPricing.currency} -> ${countryPricing.finalPrice} ${countryPricing.currency}`
    : `${countryPricing.finalPrice} ${countryPricing.currency}`;

  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

  // Estrai info prodotto dal contenuto landing (NON dal title che è spesso il nome del sito!)
  const productInfo = landingContent.slice(0, 1500);

  const prompt = `🚨🚨🚨 REGOLA #1: SCRIVI SOLO SUL PRODOTTO FISICO! 🚨🚨🚨

⚠️ PRIMA DI TUTTO: Identifica il PRODOTTO FISICO venduto sulla landing page.
NON è il sito web. NON è l'azienda. È L'OGGETTO FISICO che il cliente riceve a casa.

Esempio: Se la landing vende un "Massaggiatore cervicale", scrivi sul massaggiatore.
NON scrivere: "Scopri il nostro sito", "Benvenuto su [brand]", "I nostri servizi"
SCRIVI: "Massaggiatore cervicale che elimina il dolore", "Rilassa i muscoli in 10 minuti"

🚫 VIETATO ASSOLUTO (per TUTTE le lingue, incluso italiano):
- Parlare del sito web
- Parlare dell'azienda/brand
- Scrivere "scopri", "visita", "benvenuto"
- Frasi generiche che non nominano il prodotto
- Qualsiasi cosa che non riguardi l'OGGETTO FISICO venduto

✅ OBBLIGATORIO (per TUTTE le lingue):
- Nominare il PRODOTTO specifico
- Descrivere cosa FA il prodotto
- Descrivere i BENEFICI del prodotto
- Descrivere quale PROBLEMA risolve

LINGUA: ${languageName.toUpperCase()}
MERCATO: ${countryPricing.countryCode} - ${countryName}
PREZZO: ${countryPricing.finalPrice} ${countryPricing.currency}${countryPricing.originalPrice ? ` (era ${countryPricing.originalPrice} ${countryPricing.currency})` : ''}

RUOLO: Copywriter affiliate marketing COD. Copy aggressivi, linguaggio SEMPLICE e diretto.
📝 GRAMMATICA: Scrivi in ${languageName.toUpperCase()} CORRETTO!

=== LANDING PAGE DEL PRODOTTO ===
${landingTitle}
${landingContent.slice(0, 4500)}
=== FINE ===

${competitorContent ? `COMPETITOR:\n${competitorContent.slice(0, 1500)}` : ''}

=== META ADS PRIMARY TEXT (SCRIVI IN ${languageName.toUpperCase()}!) ===

Struttura OBBLIGATORIA (usa \\n per andare a capo):

1. HOOK forte con emoji (in ${languageName.toUpperCase()}!)
2. Seconda frase (A CAPO dopo l'hook)
3. Riga vuota
4. 4-5 BULLET sul PRODOTTO in COLONNA (uno per riga, ogni bullet inizia con ✅)
5. Riga vuota
6. PREZZO: ❌ ${countryPricing.originalPrice || '99'} ${countryPricing.currency} → ✅ ${countryPricing.finalPrice} ${countryPricing.currency}
7. Riga vuota
8. LOGISTICA su 3 righe separate (TRADUCI in ${languageName.toUpperCase()}!):
   📦 [pagamento alla consegna - TRADOTTO]
   🚚 [spedizione veloce - TRADOTTO]
   ⚡ [scorte limitate - TRADOTTO]
9. Riga vuota
10. CTA finale con 👉 (in ${languageName.toUpperCase()}!)

⚠️ IMPORTANTE: primaryText1 e primaryText2 devono avere STRUTTURA IDENTICA!
- Stessi a capo, stesse sezioni, bullet in COLONNA
- Cambia SOLO le parole/frasi, non la struttura
- TUTTO IN ${languageName.toUpperCase()}!

⛔ VIETATO: timer, countdown, "scade tra X ore", errori grammaticali
✅ OK: urgenza generica tipo "scorte limitate"

=== GOOGLE DEMAND GEN (LINGUA: ${languageName.toUpperCase()}) ===

🚨 OGNI TITOLO/DESCRIZIONE DEVE PARLARE DEL PRODOTTO FISICO! 🚨

Scrivi titoli e descrizioni SUL PRODOTTO in ${languageName.toUpperCase()}:
- Nome del prodotto + beneficio
- Cosa FA fisicamente il prodotto
- Quale problema RISOLVE
- Risultati concreti

LIMITI CARATTERI OBBLIGATORI:
- titles: 5 titoli, MAX 40 caratteri ognuno
- descriptions: 5 descrizioni, MAX 90 caratteri ognuno
- longTitles: 5 titoli video, MAX 90 caratteri ognuno

🚫 VIETATO: nome sito, brand, "scopri", "visita", spedizione, garanzia

=== OUTPUT JSON ===

{
  "landingTakeaways": "Riassunto prodotto in ${languageName}",
  "competitorSnapshot": "Analisi competitor o null",
  "facebookAngles": [
    {
      "angleName": "Nome angle",
      "angleDescription": "Descrizione angle",
      "primaryText1": "🔥 Hook variante A\\nFrase supporto A\\n\\n✅ Bullet 1\\n✅ Bullet 2\\n✅ Bullet 3\\n✅ Bullet 4\\n\\n❌ 99€ → ✅ 49€\\n\\n📦 Pagamento alla consegna\\n🚚 Spedizione 3-5 giorni\\n⚡ Ultimi pezzi\\n\\n👉 Ordina ora",
      "primaryText2": "🔥 Hook variante B\\nFrase supporto B\\n\\n✅ Bullet 1 diverso\\n✅ Bullet 2 diverso\\n✅ Bullet 3 diverso\\n✅ Bullet 4 diverso\\n\\n❌ 99€ → ✅ 49€\\n\\n📦 Pagamento alla consegna\\n🚚 Spedizione 3-5 giorni\\n⚡ Ultimi pezzi\\n\\n👉 Scopri di più",
      "headline": "Headline prodotto",
      "description": "Descrizione beneficio prodotto"
    }
  ],
  "googleDemandGen": {
    "titles": ["Titolo prodotto 1", "Titolo prodotto 2", "Titolo prodotto 3", "Titolo prodotto 4", "Titolo prodotto 5"],
    "descriptions": ["Descrizione prodotto 1", "Descrizione prodotto 2", "Descrizione prodotto 3", "Descrizione prodotto 4", "Descrizione prodotto 5"],
    "longTitles": ["Titolo lungo prodotto 1", "Titolo lungo prodotto 2", "Titolo lungo prodotto 3", "Titolo lungo prodotto 4", "Titolo lungo prodotto 5"]
  }
}

4 ANGLE (tutti sul PRODOTTO):
1. Versatilità PRODOTTO
2. Risparmio con PRODOTTO
3. Problema che PRODOTTO risolve
4. Facilità uso PRODOTTO

🚨🚨🚨 REMINDER FINALE 🚨🚨🚨
1. LINGUA: Scrivi TUTTO in ${languageName.toUpperCase()}
2. PRODOTTO: Ogni singolo copy deve parlare del PRODOTTO FISICO venduto
3. VIETATO: brand, sito, azienda, "scopri", "visita", "benvenuto"
4. Il copy deve far capire COSA È il prodotto e COSA FA

Se non riesci a identificare un prodotto fisico specifico dalla landing, cerca:
- Immagini di prodotti
- Prezzi
- Caratteristiche tecniche
- Benefici descritti

JSON valido.`;

  try {
    console.log('Chiamando Gemini API per copy...');
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    trackCopyTokens(result);
    const response = result.response.text();
    console.log('Risposta Gemini ricevuta, lunghezza:', response.length);

    // Estrai il JSON dalla risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const googleDemandGen = parsed.googleDemandGen || { titles: [], descriptions: [], longTitles: [] };

      // Funzione per rigenerare UN SINGOLO elemento che supera il limite
      const regenerateSingleItem = async (
        type: 'title' | 'description' | 'longTitle',
        currentText: string,
        limit: number
      ): Promise<string> => {
        const typeNames = {
          title: 'titolo breve',
          description: 'descrizione',
          longTitle: 'titolo lungo video'
        };

        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Rigenerazione ${typeNames[type]} (tentativo ${attempt}/3): "${currentText.slice(0, 30)}..." (${currentText.length} char, max ${limit})`);

          const regenPrompt = `Riscrivi questo ${typeNames[type]} in ${languageName.toUpperCase()}.

INFO PRODOTTO (dalla landing page):
${productInfo.slice(0, 800)}

TESTO ATTUALE (${currentText.length} caratteri - TROPPO LUNGO):
"${currentText}"

DEVE essere MASSIMO ${limit} caratteri (spazi inclusi).
Mantieni il focus sul PRODOTTO, accorcia il testo.
⚠️ NON parlare del sito/brand, SOLO del prodotto!

Rispondi SOLO con il nuovo testo, nient'altro.`;

          try {
            const result = await model.generateContent(regenPrompt);
            trackCopyTokens(result);
            let newText = result.response.text().trim();

            // Rimuovi eventuali virgolette
            newText = newText.replace(/^["']|["']$/g, '').trim();

            if (newText && newText.length <= limit) {
              console.log(`✅ Rigenerato: "${newText}" (${newText.length} char)`);
              return newText;
            }
            console.log(`❌ Ancora troppo lungo: ${newText.length} char`);
          } catch (e) {
            console.error('Errore rigenerazione singola:', e);
          }
        }

        // Dopo 3 tentativi falliti, tronca
        console.log(`⚠️ Troncamento forzato dopo 3 tentativi`);
        return currentText.slice(0, limit - 3) + '...';
      };

      // Processa ogni array e rigenera singoli elementi se necessario
      const processArray = async (arr: any[], limit: number, type: 'title' | 'description' | 'longTitle'): Promise<string[]> => {
        if (!Array.isArray(arr)) return [];

        const result: string[] = [];
        for (const item of arr.slice(0, 5)) {
          if (!item || typeof item !== 'string') continue;

          const text = item.trim();
          if (!text) continue;

          if (text.length > limit) {
            // Rigenera questo singolo elemento
            const fixed = await regenerateSingleItem(type, text, limit);
            result.push(fixed);
          } else {
            result.push(text);
          }
        }
        return result;
      };

      // Processa ogni tipo
      console.log('Processando Demand Gen...');
      googleDemandGen.titles = await processArray(googleDemandGen.titles, 40, 'title');
      googleDemandGen.descriptions = await processArray(googleDemandGen.descriptions, 90, 'description');
      googleDemandGen.longTitles = await processArray(googleDemandGen.longTitles, 90, 'longTitle');

      console.log('Demand Gen dopo processamento:', {
        titles: googleDemandGen.titles.length,
        descriptions: googleDemandGen.descriptions.length,
        longTitles: googleDemandGen.longTitles.length
      });

      // Se mancano elementi, genera quelli mancanti
      const generateMissing = async (current: string[], needed: number, type: 'title' | 'description' | 'longTitle', limit: number): Promise<string[]> => {
        if (current.length >= needed) return current;

        const missing = needed - current.length;
        console.log(`Generando ${missing} ${type} mancanti...`);

        const typePrompts = {
          title: `${missing} titoli brevi (max 40 char) sul PRODOTTO venduto`,
          description: `${missing} descrizioni (max 90 char) sui BENEFICI del prodotto`,
          longTitle: `${missing} titoli lunghi per video (max 90 char) sul PRODOTTO`
        };

        const prompt = `Genera ${typePrompts[type]}.

INFO PRODOTTO (dalla landing page):
${productInfo.slice(0, 800)}

LINGUA: ${languageName.toUpperCase()}
⚠️ FOCUS SUL PRODOTTO, non sul sito/brand!
Scrivi cosa FA il prodotto, i benefici, i risultati.

Rispondi SOLO con un array JSON: ["elemento1", "elemento2", ...]`;

        try {
          const result = await model.generateContent(prompt);
          trackCopyTokens(result);
          const response = result.response.text();
          const match = response.match(/\[[\s\S]*\]/);
          if (match) {
            const newItems = JSON.parse(match[0]);
            const processed = await processArray(newItems, limit, type);
            return [...current, ...processed].slice(0, needed);
          }
        } catch (e) {
          console.error('Errore generazione mancanti:', e);
        }
        return current;
      };

      googleDemandGen.titles = await generateMissing(googleDemandGen.titles, 5, 'title', 40);
      googleDemandGen.descriptions = await generateMissing(googleDemandGen.descriptions, 5, 'description', 90);
      googleDemandGen.longTitles = await generateMissing(googleDemandGen.longTitles, 5, 'longTitle', 90);

      console.log('Demand Gen finale:', {
        titles: googleDemandGen.titles,
        descriptions: googleDemandGen.descriptions,
        longTitles: googleDemandGen.longTitles
      });

      return {
        countryCode: countryPricing.countryCode,
        countryName,
        language: languageName,
        currency: countryPricing.currency,
        finalPrice: countryPricing.finalPrice,
        originalPrice: countryPricing.originalPrice,
        landingTakeaways: parsed.landingTakeaways || '',
        competitorSnapshot: parsed.competitorSnapshot || undefined,
        facebookAngles: parsed.facebookAngles || [],
        googleDemandGen
      };
    }

    throw new Error('Nessun JSON valido trovato nella risposta');
  } catch (error) {
    console.error('Errore generazione copy per', countryPricing.countryCode, ':', error);
    throw error;
  }
}

// Genera copy per tutte le nazioni selezionate
export async function generateAdCopyForAllCountries(
  landingContent: string,
  landingTitle: string,
  competitorContent: string | null,
  countries: CountryPricing[]
): Promise<CountryCopyResult[]> {
  const results: CountryCopyResult[] = [];

  // Processa ogni paese sequenzialmente per evitare rate limiting
  for (const countryPricing of countries) {
    try {
      console.log(`Generando copy per ${countryPricing.countryCode}...`);
      const result = await generateAdCopyForCountry(
        landingContent,
        landingTitle,
        competitorContent,
        countryPricing
      );
      results.push(result);

      // Piccola pausa tra le richieste per evitare rate limiting
      if (countries.indexOf(countryPricing) < countries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Errore per ${countryPricing.countryCode}:`, error);
      // Continua con gli altri paesi anche se uno fallisce
      results.push({
        countryCode: countryPricing.countryCode,
        countryName: getCountryName(countryPricing.countryCode),
        language: getLanguageForCountry(countryPricing.countryCode).languageName,
        currency: countryPricing.currency,
        finalPrice: countryPricing.finalPrice,
        originalPrice: countryPricing.originalPrice,
        landingTakeaways: 'Errore nella generazione',
        facebookAngles: [],
        googleDemandGen: { titles: [], descriptions: [], longTitles: [] }
      });
    }
  }

  return results;
}
