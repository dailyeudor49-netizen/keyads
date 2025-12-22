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

  const model = genAI.getGenerativeModel({ model: 'gemma-3-27b-it' });

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
${landingContent.slice(0, 2000)}
=== END CONTENT ===

${competitorContent ? `COMPETITOR:\n${competitorContent.slice(0, 500)}` : ''}

=== META ADS PRIMARY TEXT (WRITE IN ${languageName.toUpperCase()}!) ===

STRUCTURE (use \\n for line breaks):
1. HOOK with emoji + support sentence
2. 3-4 BULLETS (✅ each)
3. PRICE: ❌ ${countryPricing.originalPrice || '99'} ${countryPricing.currency} → ✅ ${countryPricing.finalPrice} ${countryPricing.currency}
4. CTA with 👉

⛔ FORBIDDEN: timer, countdown
✅ OK: generic urgency

=== GOOGLE DEMAND GEN ===
⚠️⚠️⚠️ SCRIVI TUTTO IN ${languageName.toUpperCase()}! ⚠️⚠️⚠️

🎯 TITLES (5 titoli, MAX 40 caratteri) - SPECIFICI SUL PRODOTTO!

=== REGOLA D'ORO ===
OGNI TITOLO DEVE DESCRIVERE COSA FA IL PRODOTTO!
NON usare parole generiche che valgono per qualsiasi prodotto!

✅ TITOLI CORRETTI (descrivono il prodotto):
Per una GRIGLIA RADIATORE MOTO:
• "ADDIO sassi nel radiatore!"
• "MAI PIÙ radiatore danneggiato"
• "Proteggi il motore dai detriti"
• "Griglia che salva il radiatore"
• "-50% protezione radiatore moto"

Per un CUSCINO CERVICALE:
• "ADDIO dolore al collo!"
• "MAI PIÙ torcicollo al mattino"
• "Dormi senza mal di testa"
• "Cuscino che allinea la cervicale"
• "Svegliati senza dolore - 39€"

Per un TV BOX:
• "ADDIO TV lenta e vecchia!"
• "MAI PIÙ buffering sullo schermo"
• "Trasforma la TV in Smart TV"
• "Netflix, sport, giochi: tutto in uno"
• "-50% cinema a casa tua"

❌ TITOLI VIETATI (etichette generiche):
• "Radiator Guard" ← ETICHETTA, non dice cosa fa
• "Engine Shield" ← ETICHETTA
• "Protection" ← GENERICO
• "Save Money" ← GENERICO, non collegato al prodotto
• "Best Quality" ← GENERICO
• "WOW!" "INCREDIBILE!" ← VUOTI, non dicono nulla

❌ MAI SCRIVERE:
• Solo il nome del prodotto
• Solo il prezzo
• Parole singole come "Protezione" "Qualità" "Offerta"
• Frasi che valgono per QUALSIASI prodotto

✅ OGNI TITOLO DEVE:
1. Menzionare un BENEFICIO SPECIFICO del prodotto
2. Far capire COSA FA il prodotto
3. Rispondere a: "Perché dovrei comprare QUESTO prodotto?"

5 ANGLE OBBLIGATORI:
1. PROBLEMA → SOLUZIONE: "ADDIO [problema specifico]!"
2. FASTIDIO ELIMINATO: "MAI PIÙ [problema specifico]"
3. TRASFORMAZIONE: "[Prima] → [Dopo] con questo prodotto"
4. FUNZIONE: "[Cosa fa] + [risultato concreto]"
5. URGENZA + MOTIVO: "[Sconto] + [beneficio chiave]"

⚠️ SCRIVI TUTTO IN ${languageName.toUpperCase()}! MAX 40 CARATTERI!

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

=== PERFORMANCE MAX ===

🎯 SHORT TITLES (15 titoli, MAX 30 CARATTERI)

Copia lo STESSO STILE dei titoli Demand Gen, accorciandoli a 30 char.
OGNI titolo deve essere una FRASE COMPLETA che si capisce da sola!

⚠️ MASSIMO 30 CARATTERI - CONTA PRIMA DI SCRIVERE!

