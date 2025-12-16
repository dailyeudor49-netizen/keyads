'use client';

import { AlertTriangle, XCircle, Clock, Ban, Home, RefreshCw } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  error: string;
  onGoHome: () => void;
  onRetry?: () => void;
}

// Mappa errori a tipologie per icona e colore
function getErrorType(error: string): {
  type: 'quota' | 'network' | 'validation' | 'generic';
  icon: typeof AlertTriangle;
  title: string;
  color: string;
  bgColor: string;
  suggestion: string;
} {
  const lowerError = error.toLowerCase();

  // Errori di quota/rate limit
  if (
    lowerError.includes('429') ||
    lowerError.includes('quota') ||
    lowerError.includes('rate limit') ||
    lowerError.includes('too many') ||
    lowerError.includes('exceeded') ||
    lowerError.includes('limit')
  ) {
    return {
      type: 'quota',
      icon: Clock,
      title: 'Limite API raggiunto',
      color: 'text-amber-500',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      suggestion: 'Hai raggiunto il limite di richieste. Attendi qualche minuto e riprova.'
    };
  }

  // Errori di rete/servizio non disponibile
  if (
    lowerError.includes('503') ||
    lowerError.includes('500') ||
    lowerError.includes('network') ||
    lowerError.includes('fetch') ||
    lowerError.includes('timeout') ||
    lowerError.includes('unavailable')
  ) {
    return {
      type: 'network',
      icon: XCircle,
      title: 'Servizio non disponibile',
      color: 'text-red-500',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      suggestion: 'Il servizio AI non risponde. Riprova tra qualche istante.'
    };
  }

  // Errori di validazione/input
  if (
    lowerError.includes('nessun') ||
    lowerError.includes('non sono riuscito') ||
    lowerError.includes('non valido') ||
    lowerError.includes('url')
  ) {
    return {
      type: 'validation',
      icon: Ban,
      title: 'Errore nei dati',
      color: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      suggestion: 'Controlla gli URL inseriti e assicurati che le pagine siano accessibili.'
    };
  }

  // Errore generico
  return {
    type: 'generic',
    icon: AlertTriangle,
    title: 'Si è verificato un errore',
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    suggestion: 'Qualcosa è andato storto. Riprova o contatta il supporto.'
  };
}

export default function ErrorModal({ isOpen, error, onGoHome, onRetry }: ErrorModalProps) {
  if (!isOpen) return null;

  const errorInfo = getErrorType(error);
  const IconComponent = errorInfo.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop con blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header con icona */}
        <div className={`${errorInfo.bgColor} px-6 py-8 flex flex-col items-center`}>
          <div className={`p-4 rounded-full bg-white dark:bg-zinc-800 shadow-lg mb-4`}>
            <IconComponent className={`w-10 h-10 ${errorInfo.color}`} />
          </div>
          <h2 className={`text-xl font-bold ${errorInfo.color.replace('text-', 'text-').replace('-500', '-700')} dark:${errorInfo.color}`}>
            {errorInfo.title}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Error message box */}
          <div className="mb-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 font-mono break-words">
              {error}
            </p>
          </div>

          {/* Suggestion */}
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6">
            {errorInfo.suggestion}
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {onRetry && errorInfo.type !== 'validation' && (
              <button
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Riprova
              </button>
            )}
            <button
              onClick={onGoHome}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                onRetry && errorInfo.type !== 'validation'
                  ? 'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  : 'text-white bg-blue-500 hover:bg-blue-600'
              }`}
            >
              <Home className="w-4 h-4" />
              Torna alla home
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-xs text-zinc-400 text-center">
            Codice errore: {errorInfo.type.toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
}
