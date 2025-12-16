'use client';

import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Zap, Globe } from 'lucide-react';
import InputForm from './components/InputForm';
import CampaignModal from './components/CampaignModal';
import CountryModal from './components/CountryModal';
import KeywordTable from './components/KeywordTable';
import Dashboard from './components/Dashboard';
import ErrorModal from './components/ErrorModal';
import { CampaignConfig, ScoredKeyword, ScrapedPage } from '@/lib/types';

type AnalysisStep = 'input' | 'campaign' | 'loading' | 'results';

interface AnalysisResults {
  seedKeywords: string[];
  keywords: ScoredKeyword[];
  summary: {
    totalKeywords: number;
    avgVolume: number;
    avgCpc: number;
    avgScore: number;
    eccellentiCount: number;
    buoneCount: number;
    topRecommendations: ScoredKeyword[];
  };
}

const STORAGE_KEY = 'keyads_state';
const TOKENS_KEY = 'keyads_tokens';

// Limiti API Gemini (piano gratuito per gemma-3-4b-it)
const API_LIMITS = {
  requestsPerMinute: 15,
  requestsPerDay: 1500,
  tokensPerMinute: 1000000,
  tokensPerDay: 1500000
};

// Token medi per analisi - valore iniziale, verrà aggiornato con dati reali
const DEFAULT_TOKENS_PER_ANALYSIS = 15000;
const AVG_REQUESTS_PER_ANALYSIS = 5;

interface SavedState {
  step: AnalysisStep;
  urls: string[];
  scrapedPages: ScrapedPage[];
  campaignConfig: CampaignConfig | null;
  results: AnalysisResults | null;
}

interface TokenUsage {
  total: number;
  todayTokens: number;
  todayRequests: number;
  todayAnalyses: number; // numero di analisi completate oggi
  lastResetDate: string; // YYYY-MM-DD
  hourlyTokens: number;
  hourlyRequests: number;
  lastHourReset: number; // timestamp
}