✅ FRASI COMPLETE (si capisce tutto):
• "ADDIO freddo in casa!" ← Capisco: niente più freddo in casa
• "MAI PIÙ bollette salate!" ← Capisco: risparmio in bolletta
• "ADDIO sassi nel motore!" ← Capisco: protegge motore dai sassi
• "MAI PIÙ radiatore bucato!" ← Capisco: radiatore protetto
• "Casa calda in 5 minuti!" ← Capisco: riscalda veloce
• "Radiatore protetto: 29€!" ← Capisco: prodotto + prezzo
• "Risparmia 200€ l'anno!" ← Capisco: beneficio economico

❌ FRASI INCOMPLETE (manca qualcosa):
• "ADDIO sassi!" ← Sassi DOVE? Non si capisce!
• "MAI PIÙ danni!" ← Danni A COSA? Vago!
• "Protezione top!" ← Protezione DI COSA?
• "Sconto 50%!" ← Sconto SU COSA?
• "Radiatore ok!" ← Cosa significa??
• "Griglia Suzuki!" ← E quindi?

🔑 TEST: La frase risponde a "COSA FA il prodotto?"
• "ADDIO freddo in casa!" → SÌ, elimina il freddo ✅
• "ADDIO sassi!" → NO, sassi cosa? Dove? ❌
• "MAI PIÙ bollette salate!" → SÌ, fa risparmiare ✅
• "MAI PIÙ danni!" → NO, danni a cosa? ❌

SCRIVI 15 FRASI COMPLETE sotto 30 caratteri!
SCRIVI IN ${languageName.toUpperCase()}!

SEARCH TERMS (50 search terms) - IN ${languageName.toUpperCase()}:
- Keywords people would search for this product
- Mix of: product names, problems solved, benefits, related terms
- Include variations: singular/plural, with/without adjectives
- Examples: "energy saver", "reduce electricity bill", "power stabilizer"
- ALL 50 MUST BE RELEVANT AND DIFFERENT!

🚫 FORBIDDEN: site name, brand, shipping, warranty, generic phrases, ITALIAN WORDS (if not Italian market)

=== OUTPUT JSON ===

{
  "landingTakeaways": "[Product summary]",
  "competitorSnapshot": "[or null]",
  "facebookAngles": [
    {
      "angleName": "[name]",
      "angleDescription": "[desc]",
      "primaryText": "🔥 [Hook]\\n\\n✅ [Bullet 1]\\n✅ [Bullet 2]\\n✅ [Bullet 3]\\n\\n❌ 99€ → ✅ 49€\\n\\n👉 [CTA]",
      "headline": "[CTA - action verb]",
      "description": "[benefit]"
    }
  ],
  "googleDemandGen": {
    "titles": ["ADDIO [problema]!", "MAI PIÙ [problema]!", "BASTA [problema]!", "[Prodotto]: [beneficio]", "-50%: [beneficio]!"],
    "descriptions": ["[90 char - beneficio emotivo]", "..."],
    "longTitles": ["[90 char - hook + prodotto + beneficio]", "..."],
    "shortTitles": [
      "ADDIO [problema] [dove/cosa]!",
      "MAI PIÙ [problema specifico]!",
      "BASTA [problema specifico]!",
      "[Cosa] in [tempo]!",
      "[Beneficio completo]!",
      "[Prodotto] protetto: [prezzo]!",
      "Risparmia [quanto] [su cosa]!",
      "ADDIO [problema] [dove]!",
      "MAI PIÙ [spesa specifica]!",
      "[Risultato] garantito!",
      "[Beneficio]: -50%!",
      "[Cosa] sempre [come]!",
      "Niente più [problema]!",
      "[Soluzione] in [tempo]!",
      "ADDIO [problema] per sempre!"
    ],
    "searchTerms": ["keyword1", "keyword2", ... x 50]
  }
}

