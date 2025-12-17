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

  const prompt = `🌍🌍🌍 OUTPUT LANGUAGE: ${languageName.toUpperCase()} 🌍🌍🌍
ALL generated text MUST be in ${languageName.toUpperCase()}!
${languageName !== 'italiano' ? `DO NOT write in Italian! Write in ${languageName.toUpperCase()} only!` : ''}

MARKET: ${countryPricing.countryCode} - ${countryName}
PRICE: ${countryPricing.finalPrice} ${countryPricing.currency}${countryPricing.originalPrice ? ` (was ${countryPricing.originalPrice} ${countryPricing.currency})` : ''}

🚨 RULE #1: Write ONLY about the PHYSICAL PRODUCT! 🚨

Identify the PHYSICAL PRODUCT sold on the landing page.
NOT the website. NOT the company. The PHYSICAL OBJECT the customer receives.

🚫 FORBIDDEN:
- Website/brand/company mentions
- Generic phrases not about the product

✅ REQUIRED:
- Name the specific PRODUCT
- Describe what the product DOES
- Describe BENEFITS
- Describe what PROBLEM it solves

ROLE: Affiliate marketing copywriter. Aggressive copy, SIMPLE language.
📝 Write in ${languageName.toUpperCase()} with correct grammar!

=== LANDING PAGE CONTENT ===
${landingContent.slice(0, 4500)}
=== END CONTENT ===

${competitorContent ? `COMPETITOR:\n${competitorContent.slice(0, 1500)}` : ''}

=== META ADS PRIMARY TEXT (WRITE IN ${languageName.toUpperCase()}!) ===

REQUIRED STRUCTURE (use \\n for line breaks):

1. Strong HOOK with emoji
2. Support sentence (NEW LINE after hook)
3. Empty line
4. 4-5 BULLETS about PRODUCT in COLUMN (one per line, each starts with ✅)
5. Empty line
6. PRICE: ❌ ${countryPricing.originalPrice || '99'} ${countryPricing.currency} → ✅ ${countryPricing.finalPrice} ${countryPricing.currency}
7. Empty line
8. LOGISTICS on 3 separate lines (TRANSLATE to ${languageName.toUpperCase()}!):
   📦 [cash on delivery]
   🚚 [fast shipping]
   ⚡ [limited stock]
9. Empty line
10. Final CTA with 👉

⚠️ IMPORTANT: primaryText1 and primaryText2 must have IDENTICAL STRUCTURE!
- Same line breaks, same sections, bullets in COLUMN
- Change ONLY the words/phrases, not the structure
- ALL IN ${languageName.toUpperCase()}!

⛔ FORBIDDEN: timer, countdown, "expires in X hours"
✅ OK: generic urgency like "limited stock"

=== GOOGLE DEMAND GEN (LANGUAGE: ${languageName.toUpperCase()}) ===

🚨 EVERY TITLE/DESCRIPTION MUST BE ABOUT THE PHYSICAL PRODUCT! 🚨

Write titles and descriptions ABOUT THE PRODUCT in ${languageName.toUpperCase()}:
- Product name + benefit
- What the product DOES physically
- What problem it SOLVES
- Concrete results

CHARACTER LIMITS (MANDATORY):
- titles: 5 titles, MAX 40 characters each
- descriptions: 5 descriptions, MAX 90 characters each
- longTitles: 5 video titles, MAX 90 characters each

🚫 FORBIDDEN: site name, brand, shipping, warranty

=== OUTPUT JSON ===

{
  "landingTakeaways": "[Product summary in ${languageName.toUpperCase()}]",
  "competitorSnapshot": "[Competitor analysis or null]",
  "facebookAngles": [
    {
      "angleName": "[Angle name in ${languageName.toUpperCase()}]",
      "angleDescription": "[Angle description in ${languageName.toUpperCase()}]",
      "primaryText1": "🔥 [Hook A in ${languageName.toUpperCase()}]\\n[Support A]\\n\\n✅ [Bullet 1]\\n✅ [Bullet 2]\\n✅ [Bullet 3]\\n✅ [Bullet 4]\\n\\n❌ 99€ → ✅ 49€\\n\\n📦 [COD in ${languageName.toUpperCase()}]\\n🚚 [Shipping in ${languageName.toUpperCase()}]\\n⚡ [Urgency in ${languageName.toUpperCase()}]\\n\\n👉 [CTA in ${languageName.toUpperCase()}]",
      "primaryText2": "🔥 [Hook B in ${languageName.toUpperCase()}]\\n[Support B]\\n\\n✅ [Different bullet 1]\\n✅ [Different bullet 2]\\n✅ [Different bullet 3]\\n✅ [Different bullet 4]\\n\\n❌ 99€ → ✅ 49€\\n\\n📦 [COD]\\n🚚 [Shipping]\\n⚡ [Urgency]\\n\\n👉 [Different CTA]",
      "headline": "[Product headline in ${languageName.toUpperCase()}]",
      "description": "[Product benefit in ${languageName.toUpperCase()}]"
    }
  ],
  "googleDemandGen": {
    "titles": ["[Title 1 in ${languageName.toUpperCase()}]", "[Title 2]", "[Title 3]", "[Title 4]", "[Title 5]"],
    "descriptions": ["[Desc 1 in ${languageName.toUpperCase()}]", "[Desc 2]", "[Desc 3]", "[Desc 4]", "[Desc 5]"],
    "longTitles": ["[Long title 1 in ${languageName.toUpperCase()}]", "[Long 2]", "[Long 3]", "[Long 4]", "[Long 5]"]
  }
}

4 ANGLES (all about PRODUCT):
1. Product VERSATILITY
2. SAVINGS with product
3. PROBLEM the product solves
4. EASE OF USE

🚨🚨🚨 FINAL REMINDER 🚨🚨🚨
1. LANGUAGE: Write EVERYTHING in ${languageName.toUpperCase()}
2. PRODUCT: Every single copy must be about the PHYSICAL PRODUCT sold
3. FORBIDDEN: brand, site, company
4. Copy must explain WHAT the product IS and what it DOES

Valid JSON only.`;

  try {
    console.log('=== PROMPT DEBUG ===');
    console.log('Paese:', countryPricing.countryCode);
    console.log('Lingua:', languageName);
    console.log('Prompt (primi 500 char):', prompt.slice(0, 500));
    console.log('=== FINE DEBUG ===');
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
