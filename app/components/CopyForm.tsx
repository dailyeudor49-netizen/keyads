'use client';

import { useState } from 'react';
import {
  Link,
  Plus,
  Trash2,
  Globe,
  DollarSign,
  Tag,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SUPPORTED_COUNTRIES, CURRENCIES, CountryPricing } from '@/lib/types';

interface CopyFormProps {
  onSubmit: (landingUrl: string, competitorUrls: string[], countries: CountryPricing[]) => void;
  isLoading: boolean;
}

interface CountryEntry {
  id: string;
  countryCode: string;
  currency: string;
  finalPrice: string;
  originalPrice: string;
}

export default function CopyForm({ onSubmit, isLoading }: CopyFormProps) {
  const [landingUrl, setLandingUrl] = useState('');
  const [landingError, setLandingError] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [competitorErrors, setCompetitorErrors] = useState<Record<number, string>>({});
  const [showCompetitors, setShowCompetitors] = useState(false);

  const [countries, setCountries] = useState<CountryEntry[]>([
    { id: '1', countryCode: '', currency: '', finalPrice: '', originalPrice: '' }
  ]);
  const [countryErrors, setCountryErrors] = useState<Record<string, string>>({});

  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  };

  const validateUrl = (url: string): boolean => {
    try {
      const normalized = normalizeUrl(url);
      new URL(normalized);
      return true;
    } catch {
      return false;
    }
  };

  const handleCountryChange = (id: string, countryCode: string) => {
    const countryData = SUPPORTED_COUNTRIES.find(c => c.code === countryCode);
    setCountries(prev => prev.map(c =>
      c.id === id
        ? { ...c, countryCode, currency: countryData?.currency || '' }
        : c
    ));
    // Clear error
    if (countryErrors[id]) {
      const newErrors = { ...countryErrors };
      delete newErrors[id];
      setCountryErrors(newErrors);
    }
  };

  const handleCountryFieldChange = (id: string, field: keyof CountryEntry, value: string) => {
    setCountries(prev => prev.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const addCountry = () => {
    const newId = Date.now().toString();
    setCountries(prev => [...prev, {
      id: newId,
      countryCode: '',
      currency: '',
      finalPrice: '',
      originalPrice: ''
    }]);
  };

  const removeCountry = (id: string) => {
    if (countries.length > 1) {
      setCountries(prev => prev.filter(c => c.id !== id));
    }
  };

  const addCompetitor = () => {
    if (competitorUrls.length < 3) {
      setCompetitorUrls(prev => [...prev, '']);
    }
  };

  const removeCompetitor = (index: number) => {
    setCompetitorUrls(prev => prev.filter((_, i) => i !== index));
    const newErrors = { ...competitorErrors };
    delete newErrors[index];
    setCompetitorErrors(newErrors);
  };

  const handleCompetitorChange = (index: number, value: string) => {
    const newUrls = [...competitorUrls];
    newUrls[index] = value;
    setCompetitorUrls(newUrls);
    if (competitorErrors[index]) {
      const newErrors = { ...competitorErrors };
      delete newErrors[index];
      setCompetitorErrors(newErrors);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let hasErrors = false;

    // Validate landing URL
    if (!landingUrl.trim()) {
      setLandingError('Inserisci l\'URL della landing page');
      hasErrors = true;
    } else if (!validateUrl(landingUrl)) {
      setLandingError('URL non valido');
      hasErrors = true;
    } else {
      setLandingError('');
    }

    // Validate competitor URLs
    const newCompetitorErrors: Record<number, string> = {};
    competitorUrls.forEach((url, index) => {
      if (url.trim() && !validateUrl(url)) {
        newCompetitorErrors[index] = 'URL non valido';
        hasErrors = true;
      }
    });
    setCompetitorErrors(newCompetitorErrors);

    // Validate countries
    const newCountryErrors: Record<string, string> = {};
    const validCountries: CountryPricing[] = [];

    countries.forEach(country => {
      if (!country.countryCode) {
        newCountryErrors[country.id] = 'Seleziona un paese';
        hasErrors = true;
      } else if (!country.finalPrice || parseFloat(country.finalPrice) <= 0) {
        newCountryErrors[country.id] = 'Inserisci il prezzo';
        hasErrors = true;
      } else {
        validCountries.push({
          countryCode: country.countryCode,
          currency: country.currency,
          finalPrice: parseFloat(country.finalPrice),
          originalPrice: country.originalPrice ? parseFloat(country.originalPrice) : undefined
        });
      }
    });
    setCountryErrors(newCountryErrors);

    if (hasErrors || validCountries.length === 0) {
      return;
    }

    // Filter valid competitor URLs
    const validCompetitorUrls = competitorUrls
      .filter(url => url.trim() && validateUrl(url))
      .map(url => normalizeUrl(url));

    onSubmit(normalizeUrl(landingUrl), validCompetitorUrls, validCountries);
  };

  const getCurrencySymbol = (currencyCode: string) => {
    return CURRENCIES.find(c => c.code === currencyCode)?.symbol || currencyCode;
  };

  // Get already selected countries to exclude from other dropdowns
  const selectedCountryCodes = countries.map(c => c.countryCode).filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Landing URL */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          <Link className="w-4 h-4 inline mr-2" />
          URL Landing Page *
        </label>
        <div className="relative">
          <input
            type="text"
            value={landingUrl}
            onChange={(e) => {
              setLandingUrl(e.target.value);
              setLandingError('');
            }}
            placeholder="https://tuodominio.com/landing-page"
            disabled={isLoading}
            className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 ${
              landingError ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
            }`}
          />
        </div>
        {landingError && (
          <div className="flex items-center gap-1 mt-1 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {landingError}
          </div>
        )}
      </div>

      {/* Competitor URLs (Collapsible) */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCompetitors(!showCompetitors)}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            URL Competitor (opzionale)
          </span>
          {showCompetitors ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>

        {showCompetitors && (
          <div className="p-4 space-y-3 border-t border-zinc-200 dark:border-zinc-700">
            {competitorUrls.map((url, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handleCompetitorChange(index, e.target.value)}
                    placeholder="https://competitor.com/prodotto"
                    disabled={isLoading}
                    className={`w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 ${
                      competitorErrors[index] ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                    }`}
                  />
                  {competitorErrors[index] && (
                    <div className="flex items-center gap-1 mt-1 text-red-500 text-xs">
                      <AlertCircle className="w-3 h-3" />
                      {competitorErrors[index]}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeCompetitor(index)}
                  disabled={isLoading}
                  className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {competitorUrls.length < 3 && (
              <button
                type="button"
                onClick={addCompetitor}
                disabled={isLoading}
                className="flex items-center gap-2 text-purple-500 hover:text-purple-600 text-sm font-medium disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Aggiungi competitor
              </button>
            )}

            <p className="text-xs text-zinc-500">
              Aggiungi fino a 3 landing page dei competitor per un'analisi comparativa
            </p>
          </div>
        )}
      </div>

      {/* Countries Section */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
          <Globe className="w-4 h-4 inline mr-2" />
          Paesi target e prezzi *
        </label>

        <div className="space-y-4">
          {countries.map((country, index) => (
            <div
              key={country.id}
              className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Paese {index + 1}
                </span>
                {countries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCountry(country.id)}
                    disabled={isLoading}
                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Country Select */}
                <div className="col-span-2 md:col-span-1">
                  <select
                    value={country.countryCode}
                    onChange={(e) => handleCountryChange(country.id, e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">Paese...</option>
                    {SUPPORTED_COUNTRIES.filter(c =>
                      c.code === country.countryCode || !selectedCountryCodes.includes(c.code)
                    ).map(c => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Currency (auto-populated) */}
                <div>
                  <div className="px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 text-sm">
                    {country.currency || 'Valuta'}
                  </div>
                </div>

                {/* Final Price */}
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                      {country.currency ? getCurrencySymbol(country.currency) : <DollarSign className="w-4 h-4" />}
                    </span>
                    <input
                      type="number"
                      value={country.finalPrice}
                      onChange={(e) => handleCountryFieldChange(country.id, 'finalPrice', e.target.value)}
                      placeholder="Prezzo"
                      disabled={isLoading}
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm placeholder-zinc-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Original Price (optional) */}
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      <Tag className="w-4 h-4" />
                    </span>
                    <input
                      type="number"
                      value={country.originalPrice}
                      onChange={(e) => handleCountryFieldChange(country.id, 'originalPrice', e.target.value)}
                      placeholder="Da scontare"
                      disabled={isLoading}
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm placeholder-zinc-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {countryErrors[country.id] && (
                <div className="flex items-center gap-1 mt-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {countryErrors[country.id]}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addCountry}
            disabled={isLoading || countries.length >= SUPPORTED_COUNTRIES.length}
            className="flex items-center gap-2 text-purple-500 hover:text-purple-600 text-sm font-medium disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Aggiungi paese
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generazione in corso...
          </>
        ) : (
          'Genera Copy'
        )}
      </button>

      <p className="text-xs text-center text-zinc-500">
        Verranno generati copy per Meta Ads e Google Demand Gen per ogni paese selezionato
      </p>
    </form>
  );
}
