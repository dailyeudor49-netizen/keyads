'use client';

import { useState } from 'react';
import { Plus, Trash2, Link, Loader2, AlertCircle } from 'lucide-react';

interface InputFormProps {
  onSubmit: (urls: string[]) => void;
  isLoading: boolean;
}

export default function InputForm({ onSubmit, isLoading }: InputFormProps) {
  const [urls, setUrls] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    // Rimuovi www. iniziale se presente senza protocollo
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    // Aggiungi https:// se manca il protocollo
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

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);

    // Clear error when typing
    if (errors[index]) {
      const newErrors = { ...errors };
      delete newErrors[index];
      setErrors(newErrors);
    }
  };

  const addUrl = () => {
    if (urls.length < 10) {
      setUrls([...urls, '']);
    }
  };

  const removeUrl = (index: number) => {
    if (urls.length > 1) {
      const newUrls = urls.filter((_, i) => i !== index);
      setUrls(newUrls);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all URLs
    const newErrors: Record<number, string> = {};
    const validUrls: string[] = [];

    urls.forEach((url, index) => {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        if (urls.length === 1 || (urls.filter(u => u.trim()).length === 0)) {
          newErrors[index] = 'Inserisci un URL';
        }
      } else if (!validateUrl(trimmedUrl)) {
        newErrors[index] = 'URL non valido';
      } else {
        // Normalizza l'URL prima di aggiungerlo
        validUrls.push(normalizeUrl(trimmedUrl));
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (validUrls.length === 0) {
      setErrors({ 0: 'Inserisci almeno un URL valido' });
      return;
    }

    onSubmit(validUrls);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {urls.map((url, index) => (
          <div key={index} className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                <Link className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                placeholder="https://esempio.com/prodotto"
                disabled={isLoading}
                className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 ${
                  errors[index]
                    ? 'border-red-500'
                    : 'border-zinc-200 dark:border-zinc-700'
                }`}
              />
              {errors[index] && (
                <div className="flex items-center gap-1 mt-1 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {errors[index]}
                </div>
              )}
            </div>
            {urls.length > 1 && (
              <button
                type="button"
                onClick={() => removeUrl(index)}
                disabled={isLoading}
                className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {urls.length < 10 && (
        <button
          type="button"
          onClick={addUrl}
          disabled={isLoading}
          className="flex items-center gap-2 text-blue-500 hover:text-blue-600 text-sm font-medium disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Aggiungi altro URL
        </button>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Analisi in corso...
          </>
        ) : (
          'Analizza keyword'
        )}
      </button>

      <p className="text-xs text-center text-zinc-500">
        Inserisci i link delle pagine prodotto o landing page da analizzare
      </p>
    </form>
  );
}
