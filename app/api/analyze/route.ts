import { NextRequest, NextResponse } from 'next/server';
import {
  extractSeedKeywords,
  generateKeywordVariations,
  estimateKeywordMetrics,
  getTokenUsage,
  resetTokenUsage
} from '@/lib/gemini';
import {
  generateKeywordIdeasFromUrl,
  generateKeywordIdeasFromSeeds,
  getGoogleAdsConfig,
  isGoogleAdsConfigured
} from '@/lib/googleAds';
import { scoreKeywords, generateSummary } from '@/lib/scoring';
import { CampaignConfig, ScrapedPage, KeywordData } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { scrapedPages, campaignConfig } = await request.json() as {
      scrapedPages: ScrapedPage[];
      campaignConfig: CampaignConfig;
    };

    if (!scrapedPages || scrapedPages.length === 0) {
      return NextResponse.json(
        { error: 'Nessun contenuto da analizzare' },
        { status: 400 }
      );
    }

    // Reset token counter per questa analisi
    resetTokenUsage();

    const useGoogleAds = isGoogleAdsConfigured();
    const googleAdsConfig = getGoogleAdsConfig();

    let allKeywordsWithMetrics: KeywordData[] = [];
    let seedKeywords: string[] = [];

    // Determina la lingua dal paese
    const languageMap: Record<string, string> = {
      'IT': 'it', 'ES': 'es', 'FR': 'fr', 'DE': 'de',
      'BR': 'pt', 'MX': 'es', 'US': 'en', 'GB': 'en',
      'AU': 'en', 'CA': 'en'
    };
    const languageCode = languageMap[campaignConfig.country] || 'en';

    if (useGoogleAds && googleAdsConfig) {
      // === MODALITÀ GOOGLE ADS API ===
      console.log('Usando Google Ads API per dati reali');
      let googleAdsError: string | null = null;

      try {
        // Step 1: Estrai SEMPRE seed keywords con Gemini per avere più dati
        console.log('Estraggo seed keywords con Gemini...');
        for (const page of scrapedPages) {
          if (!page.success) continue;
          const seeds = await extractSeedKeywords(
            page.content,
            page.title,
            page.description,
            campaignConfig.country
          );
          seedKeywords.push(...seeds);
        }
        const uniqueSeeds = [...new Set(seedKeywords)];
        console.log(`Seed keywords estratte: ${uniqueSeeds.length}`);

        // Step 2: Genera keyword ideas dagli URL
        for (const page of scrapedPages) {
          if (!page.success) continue;

          try {
            console.log(`Analizzando URL: ${page.url}`);
            const urlKeywords = await generateKeywordIdeasFromUrl(
              googleAdsConfig,
              page.url,
              campaignConfig.country,
              languageCode
            );
            console.log(`Trovate ${urlKeywords.length} keyword da URL`);
            allKeywordsWithMetrics.push(...urlKeywords);
          } catch (urlError) {
            console.error(`Errore per URL ${page.url}:`, urlError);
            googleAdsError = urlError instanceof Error ? urlError.message : 'Errore Google Ads';
          }
        }

        // Step 3: SEMPRE usa seed keywords per espandere i risultati
        if (uniqueSeeds.length > 0) {
          try {
            // Prima batch di seed
            const seedKeywordsResults1 = await generateKeywordIdeasFromSeeds(
              googleAdsConfig,
              uniqueSeeds.slice(0, 10),
              campaignConfig.country,
              languageCode
            );
            console.log(`Keyword da seed batch 1: ${seedKeywordsResults1.length}`);
            allKeywordsWithMetrics.push(...seedKeywordsResults1);

            // Seconda batch di seed se ne abbiamo abbastanza
            if (uniqueSeeds.length > 10) {
              const seedKeywordsResults2 = await generateKeywordIdeasFromSeeds(
                googleAdsConfig,
                uniqueSeeds.slice(10, 20),
                campaignConfig.country,
                languageCode
              );
              console.log(`Keyword da seed batch 2: ${seedKeywordsResults2.length}`);
              allKeywordsWithMetrics.push(...seedKeywordsResults2);
            }
          } catch (seedError) {
            console.error('Errore seed keywords:', seedError);
            googleAdsError = seedError instanceof Error ? seedError.message : 'Errore Google Ads';
          }
        }

        // Se Google Ads non ha restituito nulla, usa Gemini
        if (allKeywordsWithMetrics.length === 0) {
          console.log('Google Ads non ha restituito keyword, fallback a Gemini');
          console.log('Errore Google Ads:', googleAdsError);
          return await analyzeWithGemini(scrapedPages, campaignConfig);
        }

      } catch (googleError) {
        console.error('Errore Google Ads API, fallback a Gemini:', googleError);
        // Fallback a Gemini se Google Ads fallisce
        return await analyzeWithGemini(scrapedPages, campaignConfig);
      }

    } else {
      // === MODALITÀ GEMINI (FALLBACK) ===
      console.log('Google Ads non configurato, uso Gemini');
      return await analyzeWithGemini(scrapedPages, campaignConfig);
    }

    // Rimuovi duplicati
    const uniqueKeywords = removeDuplicateKeywords(allKeywordsWithMetrics);

    if (uniqueKeywords.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna keyword trovata. Prova con URL diversi.' },
        { status: 400 }
      );
    }

    // Calcola score di profittabilità
    const scoredKeywords = scoreKeywords(uniqueKeywords, campaignConfig);

    // Genera summary
    const summary = generateSummary(scoredKeywords);

    return NextResponse.json({
      seedKeywords: [...new Set(seedKeywords)],
      keywords: scoredKeywords,
      summary: {
        ...summary,
        campaignGoal: campaignConfig.goal,
        campaignType: campaignConfig.type,
        dataSource: useGoogleAds ? 'google_ads' : 'gemini_estimate'
      },
      tokenUsage: getTokenUsage()
    });

  } catch (error) {
    console.error('Errore analisi:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore durante l\'analisi' },
      { status: 500 }
    );
  }
}

