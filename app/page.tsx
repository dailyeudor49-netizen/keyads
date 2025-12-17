'use client';

import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Zap, Globe, ArrowLeft } from 'lucide-react';
import InputForm from './components/InputForm';
import CampaignModal from './components/CampaignModal';
import CountryModal from './components/CountryModal';
import KeywordTable from './components/KeywordTable';
import Dashboard from './components/Dashboard';
import ErrorModal from './components/ErrorModal';
import ModeSelector, { AppMode } from './components/ModeSelector';
import CopyForm from './components/CopyForm';
import CopyResults from './components/CopyResults';
import { CampaignConfig, ScoredKeyword, ScrapedPage, CountryPricing, CountryCopyResult } from '@/lib/types';

type AnalysisStep = 'mode_select' | 'input' | 'campaign' | 'loading' | 'results';
type CopyStep = 'input' | 'loading' | 'results';

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

const STORAGE_KEY = 'adshq_state';
const TOKENS_KEY = 'adshq_tokens';
const COPY_TOKENS_KEY = 'adshq_copy_tokens';
const COPY_STORAGE_KEY = 'adshq_copy_state';

// Limiti API Gemini Free Tier (gemma-3-4b-it / Gemini 1.5 Flash)
// Keywords API e Copy API hanno limiti separati perché usano API key diverse
const API_LIMITS = {
  requestsPerMinute: 15,  // RPM
  requestsPerDay: 1500,   // RPD
  tokensPerMinute: 1000000 // TPM (1 milione)
};

// Token medi per analisi - valore iniziale, verrà aggiornato con dati reali
const DEFAULT_TOKENS_PER_ANALYSIS = 15000;
const DEFAULT_TOKENS_PER_COPY = 20000;
const AVG_REQUESTS_PER_ANALYSIS = 5;
const AVG_REQUESTS_PER_COPY = 3;

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
  // Limiti al minuto (RPM)
  minuteRequests: number;
  minuteTokens: number;
  lastMinuteReset: number; // timestamp
}