5 ANGLES (all about PRODUCT):
1. SAVINGS/value
2. PROBLEM solved
3. EASE OF USE
4. PROTECTION/safety
5. URGENCY/scarcity

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
      const googleDemandGen = parsed.googleDemandGen || { titles: [], descriptions: [], longTitles: [], shortTitles: [], searchTerms: [] };

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

      // Contatore globale rigenerazioni per questo paese (max 3)
      let regenerationCount = 0;
      const MAX_REGENERATIONS = 3;

      // Funzione per rigenerare UN SINGOLO elemento che supera il limite
      const regenerateSingleItem = async (
        type: 'title' | 'description' | 'longTitle' | 'shortTitle' | 'searchTerm',
        currentText: string,
        limit: number
      ): Promise<string> => {
        // Se abbiamo già raggiunto il limite, tronca direttamente
        if (regenerationCount >= MAX_REGENERATIONS) {
          console.log(`⚠️ Limite rigenerazioni raggiunto (${MAX_REGENERATIONS}), troncamento diretto`);
          return currentText.slice(0, limit - 3) + '...';
        }
        const typeNames = {
          title: 'short title',
          description: 'description',
          longTitle: 'long video title',
          shortTitle: 'short title',
          searchTerm: 'search term'
        };

        // Solo 1 tentativo per elemento (il limite globale controlla il totale)
        regenerationCount++;
        console.log(`Regenerating ${typeNames[type]} (${regenerationCount}/${MAX_REGENERATIONS} totali): "${currentText.slice(0, 30)}..." (${currentText.length} char, max ${limit})`);

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
              console.log(`❌ Contiene italiano, troncamento`);
            }
            // Se non valido, tronca
            return currentText.slice(0, limit - 3) + '...';
          } catch (e) {
            console.error('Errore rigenerazione singola:', e);
            return currentText.slice(0, limit - 3) + '...';
          }
      };

      // Processa ogni array e rigenera singoli elementi se necessario
      const processArray = async (arr: any[], limit: number, type: 'title' | 'description' | 'longTitle' | 'shortTitle' | 'searchTerm', maxItems: number = 5): Promise<string[]> => {
        if (!Array.isArray(arr)) return [];

        const result: string[] = [];
        for (const item of arr.slice(0, maxItems)) {
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
      googleDemandGen.shortTitles = await processArray(googleDemandGen.shortTitles || [], 30, 'shortTitle', 15);
      googleDemandGen.searchTerms = await processArray(googleDemandGen.searchTerms || [], 100, 'searchTerm', 50);

      console.log('Demand Gen dopo processamento:', {
        titles: googleDemandGen.titles.length,
        descriptions: googleDemandGen.descriptions.length,
        longTitles: googleDemandGen.longTitles.length,
        shortTitles: (googleDemandGen.shortTitles || []).length,
        searchTerms: (googleDemandGen.searchTerms || []).length
      });

      // Se mancano elementi, genera quelli mancanti (solo se abbiamo budget)
      const generateMissing = async (current: string[], needed: number, type: 'title' | 'description' | 'longTitle' | 'shortTitle' | 'searchTerm', limit: number): Promise<string[]> => {
        if (current.length >= needed) return current;

        // Skip se abbiamo già usato tutte le rigenerazioni
        if (regenerationCount >= MAX_REGENERATIONS) {
          console.log(`⚠️ Skip generateMissing: limite rigenerazioni raggiunto`);
          return current;
        }

        const missing = needed - current.length;
        console.log(`Generando ${missing} ${type} mancanti...`);
        regenerationCount++;

        const typePrompts = {
          title: `${missing} short aggressive titles (max 40 chars) about the PRODUCT`,
          description: `${missing} emotional descriptions (max 90 chars) about PRODUCT BENEFITS`,
          longTitle: `${missing} long video titles (max 90 chars) about the PRODUCT`,
          shortTitle: `${missing} ultra-short punchy titles (max 30 chars) about the PRODUCT`,
          searchTerm: `${missing} search keywords people would use to find this PRODUCT`
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
      googleDemandGen.shortTitles = await generateMissing(googleDemandGen.shortTitles || [], 15, 'shortTitle', 30);
      googleDemandGen.searchTerms = await generateMissing(googleDemandGen.searchTerms || [], 50, 'searchTerm', 100);

      console.log('Demand Gen finale:', {
        titles: googleDemandGen.titles,
        descriptions: googleDemandGen.descriptions,
        longTitles: googleDemandGen.longTitles,
        shortTitles: googleDemandGen.shortTitles,
        searchTerms: (googleDemandGen.searchTerms || []).length + " terms"
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
        googleDemandGen: { titles: [], descriptions: [], longTitles: [], shortTitles: [], searchTerms: [] }
      });
    }
  }

  return results;
}
