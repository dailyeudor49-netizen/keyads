import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_COPY_API_KEY || '');

interface RegenerateRequest {
  type: 'title' | 'description' | 'longTitle' | 'headline' | 'metaDescription' | 'primaryText';
  currentText: string;
  productName: string;
  language: string;
  limit?: number;
  landingContent?: string;
  previousTexts?: string[]; // Testi precedenti da evitare
}

export async function POST(request: NextRequest) {
  try {
    const body: RegenerateRequest = await request.json();
    const { type, currentText, productName, language, limit, landingContent, previousTexts } = body;

    if (!currentText || !language) {
      return NextResponse.json(
        { error: 'Parametri mancanti' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

    // Usa landingContent se disponibile, altrimenti fallback su productName
    const productContext = landingContent
      ? `INFO PRODOTTO (dalla landing page):\n${landingContent.slice(0, 800)}`
      : `PRODOTTO: ${productName}`;

    // Lista di testi precedenti da evitare
    const avoidTexts = previousTexts && previousTexts.length > 0
      ? `\n\n🚫 TESTI GIÀ USATI (NON ripetere questi!):\n${previousTexts.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\n\nDEVI generare qualcosa di COMPLETAMENTE DIVERSO!`
      : '';

    let prompt: string;

    if (type === 'primaryText') {
      // Per primary text, mantieni la struttura ESATTA
      prompt = `Riscrivi questo primary text per Meta Ads in ${language.toUpperCase()}.

${productContext}

TESTO ATTUALE:
"""
${currentText}
"""

REGOLE STRUTTURA (OBBLIGATORIE - mantieni ESATTAMENTE questa struttura):
1. Prima riga: HOOK con emoji (una frase d'impatto)
2. Seconda riga: frase di supporto (va A CAPO dopo l'hook!)
3. Riga vuota
4. 4-5 BULLET POINTS in COLONNA (ogni bullet su riga separata, inizia con ✅)
5. Riga vuota
6. Riga prezzo: ❌ [prezzo barrato] → ✅ [prezzo scontato]
7. Riga vuota
8. 3 righe logistica SEPARATE:
   📦 Pagamento alla consegna
   🚚 Spedizione X giorni
   ⚡ Ultimi X pezzi
9. Riga vuota
10. CTA finale con 👉

IMPORTANTE:
- Cambia le PAROLE e le FRASI, ma mantieni la STRUTTURA IDENTICA
- I bullet devono essere in COLONNA (uno per riga), non in linea
- Ogni sezione va A CAPO come nell'originale
- Focus sul PRODOTTO, non sul brand/sito
${avoidTexts}

Rispondi SOLO con il nuovo primary text, nient'altro.`;

    } else {
      // Per altri tipi (titoli, descrizioni, headline)
      const typeConfig: Record<string, { name: string; maxChars: number; instruction: string }> = {
        title: {
          name: 'titolo breve Google Ads',
          maxChars: limit || 40,
          instruction: 'Scrivi un titolo breve sul PRODOTTO FISICO venduto'
        },
        description: {
          name: 'descrizione Google Ads',
          maxChars: limit || 90,
          instruction: 'Scrivi una descrizione dei benefici del PRODOTTO FISICO venduto'
        },
        longTitle: {
          name: 'titolo lungo per video',
          maxChars: limit || 90,
          instruction: 'Scrivi un titolo lungo per video sul PRODOTTO FISICO venduto'
        },
        headline: {
          name: 'headline Meta Ads',
          maxChars: limit || 40,
          instruction: 'Scrivi un headline sul PRODOTTO FISICO venduto'
        },
        metaDescription: {
          name: 'descrizione Meta Ads',
          maxChars: limit || 90,
          instruction: 'Scrivi una descrizione dei benefici del PRODOTTO FISICO venduto'
        }
      };

      const config = typeConfig[type];
      if (!config) {
        return NextResponse.json(
          { error: 'Tipo non valido' },
          { status: 400 }
        );
      }

      prompt = `🚨 ATTENZIONE: Devi scrivere SOLO sul PRODOTTO SPECIFICO, NON sul sito web! 🚨

${config.instruction}.

${productContext}

⚠️ IDENTIFICA IL PRODOTTO:
Dalla landing page sopra, identifica il PRODOTTO FISICO in vendita (es: un gadget, un elettrodomestico, un accessorio, ecc).
Il tuo testo deve parlare di QUEL prodotto specifico: cosa fa, a cosa serve, quali benefici dà.

🚫 NON SCRIVERE MAI su:
- Il sito web o la piattaforma
- L'azienda o il brand
- Servizi generici
- "Scopri il nostro sito"
- "Visita il negozio"
- Spedizione, garanzia, installazione

✅ SCRIVI INVECE su:
- Il nome del prodotto
- Cosa FA fisicamente il prodotto
- Quale problema RISOLVE
- Benefici concreti per l'utente
- Caratteristiche tecniche del prodotto

LINGUA: ${language.toUpperCase()} (grammatica perfetta!)
MAX CARATTERI: ${config.maxChars} (TASSATIVO!)

TESTO ATTUALE: "${currentText}"
${avoidTexts}

Rispondi SOLO con il nuovo testo (max ${config.maxChars} char), senza virgolette.`;
    }

    console.log(`Rigenerando ${type} (${previousTexts?.length || 0} testi precedenti da evitare)...`);

    const result = await model.generateContent(prompt);
    let newText = result.response.text().trim();

    // Rimuovi virgolette se presenti all'inizio/fine
    newText = newText.replace(/^["']|["']$/g, '').trim();

    // Per tipi non-primaryText, verifica lunghezza
    if (type !== 'primaryText') {
      const maxChars = limit || (type === 'title' || type === 'headline' ? 40 : 90);

      if (newText.length > maxChars) {
        // Riprova una volta
        const retryPrompt = `Scrivi un testo di MASSIMO ${maxChars} caratteri in ${language} sul prodotto.

${landingContent ? `PRODOTTO:\n${landingContent.slice(0, 400)}` : `PRODOTTO: ${productName}`}

Il testo deve essere DIVERSO da: "${currentText}"
${previousTexts?.length ? `E anche diverso da: ${previousTexts.slice(0, 2).map(t => `"${t}"`).join(', ')}` : ''}

MAX ${maxChars} CARATTERI! Focus sul prodotto!
Rispondi SOLO con il testo.`;

        const retryResult = await model.generateContent(retryPrompt);
        newText = retryResult.response.text().trim().replace(/^["']|["']$/g, '').trim();

        // Se ancora troppo lungo, tronca
        if (newText.length > maxChars) {
          newText = newText.slice(0, maxChars - 3) + '...';
        }
      }
    }

    console.log(`✅ Rigenerato: "${newText.slice(0, 50)}..." (${newText.length} char)`);

    return NextResponse.json({ text: newText });
  } catch (error) {
    console.error('Errore rigenerazione:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore nella rigenerazione' },
      { status: 500 }
    );
  }
}