export default function Home() {
  // Mode selection
  const [appMode, setAppMode] = useState<AppMode | null>(null);

  // Keyword generation states
  const [step, setStep] = useState<AnalysisStep>('mode_select');
  const [urls, setUrls] = useState<string[]>([]);
  const [scrapedPages, setScrapedPages] = useState<ScrapedPage[]>([]);
  const [campaignConfig, setCampaignConfig] = useState<CampaignConfig | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);

  // Copy generation states
  const [copyStep, setCopyStep] = useState<CopyStep>('input');
  const [copyResults, setCopyResults] = useState<CountryCopyResult[]>([]);
  const [copyLandingContent, setCopyLandingContent] = useState<string>('');

  // Shared states
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [lastAction, setLastAction] = useState<'scrape' | 'analyze' | 'country' | 'copy' | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);

  // Token usage separati per Keywords API e Copy API
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    total: 0,
    todayTokens: 0,
    todayRequests: 0,
    todayAnalyses: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    minuteRequests: 0,
    minuteTokens: 0,
    lastMinuteReset: Date.now()
  });

  const [copyTokenUsage, setCopyTokenUsage] = useState<TokenUsage>({
    total: 0,
    todayTokens: 0,
    todayRequests: 0,
    todayAnalyses: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    minuteRequests: 0,
    minuteTokens: 0,
    lastMinuteReset: Date.now()
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

        // Logica di ripristino modalità
        if (!restoredStep || restoredStep === 'mode_select') {
          // Nessuno step salvato o era in mode_select -> mostra mode_select
          restoredStep = 'mode_select';
          setAppMode(null);
        } else if (state.results || state.scrapedPages.length > 0 || state.campaignConfig) {
          // C'erano dati di keyword generation -> ripristina in modalità keywords
          setAppMode('keywords');
        } else if (restoredStep === 'input') {
          // Era in input ma senza dati -> torna a mode_select
          restoredStep = 'mode_select';
          setAppMode(null);
        } else {
          // Fallback: torna a mode_select
          restoredStep = 'mode_select';
          setAppMode(null);
        }

        setStep(restoredStep);
        setUrls(state.urls || []);
        setScrapedPages(state.scrapedPages || []);
        setCampaignConfig(state.campaignConfig);
        setResults(state.results);
      }

      // Carica stato copy generation
      const savedCopy = localStorage.getItem(COPY_STORAGE_KEY);
      if (savedCopy) {
        const copyState = JSON.parse(savedCopy);
        if (copyState.results && copyState.results.length > 0) {
          setCopyResults(copyState.results);
          setCopyStep(copyState.step || 'results');
          if (copyState.landingContent) {
            setCopyLandingContent(copyState.landingContent);
          }
          setAppMode('copy');
        }
      }

      // Funzione helper per resettare i limiti temporali
      const resetTokenLimits = (parsed: TokenUsage, today: string, now: number): TokenUsage => {
        const oneMinuteAgo = now - 60 * 1000;

        // Reset giornaliero
        if (parsed.lastResetDate !== today) {
          parsed.todayTokens = 0;
          parsed.todayRequests = 0;
          parsed.todayAnalyses = 0;
          parsed.lastResetDate = today;
        }

        // Compatibilità con dati vecchi
        if (typeof parsed.todayAnalyses !== 'number') parsed.todayAnalyses = 0;
        if (typeof parsed.minuteRequests !== 'number') parsed.minuteRequests = 0;
        if (typeof parsed.minuteTokens !== 'number') parsed.minuteTokens = 0;
        if (typeof parsed.lastMinuteReset !== 'number') parsed.lastMinuteReset = now;

        // Reset al minuto (RPM)
        if (parsed.lastMinuteReset < oneMinuteAgo) {
          parsed.minuteRequests = 0;
          parsed.minuteTokens = 0;
          parsed.lastMinuteReset = now;
        }

        return parsed;
      };

      const today = new Date().toISOString().split('T')[0];
      const now = Date.now();

      // Carica token Keywords API
      const savedTokens = localStorage.getItem(TOKENS_KEY);
      if (savedTokens) {
        const parsed = resetTokenLimits(JSON.parse(savedTokens), today, now);
        setTokenUsage(parsed);
        localStorage.setItem(TOKENS_KEY, JSON.stringify(parsed));
      }

      // Carica token Copy API
      const savedCopyTokens = localStorage.getItem(COPY_TOKENS_KEY);
      if (savedCopyTokens) {
        const parsed = resetTokenLimits(JSON.parse(savedCopyTokens), today, now);
        setCopyTokenUsage(parsed);
        localStorage.setItem(COPY_TOKENS_KEY, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error('Errore caricamento stato:', e);
    }
    setIsHydrated(true);
  }, []);

  // Salva stato keywords in localStorage quando cambia
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

  // Salva stato copy in localStorage quando cambia
  useEffect(() => {
    if (!isHydrated) return;

    if (copyResults.length > 0) {
      try {
        localStorage.setItem(COPY_STORAGE_KEY, JSON.stringify({
          results: copyResults,
          step: copyStep,
          landingContent: copyLandingContent
        }));
      } catch (e) {
        console.error('Errore salvataggio stato copy:', e);
      }
    }
  }, [copyResults, copyStep, copyLandingContent, isHydrated]);

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

      // Aggiorna contatore token Keywords API
      if (analyzeData.tokenUsage) {
        setTokenUsage(prev => {
          const today = new Date().toISOString().split('T')[0];
          const now = Date.now();
          const oneMinuteAgo = now - 60 * 1000;

          // Reset al minuto se necessario
          let minuteRequests = prev.minuteRequests || 0;
          let minuteTokens = prev.minuteTokens || 0;
          let lastMinuteReset = prev.lastMinuteReset || now;

          if (lastMinuteReset < oneMinuteAgo) {
            minuteRequests = 0;
            minuteTokens = 0;
            lastMinuteReset = now;
          }

          const newUsage: TokenUsage = {
            total: prev.total + analyzeData.tokenUsage.total,
            todayTokens: (prev.lastResetDate === today ? prev.todayTokens : 0) + analyzeData.tokenUsage.total,
            todayRequests: (prev.lastResetDate === today ? prev.todayRequests : 0) + AVG_REQUESTS_PER_ANALYSIS,
            todayAnalyses: (prev.lastResetDate === today ? prev.todayAnalyses : 0) + 1,
            lastResetDate: today,
            minuteRequests: minuteRequests + AVG_REQUESTS_PER_ANALYSIS,
            minuteTokens: minuteTokens + analyzeData.tokenUsage.total,
            lastMinuteReset: lastMinuteReset
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

      // Aggiorna contatore token Keywords API
      if (analyzeData.tokenUsage) {
        setTokenUsage(prev => {
          const today = new Date().toISOString().split('T')[0];
          const now = Date.now();
          const oneMinuteAgo = now - 60 * 1000;

          // Reset al minuto se necessario
          let minuteRequests = prev.minuteRequests || 0;
          let minuteTokens = prev.minuteTokens || 0;
          let lastMinuteReset = prev.lastMinuteReset || now;

          if (lastMinuteReset < oneMinuteAgo) {
            minuteRequests = 0;
            minuteTokens = 0;
            lastMinuteReset = now;
          }

          const newUsage: TokenUsage = {
            total: prev.total + analyzeData.tokenUsage.total,
            todayTokens: (prev.lastResetDate === today ? prev.todayTokens : 0) + analyzeData.tokenUsage.total,
            todayRequests: (prev.lastResetDate === today ? prev.todayRequests : 0) + AVG_REQUESTS_PER_ANALYSIS,
            todayAnalyses: (prev.lastResetDate === today ? prev.todayAnalyses : 0) + 1,
            lastResetDate: today,
            minuteRequests: minuteRequests + AVG_REQUESTS_PER_ANALYSIS,
            minuteTokens: minuteTokens + analyzeData.tokenUsage.total,
            lastMinuteReset: lastMinuteReset
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
    setAppMode(null);
    setStep('mode_select');
    setUrls([]);
    setScrapedPages([]);
    setCampaignConfig(null);
    setResults(null);
    setCopyStep('input');
    setCopyResults([]);
    setError(null);
    setShowErrorModal(false);
    setLastAction(null);
    setAllResults(new Map());
    setActiveCountry(null);
    // Pulisci anche localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(COPY_STORAGE_KEY);
    } catch (e) {
      console.error('Errore pulizia localStorage:', e);
    }
  };

  // Handle mode selection
  const handleModeSelect = (mode: AppMode) => {
    setAppMode(mode);
    if (mode === 'keywords') {
      setStep('input');
    } else {
      setCopyStep('input');
    }
  };

  // Handle copy generation
  const handleCopySubmit = async (
    landingUrl: string,
    competitorUrls: string[],
    countries: CountryPricing[]
  ) => {
    setError(null);
    setShowErrorModal(false);
    setLastAction('copy');
    setCopyStep('loading');

    const loadingMessages = [
      'Analizzando la landing page...',
      'Estraendo informazioni chiave...',
      'Analizzando competitor...',
      'Generando copy per Facebook Ads...',
      'Creando varianti A/B...',
      'Generando titoli Google Ads...',
      'Ottimizzando per ogni mercato...',
      'Finalizzando copy...'
    ];

    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);

    const messageInterval = setInterval(() => {
      messageIndex++;
      if (messageIndex < loadingMessages.length) {
        setLoadingMessage(loadingMessages[messageIndex]);
      }
    }, 4000);

    try {
      const response = await fetch('/api/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landingUrl,
          competitorUrls: competitorUrls.length > 0 ? competitorUrls : undefined,
          countries
        })
      });

      clearInterval(messageInterval);

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Errore server: ${responseText.slice(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Errore nella generazione copy');
      }

      // Update token usage per Copy API (separato da Keywords API)
      if (data.tokenUsage) {
        setCopyTokenUsage(prev => {
          const today = new Date().toISOString().split('T')[0];
          const now = Date.now();
          const oneMinuteAgo = now - 60 * 1000;

          // Reset al minuto se necessario
          let minuteRequests = prev.minuteRequests || 0;
          let minuteTokens = prev.minuteTokens || 0;
          let lastMinuteReset = prev.lastMinuteReset || now;

          if (lastMinuteReset < oneMinuteAgo) {
            minuteRequests = 0;
            minuteTokens = 0;
            lastMinuteReset = now;
          }

          const requestsUsed = countries.length * AVG_REQUESTS_PER_COPY;
          const newUsage: TokenUsage = {
            total: prev.total + data.tokenUsage.total,
            todayTokens: (prev.lastResetDate === today ? prev.todayTokens : 0) + data.tokenUsage.total,
            todayRequests: (prev.lastResetDate === today ? prev.todayRequests : 0) + requestsUsed,
            todayAnalyses: (prev.lastResetDate === today ? prev.todayAnalyses : 0) + 1,
            lastResetDate: today,
            minuteRequests: minuteRequests + requestsUsed,
            minuteTokens: minuteTokens + data.tokenUsage.total,
            lastMinuteReset: lastMinuteReset
          };

          try {
            localStorage.setItem(COPY_TOKENS_KEY, JSON.stringify(newUsage));
          } catch (e) {
            console.error('Errore salvataggio token copy:', e);
          }
          return newUsage;
        });
      }

      setCopyResults(data.results);
      if (data.landingContent) {
        setCopyLandingContent(data.landingContent);
      }
      setCopyStep('results');
    } catch (err) {
      clearInterval(messageInterval);
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setShowErrorModal(true);
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
    } else if (lastAction === 'copy') {
      // Per copy, torna al form
      setCopyStep('input');
    }
  };

  // Go back to mode selection
  const handleBackToModeSelect = () => {
    setAppMode(null);
    setStep('mode_select');
    setCopyStep('input');
    setCopyResults([]);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="p-2 bg-blue-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  ADS HQ
                </h1>
                <p className="text-sm text-zinc-500">
                  Quartier Generale Campagne ADS
                </p>
              </div>
            </button>
            <div className="flex items-center gap-4">
              {/* Back button when in a mode */}
              {appMode && (step === 'input' || copyStep === 'input') && (
                <button
                  onClick={handleBackToModeSelect}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Cambia modalità
                </button>
              )}

              {/* Token Counters - Keywords API e Copy API separati */}
              {(() => {
                const now = new Date();
                const midnight = new Date(now);
                midnight.setHours(24, 0, 0, 0);
                const msToReset = midnight.getTime() - now.getTime();
                const hoursToReset = Math.floor(msToReset / (1000 * 60 * 60));
                const minutesToReset = Math.floor((msToReset % (1000 * 60 * 60)) / (1000 * 60));

                // Calcola secondi al reset RPM (1 minuto)
                const msMinuteReset = Math.max(0, 60 * 1000 - (Date.now() - (tokenUsage.lastMinuteReset || Date.now())));
                const secMinuteReset = Math.ceil(msMinuteReset / 1000);
                const copyMsMinuteReset = Math.max(0, 60 * 1000 - (Date.now() - (copyTokenUsage.lastMinuteReset || Date.now())));
                const copySecMinuteReset = Math.ceil(copyMsMinuteReset / 1000);

                // Keywords API
                const kwRemainingDaily = Math.max(0, API_LIMITS.requestsPerDay - tokenUsage.todayRequests);
                const kwRemainingMinute = Math.max(0, API_LIMITS.requestsPerMinute - (tokenUsage.minuteRequests || 0));
                const kwEstByDaily = Math.floor(kwRemainingDaily / AVG_REQUESTS_PER_ANALYSIS);
                const kwUsagePercent = Math.min(100, (tokenUsage.todayRequests / API_LIMITS.requestsPerDay) * 100);

                // Copy API
                const copyRemainingDaily = Math.max(0, API_LIMITS.requestsPerDay - copyTokenUsage.todayRequests);
                const copyRemainingMinute = Math.max(0, API_LIMITS.requestsPerMinute - (copyTokenUsage.minuteRequests || 0));
                const copyEstByDaily = Math.floor(copyRemainingDaily / AVG_REQUESTS_PER_COPY);
                const copyUsagePercent = Math.min(100, (copyTokenUsage.todayRequests / API_LIMITS.requestsPerDay) * 100);

                // Mostra il contatore della modalità attiva, o entrambi se in mode_select
                const showKeywords = !appMode || appMode === 'keywords';
                const showCopy = !appMode || appMode === 'copy';

                return (
                  <div className="flex items-center gap-2">
                    {/* Keywords API Counter */}
                    {showKeywords && (
                      <div className="relative group">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-help transition-colors ${
                          kwEstByDaily < 5
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : kwEstByDaily < 20
                              ? 'bg-amber-100 dark:bg-amber-900/30'
                              : 'bg-blue-100 dark:bg-blue-900/30'
                        }`}>
                          <Zap className={`w-4 h-4 ${
                            kwEstByDaily < 5 ? 'text-red-500' : 'text-blue-500'
                          }`} />
                          <div className="text-sm">
                            <span className="font-semibold text-zinc-900 dark:text-white">
                              {kwEstByDaily}
                            </span>
                            <span className="text-zinc-500 ml-1 text-xs">KW</span>
                          </div>
                        </div>

                        {/* Tooltip Keywords */}
                        <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-blue-600">🔑 Keywords API</span>
                            <span className="text-xs text-blue-500">
                              Reset giornaliero: {hoursToReset}h {minutesToReset}m
                            </span>
                          </div>

                          {/* Progress bar giornaliero */}
                          <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mb-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                kwUsagePercent > 80 ? 'bg-red-500' : kwUsagePercent > 50 ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${kwUsagePercent}%` }}
                            />
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Analisi oggi:</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {tokenUsage.todayAnalyses}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Richieste oggi (RPD):</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {tokenUsage.todayRequests} / {API_LIMITS.requestsPerDay}
                              </span>
                            </div>
                            <div className="flex justify-between text-amber-600 dark:text-amber-400">
                              <span>RPM (al minuto):</span>
                              <span className="font-medium">
                                {tokenUsage.minuteRequests || 0} / {API_LIMITS.requestsPerMinute} (reset: {secMinuteReset}s)
                              </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                              <span className="text-zinc-500">Token oggi:</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {tokenUsage.todayTokens.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Copy API Counter */}
                    {showCopy && (
                      <div className="relative group">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-help transition-colors ${
                          copyEstByDaily < 5
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : copyEstByDaily < 20
                              ? 'bg-amber-100 dark:bg-amber-900/30'
                              : 'bg-purple-100 dark:bg-purple-900/30'
                        }`}>
                          <Sparkles className={`w-4 h-4 ${
                            copyEstByDaily < 5 ? 'text-red-500' : 'text-purple-500'
                          }`} />
                          <div className="text-sm">
                            <span className="font-semibold text-zinc-900 dark:text-white">
                              {copyEstByDaily}
                            </span>
                            <span className="text-zinc-500 ml-1 text-xs">Copy</span>
                          </div>
                        </div>

                        {/* Tooltip Copy */}
                        <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-purple-600">✨ Copy API</span>
                            <span className="text-xs text-purple-500">
                              Reset giornaliero: {hoursToReset}h {minutesToReset}m
                            </span>
                          </div>

                          {/* Progress bar giornaliero */}
                          <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mb-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                copyUsagePercent > 80 ? 'bg-red-500' : copyUsagePercent > 50 ? 'bg-amber-500' : 'bg-purple-500'
                              }`}
                              style={{ width: `${copyUsagePercent}%` }}
                            />
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Generazioni oggi:</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {copyTokenUsage.todayAnalyses}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Richieste oggi (RPD):</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {copyTokenUsage.todayRequests} / {API_LIMITS.requestsPerDay}
                              </span>
                            </div>
                            <div className="flex justify-between text-amber-600 dark:text-amber-400">
                              <span>RPM (al minuto):</span>
                              <span className="font-medium">
                                {copyTokenUsage.minuteRequests || 0} / {API_LIMITS.requestsPerMinute} (reset: {copySecMinuteReset}s)
                              </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                              <span className="text-zinc-500">Token oggi:</span>
                              <span className="text-zinc-900 dark:text-white font-medium">
                                {copyTokenUsage.todayTokens.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(step === 'results' || copyStep === 'results') && (
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
        {/* Mode Selection Step */}
        {step === 'mode_select' && !appMode && (
          <ModeSelector onSelect={handleModeSelect} />
        )}

        {/* KEYWORD MODE */}
        {/* Input Step */}
        {appMode === 'keywords' && step === 'input' && (
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

        {/* COPY MODE */}
        {/* Copy Input Step */}
        {appMode === 'copy' && copyStep === 'input' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
                Genera Copy per le tue Ads
              </h2>
              <p className="text-zinc-500">
                Inserisci la tua landing page e genera copy persuasivi per Meta Ads e Google Demand Gen
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
              <CopyForm onSubmit={handleCopySubmit} isLoading={false} />
            </div>
          </div>
        )}

        {/* Copy Loading Step */}
        {appMode === 'copy' && copyStep === 'loading' && (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-6">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
              {loadingMessage}
            </h3>
            <p className="text-zinc-500">
              Questo potrebbe richiedere qualche minuto per più paesi
            </p>
          </div>
        )}

        {/* Copy Results Step */}
        {appMode === 'copy' && copyStep === 'results' && copyResults.length > 0 && (
          <CopyResults
            results={copyResults}
            landingContent={copyLandingContent}
            onUpdateResults={(newResults) => {
              setCopyResults(newResults);
              // Salva in localStorage (l'useEffect salverà anche landingContent)
            }}
            productName={copyResults[0]?.landingTakeaways?.split('.')[0] || 'Prodotto'}
          />
        )}

        {/* Keyword Loading Step */}
        {appMode === 'keywords' && step === 'loading' && (
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

        {/* Keyword Results Step */}
        {appMode === 'keywords' && step === 'results' && results && campaignConfig && (
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
