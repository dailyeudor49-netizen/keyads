import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import {
  CopyGenerationRequest,
  CopyGenerationResponse,
  ScrapedPage
} from '@/lib/types';
import {
  generateAdCopyForAllCountries,
  getCopyTokenUsage,
  resetCopyTokenUsage
} from '@/lib/gemini-copy';

export const maxDuration = 300; // 5 minuti per generare copy per più paesi

// Funzione per scrape di una singola pagina
async function scrapePage(url: string): Promise<ScrapedPage> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Rimuovi script, style e elementi non utili
    $('script, style, nav, footer, header, aside, iframe, noscript').remove();

    // Estrai titolo
    const title = $('title').text().trim() ||
      $('h1').first().text().trim() ||
      '';

    // Estrai meta description
    const description = $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    // Estrai headings
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    });

    // Estrai contenuto principale
    let content = '';
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.product-description',
      '.description',
      '#content',
      'body'
    ];

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length) {
        content = element.text();
        break;
      }
    }

    // Pulisci il contenuto
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 10000);

    return {
      url,
      title,
      description,
      headings: headings.slice(0, 20),
      content,
      success: true
    };
  } catch (error) {
    return {
      url,
      title: '',
      description: '',
      headings: [],
      content: '',
      success: false,
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CopyGenerationRequest = await request.json();
    const { landingUrl, competitorUrls, countries } = body;

    // Validazione
    if (!landingUrl) {
      return NextResponse.json(
        { error: 'URL della landing page obbligatorio' },
        { status: 400 }
      );
    }

    if (!countries || countries.length === 0) {
      return NextResponse.json(
        { error: 'Seleziona almeno una nazione' },
        { status: 400 }
      );
    }

    // Reset token counter per questa sessione
    resetCopyTokenUsage();

    console.log('=== INIZIO GENERAZIONE COPY ===');
    console.log('Landing URL:', landingUrl);
    console.log('Competitor URLs:', competitorUrls);
    console.log('Paesi:', countries.map(c => c.countryCode).join(', '));

    // Step 1: Scrape della landing page
    console.log('Scraping landing page...');
    const landingPage = await scrapePage(landingUrl);

    if (!landingPage.success) {
      return NextResponse.json(
        { error: `Impossibile accedere alla landing page: ${landingPage.error}` },
        { status: 400 }
      );
    }

    // Step 2: Scrape dei competitor (se presenti)
    let competitorContent: string | null = null;
    if (competitorUrls && competitorUrls.length > 0) {
      console.log('Scraping competitor pages...');
      const competitorPages = await Promise.all(
        competitorUrls.slice(0, 3).map(url => scrapePage(url))
      );

      const successfulCompetitors = competitorPages.filter(p => p.success);
      if (successfulCompetitors.length > 0) {
        competitorContent = successfulCompetitors
          .map(p => `=== ${p.url} ===\n${p.title}\n${p.content.slice(0, 2000)}`)
          .join('\n\n');
      }
    }

    // Step 3: Combina il contenuto della landing
    // NON includere title e description perché spesso sono del SITO, non del prodotto!
    // Es: "Purchstar | Wholesale Tech" invece di "Energy Saver Pro"
    const landingContent = `
HEADINGS DALLA PAGINA: ${landingPage.headings.join(' | ')}

CONTENUTO PAGINA:
${landingPage.content}
    `.trim();

    // Step 4: Genera copy per tutti i paesi
    console.log('Generando copy per', countries.length, 'paesi...');
    const results = await generateAdCopyForAllCountries(
      landingContent,
      landingPage.title,
      competitorContent,
      countries
    );

    // Recupera uso token
    const tokenUsage = getCopyTokenUsage();

    console.log('=== GENERAZIONE COPY COMPLETATA ===');
    console.log('Paesi processati:', results.length);
    console.log('Token utilizzati:', tokenUsage.total);

    const response: CopyGenerationResponse = {
      results,
      tokenUsage,
      landingContent // Passa il contenuto per rigenerazioni future
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Errore generazione copy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore nella generazione copy' },
      { status: 500 }
    );
  }
}
