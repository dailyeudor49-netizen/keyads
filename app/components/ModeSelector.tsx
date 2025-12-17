'use client';

import { Search, PenTool } from 'lucide-react';

export type AppMode = 'keywords' | 'copy';

interface ModeSelectorProps {
  onSelect: (mode: AppMode) => void;
}

export default function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">
          Cosa vuoi generare?
        </h2>
        <p className="text-zinc-500">
          Scegli se analizzare keyword per Google Ads o generare copy pubblicitari per Meta e Google
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Keyword Generator */}
        <button
          onClick={() => onSelect('keywords')}
          className="group p-6 bg-white dark:bg-zinc-900 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all text-left"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl group-hover:bg-blue-500 transition-colors">
              <Search className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                Genera Keywords
              </h3>
              <p className="text-sm text-zinc-500 mb-4">
                Analizza le tue landing page e trova le keyword più profittevoli per Google Ads
              </p>
              <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Analisi AI delle pagine prodotto
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Stima volume, CPC e competizione
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Score di profittabilità
                </li>
              </ul>
            </div>
          </div>
        </button>

        {/* Copy Generator */}
        <button
          onClick={() => onSelect('copy')}
          className="group p-6 bg-white dark:bg-zinc-900 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-500 transition-all text-left"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl group-hover:bg-purple-500 transition-colors">
              <PenTool className="w-6 h-6 text-purple-600 dark:text-purple-400 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                Genera Copy Ads
              </h3>
              <p className="text-sm text-zinc-500 mb-4">
                Crea copy persuasivi per Meta Ads e Google Demand Gen in più lingue
              </p>
              <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                  4 angle Facebook con varianti A/B
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                  Titoli e descrizioni Google
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                  Multi-lingua automatico
                </li>
              </ul>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
