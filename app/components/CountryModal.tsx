'use client';

import { useState } from 'react';
import { X, Globe, DollarSign, Percent } from 'lucide-react';
import { SUPPORTED_COUNTRIES, CURRENCIES, CampaignConfig } from '@/lib/types';

interface CountryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: Partial<CampaignConfig>) => void;
  currentConfig: CampaignConfig;
}

export default function CountryModal({ isOpen, onClose, onConfirm, currentConfig }: CountryModalProps) {
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [productPrice, setProductPrice] = useState(currentConfig.productPrice.toString());
  const [profitMargin, setProfitMargin] = useState(currentConfig.profitMargin?.toString() || '30');

  if (!isOpen) return null;

  const selectedCountry = SUPPORTED_COUNTRIES.find(c => c.code === country);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    const countryData = SUPPORTED_COUNTRIES.find(c => c.code === code);
    if (countryData) {
      setCurrency(countryData.currency);
    }
  };

  const handleSubmit = () => {
    if (!country || !currency || !productPrice) return;

    onConfirm({
      country,
      currency,
      productPrice: parseFloat(productPrice),
      profitMargin: parseFloat(profitMargin) || undefined
    });
  };

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || currency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Genera in altra nazione
              </h2>
              <p className="text-sm text-zinc-500">
                Usa la stessa campagna ({currentConfig.goal} / {currentConfig.type})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Country Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Paese target
            </label>
            <select
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Seleziona paese...</option>
              {SUPPORTED_COUNTRIES.filter(c => c.code !== currentConfig.country).map(c => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Valuta
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Seleziona valuta...</option>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.symbol} - {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price and Margin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Prezzo prodotto
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="99.99"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                <Percent className="w-4 h-4 inline mr-1" />
                Margine di profitto
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={profitMargin}
                  onChange={(e) => setProfitMargin(e.target.value)}
                  placeholder="30"
                  className="w-full pl-4 pr-10 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Info box */}
          {selectedCountry && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Le keyword verranno generate in <strong>{selectedCountry.name}</strong> nella lingua locale del mercato.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={!country || !currency || !productPrice}
            className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-500 rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Genera keyword
          </button>
        </div>
      </div>
    </div>
  );
}
