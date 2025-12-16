import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { ScrapedPage } from '@/lib/types';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'Inserisci almeno un URL' },
        { status: 400 }
      );
    }

    const results: ScrapedPage[] = await Promise.all(
      urls.map(async (url: string): Promise<ScrapedPage> => {
        try {
          // Fetch della pagina
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: AbortSignal.timeout(10000), // 10 secondi timeout
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
          // Cerca il contenuto principale in ordine di priorità
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
            .slice(0, 10000); // Limita a 10k caratteri

          // Estrai anche prezzi se presenti (utile per contesto)
          const priceMatches = html.match(/[€$£]\s*\d+[.,]?\d*/g) || [];

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
      })
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length
      }
    });
  } catch (error) {
    console.error('Errore scraping:', error);
    return NextResponse.json(
      { error: 'Errore nel processare la richiesta' },
      { status: 500 }
    );
  }
}
