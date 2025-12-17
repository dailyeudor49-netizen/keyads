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

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Estrai info prodotto dal contenuto landing (NON dal title che è spesso il nome del sito!)
  const productInfo = landingContent.slice(0, 1500);

  // Esempi di frasi nella lingua target per guidare il modello
  const languageExamples: Record<string, string> = {
    'italiano': 'Risparmia Ora! Ordina Subito! Scopri di Più! Proteggi i tuoi elettrodomestici! Bollette ridotte!',
    'tedesco': 'Jetzt Sparen! Jetzt Bestellen! Mehr Erfahren! Schütze Deine Geräte! Stromrechnung senken!',
    'francese': 'Économisez Maintenant! Commandez! Découvrez! Protégez Vos Appareils! Factures réduites!',
    'spagnolo': '¡Ahorra Ahora! ¡Ordena Ya! ¡Descubre Más! ¡Protege Tus Electrodomésticos! ¡Facturas reducidas!',
    'inglese': 'Save Now! Order Today! Learn More! Protect Your Appliances! Lower Bills!',
    'portoghese': 'Poupe Agora! Encomende Já! Saiba Mais! Proteja Seus Eletrodomésticos! Contas reduzidas!',
    'olandese': 'Bespaar Nu! Bestel Nu! Ontdek Meer! Bescherm Uw Apparaten! Lagere rekeningen!',
    'polacco': 'Oszczędzaj Teraz! Zamów Teraz! Chroń Swoje Urządzenia! Niższe Rachunki! Stabilizuje Napięcie!',
    'rumeno': 'Economisește Acum! Comandă Acum! Protejează Aparatele! Facturi Reduse!',
    'greco': 'Εξοικονομήστε Τώρα! Παραγγείλετε Τώρα! Προστατέψτε τις Συσκευές!',
    'ceco': 'Ušetřete Nyní! Objednejte Nyní! Chraňte Spotřebiče! Nižší Účty!',
    'ungherese': 'Spórolj Most! Rendelj Most! Védd a Készülékeidet! Alacsonyabb Számlák!',
  };

  const examplesForLanguage = languageExamples[languageName] || languageExamples['inglese'];

  const prompt = `🚨🚨🚨 CRITICAL: ALL OUTPUT MUST BE IN ${languageName.toUpperCase()}! 🚨🚨🚨

LANGUAGE REQUIREMENT (MANDATORY):
- Write EVERYTHING in ${languageName.toUpperCase()}
- Examples of correct ${languageName.toUpperCase()} phrases: "${examplesForLanguage}"
${languageName !== 'italiano' ? `- DO NOT write in Italian! NO Italian words allowed!
- If you write in Italian, the output is INVALID and will be rejected!` : ''}

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

=== GOOGLE DEMAND GEN ===
⚠️⚠️⚠️ WRITE ALL TITLES AND DESCRIPTIONS IN ${languageName.toUpperCase()}! ⚠️⚠️⚠️
${languageName !== 'italiano' ? `🚫 DO NOT USE ITALIAN WORDS! Every single word must be in ${languageName.toUpperCase()}!` : ''}

🚨 AGGRESSIVE MARKETING COPY! MAKE PEOPLE CLICK! 🚨

TITLES (5 titles, MAX 40 chars each) - IN ${languageName.toUpperCase()}:
⚡ AGGRESSIVE, EMOTIONAL, URGENT marketing!
- Each title must explain a KEY FUNCTION or BENEFIT of the product
- Create URGENCY: "Last chance", "Limited", "Don't miss", "Now or never"
- EMOTIONAL hooks: curiosity, fear of missing out, desire
- ACTION words: "Discover", "Get", "Transform", "Save", "Stop"
- NEVER just the product name! Always function + benefit + urgency
- ALL 5 TITLES MUST BE COMPLETELY DIFFERENT FROM EACH OTHER!
- ⚠️ LANGUAGE: ${languageName.toUpperCase()} ONLY!

Example bad: "Energy Saver Pro" ❌
Example good: "Cut Your Bills 50% - Limited Offer!" ✅
Example good: "Stop Wasting Energy - Act Now!" ✅

DESCRIPTIONS (5 descriptions, MAX 90 chars each) - IN ${languageName.toUpperCase()}:
- Expand on product benefits with emotional language
- Include specific results/numbers when possible
- Create desire and urgency
- ALL 5 MUST BE DIFFERENT!
- ⚠️ LANGUAGE: ${languageName.toUpperCase()} ONLY! NO ITALIAN WORDS!

LONG TITLES (5 video titles, MAX 90 chars each) - IN ${languageName.toUpperCase()}:
- Hook + product function + benefit + urgency
- Make viewers want to watch
- ALL 5 MUST BE DIFFERENT!
- ⚠️ LANGUAGE: ${languageName.toUpperCase()} ONLY!

🚫 FORBIDDEN: site name, brand, shipping, warranty, generic phrases, ITALIAN WORDS (if not Italian market)

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
      "headline": "[CTA headline - action verb - push to click! in ${languageName.toUpperCase()}]",
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

=== FACEBOOK HEADLINES (CRITICAL!) ===
Headlines appear NEXT TO THE BUTTON in ads!
They MUST be CTA-style - push users to CLICK!

✅ GOOD headlines (action-oriented):
- "Get Yours Now!"
- "Order Today!"
- "Discover the Secret!"
- "Try It Risk-Free!"
- "Grab This Deal!"
- "Start Saving Now!"

❌ BAD headlines (passive):
- "Energy Saver Pro"
- "Best Product 2024"
- "High Quality"

Each angle's headline must be DIFFERENT and ACTION-ORIENTED!

=== COMPETITOR SNAPSHOT (MANDATORY if competitor provided!) ===
${competitorContent ? `You MUST provide a competitorSnapshot analyzing the competitor content!
Write 2-3 sentences in ${languageName.toUpperCase()} about:
- What competitors are doing
- Their pricing/positioning
- How our product compares` : 'No competitor content provided - set competitorSnapshot to null'}

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

      // Parole italiane comuni per rilevare output sbagliato (definito prima per uso in regenerate)
      const italianWords = [
        'bollette', 'bolletta', 'elettrodomestici', 'elettrodomestico',
        'risparmia', 'risparmi', 'risparmio', 'proteggi', 'protezione', 'protegge',
        'stabilizza', 'stabilizzatore', 'stabilizzatori', 'prolunga', 'ridotte', 'ridurre', 'riduci',
        'subito', 'scopri', 'ordina', 'acquista', 'offerta', 'casa', 'energia',
        'durata', 'inserisci', 'inseriscilo', 'installa', 'soldi', 'salva',
        'corrente', 'tensione', 'durano', 'metà', 'sicuro', 'sicura',
        'tuoi', 'tuo', 'tua', 'tue', 'della', 'delle', 'degli', 'dello',
        'sulla', 'sulle', 'negli', 'nelle', 'nel', 'nella'
      ];

      // Funzione per verificare se il testo contiene italiano
      const textContainsItalian = (text: string): boolean => {
        if (languageName === 'italiano') return false;
        const lowerText = text.toLowerCase();
        return italianWords.some(word => lowerText.includes(word));
      };

      // Funzione per rigenerare UN SINGOLO elemento che supera il limite
      const regenerateSingleItem = async (
        type: 'title' | 'description' | 'longTitle',
        currentText: string,
        limit: number
      ): Promise<string> => {
        const typeNames = {
          title: 'short title',
          description: 'description',
          longTitle: 'long video title'
        };

        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Regenerating ${typeNames[type]} (attempt ${attempt}/3): "${currentText.slice(0, 30)}..." (${currentText.length} char, max ${limit})`);

          const regenPrompt = `🚨 LANGUAGE: ${languageName.toUpperCase()} ONLY! 🚨
${languageName !== 'italiano' ? '⛔ DO NOT write in Italian! Write in ' + languageName.toUpperCase() + '!' : ''}

Rewrite this ${typeNames[type]} in ${languageName.toUpperCase()}.

PRODUCT INFO:
${productInfo.slice(0, 800)}

CURRENT TEXT (${currentText.length} chars - TOO LONG):
"${currentText}"

MUST be MAX ${limit} characters (including spaces).
Keep focus on the PRODUCT, shorten the text.
⚠️ Do NOT mention website/brand, ONLY the product!

Reply ONLY with the new text, nothing else.`;

          try {
            const result = await model.generateContent(regenPrompt);
            trackCopyTokens(result);
            let newText = result.response.text().trim();

            // Rimuovi eventuali virgolette
            newText = newText.replace(/^["']|["']$/g, '').trim();

            // Verifica lunghezza E lingua
            if (newText && newText.length <= limit && !textContainsItalian(newText)) {
              console.log(`✅ Rigenerato: "${newText}" (${newText.length} char)`);
              return newText;
            }
            if (newText.length > limit) {
              console.log(`❌ Ancora troppo lungo: ${newText.length} char`);
            }
            if (textContainsItalian(newText)) {
              console.log(`❌ Contiene italiano! Rigenerando...`);
            }
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

          // Rigenera se troppo lungo O se contiene italiano (quando non dovrebbe)
          if (text.length > limit || textContainsItalian(text)) {
            const reason = text.length > limit ? 'too long' : 'contains Italian';
            console.log(`⚠️ Regenerating ${type}: ${reason} - "${text.slice(0, 30)}..."`);
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
          title: `${missing} short aggressive titles (max 40 chars) about the PRODUCT`,
          description: `${missing} emotional descriptions (max 90 chars) about PRODUCT BENEFITS`,
          longTitle: `${missing} long video titles (max 90 chars) about the PRODUCT`
        };

        const prompt = `🚨 LANGUAGE: ${languageName.toUpperCase()} ONLY! 🚨
${languageName !== 'italiano' ? '⛔ DO NOT write in Italian! Every word must be in ' + languageName.toUpperCase() + '!' : ''}

Generate ${typePrompts[type]}.

PRODUCT INFO:
${productInfo.slice(0, 800)}

REQUIREMENTS:
- Write in ${languageName.toUpperCase()} language!
- Focus on the PHYSICAL PRODUCT, not website/brand
- Describe what the product DOES, its benefits
- Be AGGRESSIVE and create URGENCY

Reply ONLY with a JSON array: ["item1", "item2", ...]`;

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