export default function Home() {
  const [step, setStep] = useState<AnalysisStep>('input');
  const [urls, setUrls] = useState<string[]>([]);
  const [scrapedPages, setScrapedPages] = useState<ScrapedPage[]>([]);
  const [campaignConfig, setCampaignConfig] = useState<CampaignConfig | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [lastAction, setLastAction] = useState<'scrape' | 'analyze' | 'country' | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    total: 0,
    todayTokens: 0,
    todayRequests: 0,
    todayAnalyses: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    hourlyTokens: 0,
    hourlyRequests: 0,
    lastHourReset: Date.now()
  });

  // Multi-country support
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [allResults, setAllResults] = useState<Map<string, { config: CampaignConfig; results: AnalysisResults }>>(new Map());
  const [activeCountry, setActiveCountry] = useState<string | null>(null);

  // Carica stato da localStorage al mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: SavedState = JSON.parse(saved);
        // Se era in loading, torna allo step precedente appropriato
        let restoredStep = state.step;
        if (restoredStep === 'loading') {
          restoredStep = state.scrapedPages.length > 0 ? 'campaign' : 'input';
        }
        setStep(restoredStep);
        setUrls(state.urls || []);
        setScrapedPages(state.scrapedPages || []);
        setCampaignConfig(state.campaignConfig);
        setResults(state.results);
      }

      // Carica token totali con reset temporali
      const savedTokens = localStorage.getItem(TOKENS_KEY);
      if (savedTokens) {
        const parsed: TokenUsage = JSON.parse(savedTokens);
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;

        // Reset giornaliero
        if (parsed.lastResetDate !== today) {
          parsed.todayTokens = 0;
          parsed.todayRequests = 0;
          parsed.todayAnalyses = 0;
          parsed.lastResetDate = today;
        }

        // Assicura che todayAnalyses esista (per compatibilità con dati vecchi)
        if (typeof parsed.todayAnalyses !== 'number') {
          parsed.todayAnalyses = 0;
        }

        // Reset orario
        if (parsed.lastHourReset < oneHourAgo) {
          parsed.hourlyTokens = 0;
          parsed.hourlyRequests = 0;
          parsed.lastHourReset = now;
        }

        setTokenUsage(parsed);
        localStorage.setItem(TOKENS_KEY, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error('Errore caricamento stato:', e);
    }
    setIsHydrated(true);
  }, []);

  // Salva stato in localStorage quando cambia
  useEffect(() => {
    if (!isHydrated) return;

    const state: SavedState = {
      step,
      urls,
      scrapedPages,
      campaignConfig,
      results
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Errore salvataggio stato:', e);
    }
  }, [step, urls, scrapedPages, campaignConfig, results, isHydrated]);

  const handleUrlSubmit = async (submittedUrls: string[]) => {
    setUrls(submittedUrls);
    setError(null);
    setShowErrorModal(false);
    setLastAction('scrape');
    setStep('loading');

    // Messaggi progressivi per scraping
    const scrapeMessages = [
      'Connessione alle pagine web...',
      'Scaricando contenuto HTML...',
      'Estraendo testo e metadati...'
    ];

    let messageIndex = 0;
    setLoadingMessage(scrapeMessages[0]);

    const messageInterval = setInterval(() => {
      messageIndex++;
      if (messageIndex < scrapeMessages.length) {
        setLoadingMessage(scrapeMessages[messageIndex]);
      }
    }, 2000);

    try {
      // Step 1: Scrape le pagine
      const scrapeResponse = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: submittedUrls })
      });

      clearInterval(messageInterval);

      // Gestisci risposte non-JSON (es. errori Vercel)
      const scrapeText = await scrapeResponse.text();
      let scrapeData;
      try {
        scrapeData = JSON.parse(scrapeText);
      } catch {
        throw new Error(`Errore server: ${scrapeText.slice(0, 100)}`);
      }

      if (!scrapeResponse.ok) {
        throw new Error(scrapeData.error || 'Errore nello scraping');
      }

      const successfulPages = scrapeData.results.filter((p: ScrapedPage) => p.success);

      if (successfulPages.length === 0) {
        throw new Error('Non sono riuscito ad accedere a nessuna delle pagine. Verifica che gli URL siano corretti e accessibili.');
      }

      setScrapedPages(successfulPages);
      setStep('campaign');
    } catch (err) {
      clearInterval(messageInterval);
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setShowErrorModal(true);
    }
  };

  const handleCampaignConfirm = async (config: CampaignConfig) => {
    setCampaignConfig(config);
    setError(null);
    setShowErrorModal(false);
    setLastAction('analyze');
    setStep('loading');

    // Messaggi di caricamento progressivi
    const loadingMessages = [
      'Analizzando contenuto pagine web...',
      'Estraendo keyword principali...',
      'Interrogando Google Ads API...',
      'Generando variazioni keyword...',
      'Calcolando metriche di profittabilità...',
      'Confrontando keyword migliori...',
      'Finalizzando analisi...'
    ];

    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);

    const messageInterval = setInterval(() => {
      messageIndex++;
      if (messageIndex < loadingMessages.length) {
        setLoadingMessage(loadingMessages[messageIndex]);
      }
    }, 3000);

    try {
      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scrapedPages,
          campaignConfig: config
        })
      });

      clearInterval(messageInterval);

      // Gestisci risposte non-JSON (es. timeout Vercel)
      const analyzeText = await analyzeResponse.text();
      let analyzeData;
      try {
        analyzeData = JSON.parse(analyzeText);
      } catch {
        throw new Error(`Errore server: ${analyzeText.slice(0, 100)}`);
      }

      if (!analyzeResponse.ok) {
        throw new Error(analyzeData.error || 'Errore nell\'analisi');
      }

      // Aggiorna contatore token
      if (analyzeData.tokenUsage) {
        setTokenUsage(prev => {
          const today = new Date().toISOString().split('T')[0];
          const now = Date.now();
          const oneHourAgo = now - 60 * 60 * 1000;

          // Reset se necessario
          let hourlyTokens = prev.hourlyTokens;
          let hourlyRequests = prev.hourlyRequests;
          let lastHourReset = prev.lastHourReset;

          if (prev.lastHourReset < oneHourAgo) {
            hourlyTokens = 0;
            hourlyRequests = 0;
            lastHourReset = now;
          }

          const newUsage: TokenUsage = {
            total: prev.total + analyzeData.tokenUsage.total,
            todayTokens: (prev.lastResetDate === today ? prev.todayTokens : 0) + analyzeData.tokenUsage.total,
            todayRequests: (prev.lastResetDate === today ? prev.todayRequests : 0) + AVG_REQUESTS_PER_ANALYSIS,
            todayAnalyses: (prev.lastResetDate === today ? prev.todayAnalyses : 0) + 1,
            lastResetDate: today,
            hourlyTokens: hourlyTokens + analyzeData.tokenUsage.total,
            hourlyRequests: hourlyRequests + AVG_REQUESTS_PER_ANALYSIS,
            lastHourReset: lastHourReset
          };

          try {
            localStorage.setItem(TOKENS_KEY, JSON.stringify(newUsage));
          } catch (e) {
            console.error('Errore salvataggio token:', e);
          }
          return newUsage;
        });
      }

      setResults(analyzeData);
      setStep('results');

      // Salva nei risultati multipli
      setAllResults(prev => {
        const newMap = new Map(prev);
        newMap.set(config.country, { config, results: analyzeData });
        return newMap;
      });
      setActiveCountry(config.country);
    } catch (err) {
      clearInterval(messageInterval);
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setShowErrorModal(true);
    }
  };

  // Genera keyword in un'altra nazione
  const handleGenerateInCountry = async (partialConfig: Partial<CampaignConfig>) => {
    if (!campaignConfig) return;

    setShowCountryModal(false);
    setError(null);
    setShowErrorModal(false);
    setLastAction('country');
    setStep('loading');

    const newConfig: CampaignConfig = {
      ...campaignConfig,
      country: partialConfig.country!,
      currency: partialConfig.currency!,
      productPrice: partialConfig.productPrice!,
      profitMargin: partialConfig.profitMargin
    };

    const loadingMessages = [
      `Generando keyword per ${partialConfig.country}...`,
      'Traducendo e adattando al mercato locale...',
      'Stimando metriche di mercato...',
      'Calcolando profittabilità...',
      'Finalizzando analisi...'
    ];

    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);

    const messageInterval = setInterval(() => {
      messageIndex++;
      if (messageIndex < loadingMessages.length) {
        setLoadingMessage(loadingMessages[messageIndex]);
      }
    }, 2500);

    try {
      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scrapedPages,
          campaignConfig: newConfig
        })
      });

      clearInterval(messageInterval);

      // Gestisci risposte non-JSON (es. timeout Vercel)
      const analyzeText = await analyzeResponse.text();
      let analyzeData;
      try {
        analyzeData = JSON.parse(analyzeText);
      } catch {
        throw new Error(`Errore server: ${analyzeText.slice(0, 100)}`);
      }

      if (!analyzeResponse.ok) {
        throw new Error(analyzeData.error || 'Errore nell\'analisi');
      }

      // Aggiorna contatore token
      if (analyzeData.tokenUsage) {
        setTokenUsage(prev => {
          const today = new Date().toISOString().split('T')[0];
          const now = Date.now();
          const oneHourAgo = now - 60 * 60 * 1000;

          let hourlyTokens = prev.hourlyTokens;
          let hourlyRequests = prev.hourlyRequests;
          let lastHourReset = prev.lastHourReset;

          if (prev.lastHourReset < oneHourAgo) {
            hourlyTokens = 0;
            hourlyRequests = 0;
            lastHourReset = now;
          }

          const newUsage: TokenUsage = {
            total: prev.total + analyzeData.tokenUsage.total,
            todayTokens: (prev.lastResetDate === today ? prev.todayTokens : 0) + analyzeData.tokenUsage.total,
            todayRequests: (prev.lastResetDate === today ? prev.todayRequests : 0) + AVG_REQUESTS_PER_ANALYSIS,
            todayAnalyses: (prev.lastResetDate === today ? prev.todayAnalyses : 0) + 1,
            lastResetDate: today,
            hourlyTokens: hourlyTokens + analyzeData.tokenUsage.total,
            hourlyRequests: hourlyRequests + AVG_REQUESTS_PER_ANALYSIS,
            lastHourReset: lastHourReset
          };

          try {
            localStorage.setItem(TOKENS_KEY, JSON.stringify(newUsage));
          } catch (e) {
            console.error('Errore salvataggio token:', e);
          }
          return newUsage;
        });
      }

      // Salva nei risultati multipli
      setAllResults(prev => {
        const newMap = new Map(prev);
        newMap.set(newConfig.country, { config: newConfig, results: analyzeData });
        return newMap;
      });

      // Mostra i nuovi risultati
      setResults(analyzeData);
      setCampaignConfig(newConfig);
      setActiveCountry(newConfig.country);
      setStep('results');
    } catch (err) {
      clearInterval(messageInterval);
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setShowErrorModal(true);
    }
  };

  const handleReset = () => {
    setStep('input');
    setUrls([]);
    setScrapedPages([]);
    setCampaignConfig(null);
    setResults(null);
    setError(null);
    setShowErrorModal(false);
    setLastAction(null);
    setAllResults(new Map());
    setActiveCountry(null);
    // Pulisci anche localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Errore pulizia localStorage:', e);
    }
  };

  // Cambia nazione attiva (per vedere risultati già generati)
  const handleSwitchCountry = (countryCode: string) => {
    const countryData = allResults.get(countryCode);
    if (countryData) {
      setResults(countryData.results);
      setCampaignConfig(countryData.config);
      setActiveCountry(countryCode);
    }
  };

  // Chiude modal errore e torna alla home
  const handleErrorGoHome = () => {
    setShowErrorModal(false);
    setError(null);
    handleReset();
  };

  // Riprova l'ultima azione
  const handleRetry = () => {
    setShowErrorModal(false);
    setError(null);

    if (lastAction === 'scrape' && urls.length > 0) {
      handleUrlSubmit(urls);
    } else if (lastAction === 'analyze' && campaignConfig) {
      handleCampaignConfirm(campaignConfig);
    } else if (lastAction === 'country' && campaignConfig) {
      // Per country, l'utente deve riaprire il modal
      setStep('results');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  KeyAds
                </h1>
                <p className="text-sm text-zinc-500">
                  Analisi keyword powered by AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Token Counter */}
              {(() => {
                // Calcola token medi per analisi basati sui dati reali
                const avgTokensPerAnalysis = tokenUsage.todayAnalyses > 0
                  ? Math.round(tokenUsage.todayTokens / tokenUsage.todayAnalyses)
                  : DEFAULT_TOKENS_PER_ANALYSIS;

                const remainingDailyRequests = Math.max(0, API_LIMITS.requestsPerDay - tokenUsage.todayRequests);
                const remainingDailyTokens = Math.max(0, API_LIMITS.tokensPerDay - tokenUsage.todayTokens);

                // Stima analisi rimanenti basata su dati reali
                const estimatedByRequests = Math.floor(remainingDailyRequests / AVG_REQUESTS_PER_ANALYSIS);
                const estimatedByTokens = Math.floor(remainingDailyTokens / avgTokensPerAnalysis);
                const estimatedAnalysesLeft = Math.min(estimatedByRequests, estimatedByTokens);

                const usagePercent = Math.min(100, (tokenUsage.todayTokens / API_LIMITS.tokensPerDay) * 100);

                // Calcola tempo al reset (mezzanotte)
                const now = new Date();
                const midnight = new Date(now);
                midnight.setHours(24, 0, 0, 0);
                const msToReset = midnight.getTime() - now.getTime();
                const hoursToReset = Math.floor(msToReset / (1000 * 60 * 60));
                const minutesToReset = Math.floor((msToReset % (1000 * 60 * 60)) / (1000 * 60));

                return (
                  <div className="relative group">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-help transition-colors ${
                      estimatedAnalysesLeft < 10
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : estimatedAnalysesLeft < 50
                          ? 'bg-amber-100 dark:bg-amber-900/30'
                          : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}>
                      <Zap className={`w-4 h-4 ${
                        estimatedAnalysesLeft < 10 ? 'text-red-500' : 'text-amber-500'
                      }`} />
                      <div className="text-sm">
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {estimatedAnalysesLeft}
                        </span>
                        <span className="text-zinc-500 ml-1">analisi oggi</span>
                      </div>
                    </div>

                    {/* Tooltip con dettagli */}
                    <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-zinc-500">Limite giornaliero</span>
                        <span className="text-xs text-blue-500">
                          Reset tra {hoursToReset}h {minutesToReset}m
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mb-4 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Analisi fatte oggi:</span>
                          <span className="text-zinc-900 dark:text-white font-medium">
                            {tokenUsage.todayAnalyses}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Token usati oggi:</span>
                          <span className="text-zinc-900 dark:text-white font-medium">
                            {tokenUsage.todayTokens.toLocaleString()} / {(API_LIMITS.tokensPerDay / 1000000).toFixed(1)}M
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Media token/analisi:</span>
                          <span className="text-zinc-900 dark:text-white font-medium">
                            {avgTokensPerAnalysis.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Richieste API oggi:</span>
                          <span className="text-zinc-900 dark:text-white font-medium">
                            {tokenUsage.todayRequests} / {API_LIMITS.requestsPerDay}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                          <span className="text-zinc-500">Token totali (storico):</span>
                          <span className="text-zinc-900 dark:text-white font-medium">
                            {tokenUsage.total.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {tokenUsage.todayAnalyses === 0 && (
                        <p className="mt-3 text-xs text-zinc-400 italic">
                          * I token vengono tracciati automaticamente ad ogni analisi.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {step === 'results' && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Nuova analisi
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Input Step */}
        {step === 'input' && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
                Trova le keyword più profittevoli
              </h2>
              <p className="text-zinc-500">
                Inserisci i link delle tue pagine prodotto e l'AI analizzerà le migliori keyword per Google Ads
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
              <InputForm onSubmit={handleUrlSubmit} isLoading={false} />
            </div>
          </div>
        )}

        {/* Loading Step */}
        {step === 'loading' && (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-6">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
              {loadingMessage}
            </h3>
            <p className="text-zinc-500">
              Questo potrebbe richiedere qualche secondo
            </p>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && results && campaignConfig && (
          <div className="space-y-8">
            {/* Country Tabs & Generate Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Country Tabs */}
              {allResults.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {Array.from(allResults.entries()).map(([countryCode, data]) => (
                    <button
                      key={countryCode}
                      onClick={() => handleSwitchCountry(countryCode)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeCountry === countryCode
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      {countryCode}
                      <span className="text-xs opacity-75">
                        ({data.results.keywords.length})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Generate in other countries button */}
              <button
                onClick={() => setShowCountryModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Globe className="w-4 h-4" />
                Genera in altre nazioni
              </button>
            </div>

            {/* Summary Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold">
                  Analisi completata!
                </h2>
                <span className="px-2 py-1 bg-white/20 rounded-lg text-sm font-medium">
                  {campaignConfig.country}
                </span>
              </div>
              <p className="text-blue-100">
                Ho trovato {results.keywords.length} keyword, di cui {results.summary.eccellentiCount} eccellenti e {results.summary.buoneCount} buone.
                Obiettivo: <span className="font-medium">{campaignConfig.goal}</span> |
                Tipo: <span className="font-medium">{campaignConfig.type}</span>
              </p>
            </div>

            {/* Seed Keywords */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                Seed Keywords estratte
              </h3>
              <div className="flex flex-wrap gap-2">
                {results.seedKeywords.map((seed, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full text-sm"
                  >
                    {seed}
                  </span>
                ))}
              </div>
            </div>

            {/* Dashboard */}
            <Dashboard
              keywords={results.keywords}
              summary={results.summary}
              currency={campaignConfig.currency}
            />

            {/* Keyword Table */}
            <KeywordTable
              keywords={results.keywords}
              currency={campaignConfig.currency}
            />
          </div>
        )}
      </main>

      {/* Campaign Modal */}
      <CampaignModal
        isOpen={step === 'campaign'}
        onClose={() => setStep('input')}
        onConfirm={handleCampaignConfirm}
      />

      {/* Country Modal for multi-country generation */}
      {campaignConfig && (
        <CountryModal
          isOpen={showCountryModal}
          onClose={() => setShowCountryModal(false)}
          onConfirm={handleGenerateInCountry}
          currentConfig={campaignConfig}
        />
      )}

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        error={error || ''}
        onGoHome={handleErrorGoHome}
        onRetry={handleRetry}
      />
    </div>
  );
}