// Funzione helper per analisi con Gemini
async function analyzeWithGemini(
  scrapedPages: ScrapedPage[],
  campaignConfig: CampaignConfig
) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return NextResponse.json(
      { error: 'Nessuna API configurata. Configura GEMINI_API_KEY o Google Ads API.' },
      { status: 500 }
    );
  }

  console.log('Usando Gemini per stime keyword');

  // Step 1: Estrai seed keywords
  const allSeedKeywords: string[] = [];
  let combinedContext = '';

  for (const page of scrapedPages) {
    if (!page.success) continue;

    const seeds = await extractSeedKeywords(
      page.content,
      page.title,
      page.description,
      campaignConfig.country
    );

    allSeedKeywords.push(...seeds);
    combinedContext += `${page.title}. ${page.description}. `;
  }

  const uniqueSeeds = [...new Set(allSeedKeywords)];

  if (uniqueSeeds.length === 0) {
    return NextResponse.json(
      { error: 'Non sono riuscito a estrarre keyword dal contenuto' },
      { status: 400 }
    );
  }

  // Step 2: Genera variazioni
  const variations = await generateKeywordVariations(
    uniqueSeeds.slice(0, 15),
    campaignConfig.country,
    combinedContext.slice(0, 500)
  );

  const allKeywords = [...new Set([...uniqueSeeds, ...variations])];

  // Step 3: Stima metriche
  const keywordsWithMetrics = await estimateKeywordMetrics(
    allKeywords,
    campaignConfig.country,
    campaignConfig.currency
  );

  if (keywordsWithMetrics.length === 0) {
    return NextResponse.json(
      { error: 'Errore nella stima delle metriche keyword' },
      { status: 500 }
    );
  }

  // Step 4: Calcola score
  const scoredKeywords = scoreKeywords(keywordsWithMetrics, campaignConfig);
  const summary = generateSummary(scoredKeywords);

  return NextResponse.json({
    seedKeywords: uniqueSeeds,
    keywords: scoredKeywords,
    summary: {
      ...summary,
      campaignGoal: campaignConfig.goal,
      campaignType: campaignConfig.type,
      dataSource: 'gemini_estimate'
    },
    tokenUsage: getTokenUsage()
  });
}

// Rimuove keyword duplicate mantenendo quella con più dati
function removeDuplicateKeywords(keywords: KeywordData[]): KeywordData[] {
  const map = new Map<string, KeywordData>();

  for (const kw of keywords) {
    const key = kw.keyword.toLowerCase().trim();
    const existing = map.get(key);

    if (!existing || kw.volume > existing.volume) {
      map.set(key, kw);
    }
  }

  return Array.from(map.values());
}
