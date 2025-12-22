'use client';

import { useState } from 'react';
import {
  Globe,
  Facebook,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Video,
  FileText,
  Tag,
  RefreshCw,
  Loader2,
  Search,
  Zap
} from 'lucide-react';
import { CountryCopyResult, CURRENCIES } from '@/lib/types';

interface CopyResultsProps {
  results: CountryCopyResult[];
  onUpdateResults?: (results: CountryCopyResult[]) => void;
  productName?: string;
  landingContent?: string;
}

export default function CopyResults({ results, onUpdateResults, productName, landingContent }: CopyResultsProps) {
  const [localResults, setLocalResults] = useState(results);
  const [activeCountry, setActiveCountry] = useState(results[0]?.countryCode || '');
  const [expandedAngles, setExpandedAngles] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // Traccia le generazioni precedenti per ogni elemento (per evitare ripetizioni)
  const [previousGenerations, setPreviousGenerations] = useState<Record<string, string[]>>({});

  const activeResult = localResults.find(r => r.countryCode === activeCountry);

  // Rigenera un singolo elemento
  const regenerateItem = async (
    type: 'title' | 'description' | 'longTitle' | 'headline' | 'metaDescription' | 'primaryText' | 'shortTitle' | 'searchTerm',
    index: number,
    currentText: string,
    angleIndex?: number
  ) => {
    if (!activeResult || regeneratingId) return;

    const id = `${type}-${angleIndex !== undefined ? `${angleIndex}-` : ''}${index}`;
    // ID univoco per tracciare la cronologia (include country)
    const historyId = `${activeCountry}-${id}`;
    setRegeneratingId(id);

    // Recupera le generazioni precedenti per questo elemento
    const prevTexts = previousGenerations[historyId] || [];

    try {
      const response = await fetch('/api/regenerate-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          currentText,
          productName: productName || 'Prodotto',
          language: activeResult.language,
          limit: type === 'title' || type === 'headline' ? 40 : type === 'shortTitle' ? 30 : 90,
          landingContent: landingContent || '',
          previousTexts: [currentText, ...prevTexts].slice(0, 5) // Max 5 testi precedenti
        })
      });

      if (!response.ok) throw new Error('Errore rigenerazione');

      const data = await response.json();
      if (data.text) {
        // Aggiungi il testo corrente alla cronologia PRIMA di aggiornare
        setPreviousGenerations(prev => ({
          ...prev,
          [historyId]: [currentText, ...(prev[historyId] || [])].slice(0, 5)
        }));

        // Aggiorna i risultati locali
        const newResults = localResults.map(r => {
          if (r.countryCode !== activeCountry) return r;

          const updated = { ...r };

          if (type === 'title') {
            updated.googleDemandGen = {
              ...updated.googleDemandGen,
              titles: updated.googleDemandGen.titles.map((t, i) => i === index ? data.text : t)
            };
          } else if (type === 'description') {
            updated.googleDemandGen = {
              ...updated.googleDemandGen,
              descriptions: updated.googleDemandGen.descriptions.map((d, i) => i === index ? data.text : d)
            };
          } else if (type === 'longTitle') {
            updated.googleDemandGen = {
              ...updated.googleDemandGen,
              longTitles: updated.googleDemandGen.longTitles.map((t, i) => i === index ? data.text : t)
            };
          } else if (type === 'shortTitle') {
            updated.googleDemandGen = {
              ...updated.googleDemandGen,
              shortTitles: (updated.googleDemandGen.shortTitles || []).map((t, i) => i === index ? data.text : t)
            };
          } else if (type === 'searchTerm') {
            updated.googleDemandGen = {
              ...updated.googleDemandGen,
              searchTerms: (updated.googleDemandGen.searchTerms || []).map((t, i) => i === index ? data.text : t)
            };
          } else if (angleIndex !== undefined) {
            updated.facebookAngles = updated.facebookAngles.map((angle, ai) => {
              if (ai !== angleIndex) return angle;
              if (type === 'headline') return { ...angle, headline: data.text };
              if (type === 'metaDescription') return { ...angle, description: data.text };
              if (type === 'primaryText') return { ...angle, primaryText: data.text };
              return angle;
            });
          }

          return updated;
        });

        setLocalResults(newResults);
        onUpdateResults?.(newResults);
      }
    } catch (err) {
      console.error('Errore rigenerazione:', err);
    } finally {
      setRegeneratingId(null);
    }
  };

  const getCurrencySymbol = (currencyCode: string) => {
    return CURRENCIES.find(c => c.code === currencyCode)?.symbol || currencyCode;
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Errore copia:', err);
    }
  };

  const toggleAngle = (angleId: string) => {
    setExpandedAngles(prev => {
      // Se undefined, significa che è expanded (default). Quindi lo chiudiamo.
      const currentlyExpanded = prev[angleId] !== false;
      return {
        ...prev,
        [angleId]: !currentlyExpanded
      };
    });
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">Nessun risultato disponibile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Country Tabs */}
      {results.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {results.map(result => (
            <button
              key={result.countryCode}
              onClick={() => setActiveCountry(result.countryCode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeCountry === result.countryCode
                  ? 'bg-purple-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
              }`}
            >
              <Globe className="w-4 h-4" />
              {result.countryCode} - {result.countryName}
            </button>
          ))}
        </div>
      )}

      {activeResult && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold">
                {activeResult.countryCode} - {activeResult.countryName}
              </h2>
              <span className="px-2 py-1 bg-white/20 rounded-lg text-sm font-medium">
                {activeResult.language}
              </span>
            </div>
            <p className="text-purple-100">
              Prezzo: {getCurrencySymbol(activeResult.currency)}{activeResult.finalPrice}
              {activeResult.originalPrice && (
                <span className="ml-2 line-through opacity-70">
                  {getCurrencySymbol(activeResult.currency)}{activeResult.originalPrice}
                </span>
              )}
            </p>
          </div>

          {/* Riassunto */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white mb-3">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Riassunto
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              {activeResult.landingTakeaways}
            </p>
            {activeResult.competitorSnapshot && (
              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Analisi Competitor
                </h4>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {activeResult.competitorSnapshot}
                </p>
              </div>
            )}
          </div>

          {/* Facebook Ads Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-700 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">
                <Facebook className="w-5 h-5 text-blue-600" />
                Meta Ads - 4 Angle
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Ogni angle include 2 varianti A/B del primary text
              </p>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {activeResult.facebookAngles.map((angle, index) => {
                const angleId = `${activeResult.countryCode}-angle-${index}`;
                const isExpanded = expandedAngles[angleId] !== false; // Default expanded

                return (
                  <div key={index} className="p-6">
                    {/* Angle Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1 flex flex-col items-center">
                        <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                          <Tag className="w-3 h-3" />
                          Angle {index + 1}: {angle.angleName}
                        </span>
                        <p className="text-sm text-zinc-500 mt-2 text-center">
                          {angle.angleDescription}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleAngle(angleId)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors ml-4"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-zinc-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-zinc-400" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="space-y-4">
                        {/* Primary Text */}
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                              Primary Text
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => regenerateItem('primaryText', 0, angle.primaryText || angle.primaryText1 || '', index)}
                                disabled={regeneratingId !== null}
                                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                                title="Rigenera"
                              >
                                {regeneratingId === `primaryText-${index}-0` ? (
                                  <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                                )}
                              </button>
                              <button
                                onClick={() => copyToClipboard(angle.primaryText || angle.primaryText1 || '', `${angleId}-pt`)}
                                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                              >
                                {copiedId === `${angleId}-pt` ? (
                                  <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Copy className="w-4 h-4 text-zinc-400" />
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap text-sm">
                            {angle.primaryText || angle.primaryText1}
                          </p>
                        </div>

                        {/* Headline & Description */}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                Headline
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => regenerateItem('headline', index, angle.headline, index)}
                                  disabled={regeneratingId !== null}
                                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                                  title="Rigenera"
                                >
                                  {regeneratingId === `headline-${index}-${index}` ? (
                                    <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                                  )}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(angle.headline, `${angleId}-hl`)}
                                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                                >
                                  {copiedId === `${angleId}-hl` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-zinc-400" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                              {angle.headline}
                            </p>
                          </div>

                          <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                Description
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => regenerateItem('metaDescription', index, angle.description, index)}
                                  disabled={regeneratingId !== null}
                                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                                  title="Rigenera"
                                >
                                  {regeneratingId === `metaDescription-${index}-${index}` ? (
                                    <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                                  )}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(angle.description, `${angleId}-desc`)}
                                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                                >
                                  {copiedId === `${angleId}-desc` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-zinc-400" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <p className="text-zinc-800 dark:text-zinc-200">
                              {angle.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Google Demand Gen Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-700 bg-green-50 dark:bg-green-900/20">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google Demand Gen
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Titoli, descrizioni e titoli lunghi per video
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Titles */}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">
                  <FileText className="w-4 h-4" />
                  Titoli (max 40 caratteri)
                </h4>
                <div className="space-y-2">
                  {activeResult.googleDemandGen.titles.map((title, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200 text-sm flex-1 mr-2">
                        {title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs ${title.length > 40 ? 'text-red-500' : 'text-zinc-400'}`}>
                          {title.length}/40
                        </span>
                        <button
                          onClick={() => regenerateItem('title', index, title)}
                          disabled={regeneratingId !== null}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                          title="Rigenera"
                        >
                          {regeneratingId === `title-${index}` ? (
                            <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(title, `${activeResult.countryCode}-title-${index}`)}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          {copiedId === `${activeResult.countryCode}-title-${index}` ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">
                  <FileText className="w-4 h-4" />
                  Descrizioni (max 90 caratteri)
                </h4>
                <div className="space-y-2">
                  {activeResult.googleDemandGen.descriptions.map((desc, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200 text-sm flex-1 mr-2">
                        {desc}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs ${desc.length > 90 ? 'text-red-500' : 'text-zinc-400'}`}>
                          {desc.length}/90
                        </span>
                        <button
                          onClick={() => regenerateItem('description', index, desc)}
                          disabled={regeneratingId !== null}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                          title="Rigenera"
                        >
                          {regeneratingId === `description-${index}` ? (
                            <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(desc, `${activeResult.countryCode}-desc-${index}`)}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          {copiedId === `${activeResult.countryCode}-desc-${index}` ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Long Titles for Video */}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">
                  <Video className="w-4 h-4" />
                  Titoli lunghi per Video (max 90 caratteri)
                </h4>
                <div className="space-y-2">
                  {activeResult.googleDemandGen.longTitles.map((title, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200 text-sm flex-1 mr-2">
                        {title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs ${title.length > 90 ? 'text-red-500' : 'text-zinc-400'}`}>
                          {title.length}/90
                        </span>
                        <button
                          onClick={() => regenerateItem('longTitle', index, title)}
                          disabled={regeneratingId !== null}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                          title="Rigenera"
                        >
                          {regeneratingId === `longTitle-${index}` ? (
                            <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(title, `${activeResult.countryCode}-long-${index}`)}
                          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          {copiedId === `${activeResult.countryCode}-long-${index}` ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Performance Max Section */}
          {(activeResult.googleDemandGen.shortTitles?.length > 0 || activeResult.googleDemandGen.searchTerms?.length > 0) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-700 bg-orange-50 dark:bg-orange-900/20">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">
                  <Zap className="w-5 h-5 text-orange-500" />
                  Performance Max
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Titoli corti e termini di ricerca per campagne Performance Max
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Short Titles */}
                {activeResult.googleDemandGen.shortTitles?.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">
                      <FileText className="w-4 h-4" />
                      Titoli Corti (max 30 caratteri) - {activeResult.googleDemandGen.shortTitles.length} titoli
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {activeResult.googleDemandGen.shortTitles.map((title, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                        >
                          <span className="text-zinc-800 dark:text-zinc-200 text-sm flex-1 mr-2 truncate">
                            {title}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`text-xs ${title.length > 30 ? 'text-red-500' : 'text-zinc-400'}`}>
                              {title.length}/30
                            </span>
                            <button
                              onClick={() => regenerateItem('shortTitle', index, title)}
                              disabled={regeneratingId !== null}
                              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                              title="Rigenera"
                            >
                              {regeneratingId === `shortTitle-${index}` ? (
                                <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 text-orange-400 hover:text-orange-600" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(title, `${activeResult.countryCode}-short-${index}`)}
                              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                            >
                              {copiedId === `${activeResult.countryCode}-short-${index}` ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-zinc-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search Terms */}
                {activeResult.googleDemandGen.searchTerms?.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">
                      <Search className="w-4 h-4" />
                      Termini di Ricerca - {activeResult.googleDemandGen.searchTerms.length} termini
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {activeResult.googleDemandGen.searchTerms.map((term, index) => (
                        <div
                          key={index}
                          className="group flex items-center gap-1 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <span>{term}</span>
                          <button
                            onClick={() => copyToClipboard(term, `${activeResult.countryCode}-term-${index}`)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {copiedId === `${activeResult.countryCode}-term-${index}` ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-zinc-400" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => copyToClipboard(activeResult.googleDemandGen.searchTerms.join(', '), `${activeResult.countryCode}-all-terms`)}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors text-sm font-medium"
                    >
                      {copiedId === `${activeResult.countryCode}-all-terms` ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copiati tutti!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copia tutti i termini
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
