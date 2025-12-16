'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle, AlertCircle, Key, Copy, ArrowRight } from 'lucide-react';

function SetupContent() {
  const searchParams = useSearchParams();
  const refreshToken = searchParams.get('refresh_token');
  const error = searchParams.get('error');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copiato!');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        {/* Errore */}
        {error && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-800 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              Errore di autenticazione
            </h1>
            <p className="text-zinc-500 mb-6">
              {error === 'no_code' && 'Nessun codice di autorizzazione ricevuto'}
              {error === 'no_refresh_token' && 'Refresh token non ricevuto. Riprova.'}
              {error === 'missing_credentials' && 'Credenziali mancanti nel server'}
              {error === 'token_exchange_failed' && 'Errore nello scambio del token'}
              {!['no_code', 'no_refresh_token', 'missing_credentials', 'token_exchange_failed'].includes(error) && error}
            </p>
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
            >
              Riprova
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Successo - Mostra il token */}
        {refreshToken && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-green-200 dark:border-green-800 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                Autenticazione completata!
              </h1>
              <p className="text-zinc-500">
                Copia il Refresh Token qui sotto e aggiungilo al file .env.local
              </p>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-500">GOOGLE_REFRESH_TOKEN</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-zinc-900 dark:text-white break-all bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  {refreshToken}
                </code>
                <button
                  onClick={() => copyToClipboard(refreshToken)}
                  className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex-shrink-0"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
              <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                Prossimi passi:
              </h3>
              <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
                <li>Copia il token qui sopra</li>
                <li>Apri il file <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">.env.local</code></li>
                <li>Incolla il token nella variabile <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">GOOGLE_REFRESH_TOKEN</code></li>
                <li>Riavvia il server di sviluppo</li>
              </ol>
            </div>

            <a
              href="/"
              className="block w-full text-center px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Torna alla Home
            </a>
          </div>
        )}

        {/* Stato iniziale - Invita a fare login */}
        {!refreshToken && !error && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-6">
              <Key className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              Configura Google Ads API
            </h1>
            <p className="text-zinc-500 mb-6">
              Clicca il pulsante per autorizzare l'accesso al tuo account Google Ads.
              Otterrai un Refresh Token da salvare nel file .env.local
            </p>
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
            >
              Autorizza con Google
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SetupContent />
    </Suspense>
  );
}
