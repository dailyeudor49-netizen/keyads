'use client';

import { useState } from 'react';
import { X, Target, MousePointer, Eye, Heart } from 'lucide-react';
import {
  CampaignConfig,
  CampaignGoal,
  CampaignType,
  CAMPAIGN_GOALS,
  CAMPAIGN_TYPES,
  SUPPORTED_COUNTRIES,
  CURRENCIES
} from '@/lib/types';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: CampaignConfig) => void;
  initialConfig?: Partial<CampaignConfig>;
}

const goalIcons: Record<CampaignGoal, React.ReactNode> = {
  conversions: <Target className="w-6 h-6" />,
  traffic: <MousePointer className="w-6 h-6" />,
  awareness: <Eye className="w-6 h-6" />,
  engagement: <Heart className="w-6 h-6" />
};

export default function CampaignModal({
  isOpen,
  onClose,
  onConfirm,
  initialConfig
}: CampaignModalProps) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<CampaignGoal>(initialConfig?.goal || 'conversions');
  const [type, setType] = useState<CampaignType>(initialConfig?.type || 'search');
  const [country, setCountry] = useState(initialConfig?.country || 'IT');
  const [currency, setCurrency] = useState(initialConfig?.currency || 'EUR');
  const [productPrice, setProductPrice] = useState(initialConfig?.productPrice || 0);
  const [profitMargin, setProfitMargin] = useState<number | undefined>(initialConfig?.profitMargin);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (productPrice <= 0) {
      alert('Inserisci un prezzo valido per il prodotto');
      return;
    }
    onConfirm({
      goal,
      type,
      country,
      currency,
      productPrice,
      profitMargin: profitMargin && profitMargin > 0 ? profitMargin : undefined
    });
  };

  const selectedCountry = SUPPORTED_COUNTRIES.find(c => c.code === country);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Configura la tua campagna
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-2 p-6 pb-0">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Obiettivo */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">
                Qual è l'obiettivo principale?
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAMPAIGN_GOALS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGoal(g.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      goal === g.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        goal === g.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {goalIcons[g.id]}
                      </div>
                      <div>
                        <div className="font-medium text-zinc-900 dark:text-white">
                          {g.name}
                        </div>
                        <div className="text-sm text-zinc-500">
                          {g.description}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Tipo campagna */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">
                Che tipo di campagna vuoi lanciare?
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAMPAIGN_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      type === t.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="font-medium text-zinc-900 dark:text-white">
                      {t.name}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Dettagli */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">
                Dettagli del prodotto
              </h3>

              {/* Paese */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Paese target
                </label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    const c = SUPPORTED_COUNTRIES.find(c => c.code === e.target.value);
                    if (c) setCurrency(c.currency);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {SUPPORTED_COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Valuta */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Valuta
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} - {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Prezzo prodotto */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Prezzo del prodotto/servizio
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    {CURRENCIES.find(c => c.code === currency)?.symbol || '€'}
                  </span>
                  <input
                    type="number"
                    value={productPrice || ''}
                    onChange={(e) => setProductPrice(parseFloat(e.target.value) || 0)}
                    placeholder="99.90"
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Margine di guadagno (opzionale) */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Margine di guadagno <span className="text-zinc-400 font-normal">(opzionale)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    {CURRENCIES.find(c => c.code === currency)?.symbol || '€'}
                  </span>
                  <input
                    type="number"
                    value={profitMargin || ''}
                    onChange={(e) => setProfitMargin(parseFloat(e.target.value) || undefined)}
                    placeholder="20.00"
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Quanto guadagni effettivamente per vendita. Se non inserito, viene stimato dal prezzo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 border-t border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-6 py-2.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            {step > 1 ? 'Indietro' : 'Annulla'}
          </button>
          <button
            onClick={() => step < 3 ? setStep(step + 1) : handleConfirm()}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
          >
            {step < 3 ? 'Continua' : 'Inizia analisi'}
          </button>
        </div>
      </div>
    </div>
  );
}
