'use client';

import { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Filter,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Copy,
  Check
} from 'lucide-react';
import { ScoredKeyword } from '@/lib/types';
import { exportToCSV } from '@/lib/scoring';

interface KeywordTableProps {
  keywords: ScoredKeyword[];
  currency: string;
}

type SortField = 'keyword' | 'profitabilityScore' | 'volume' | 'cpcAvg' | 'roiEstimate' | 'stabilityScore';
type SortDirection = 'asc' | 'desc';
type FilterRecommendation = 'all' | 'eccellente' | 'buona' | 'moderata' | 'scarsa';

export default function KeywordTable({ keywords, currency }: KeywordTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('profitabilityScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterRecommendation, setFilterRecommendation] = useState<FilterRecommendation>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [copyCount, setCopyCount] = useState(10);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedKeywords = useMemo(() => {
    let filtered = [...keywords];

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(k =>
        k.keyword.toLowerCase().includes(searchLower)
      );
    }

    // Filter by recommendation
    if (filterRecommendation !== 'all') {
      filtered = filtered.filter(k => k.recommendationLevel === filterRecommendation);
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return filtered;
  }, [keywords, search, sortField, sortDirection, filterRecommendation]);

  const handleExport = () => {
    const csv = exportToCSV(filteredAndSortedKeywords, currency);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keywords_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyKeywords = async (count: number) => {
    const keywordsToCopy = filteredAndSortedKeywords
      .slice(0, count)
      .map(k => k.keyword)
      .join(', ');

    try {
      await navigator.clipboard.writeText(keywordsToCopy);
      setCopied(true);
      setShowCopyMenu(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Errore copia:', err);
    }
  };

  const getScoreBadgeColor = (level: string) => {
    switch (level) {
      case 'eccellente':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'buona':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'moderata':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 55) return 'bg-blue-500';
    if (score >= 35) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTrendIcon = (trend: number[]) => {
    if (!trend || trend.length < 2) return <Minus className="w-4 h-4 text-zinc-400" />;
    const recent = trend.slice(-3);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlier = trend.slice(0, 3);
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    if (avg > earlierAvg * 1.1) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (avg < earlierAvg * 0.9) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-zinc-400" />;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca keyword..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              filterRecommendation !== 'all'
                ? 'border-blue-500 text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtri
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Copy Keywords */}
          <div className="relative">
            <button
              onClick={() => setShowCopyMenu(!showCopyMenu)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                copied
                  ? 'border-green-500 text-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiato!' : 'Copia'}
              <ChevronDown className={`w-4 h-4 transition-transform ${showCopyMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCopyMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-10">
                <div className="p-2">
                  <p className="text-xs text-zinc-500 px-2 pb-2">Copia le prime X keyword</p>
                  {[10, 25, 50, 100].map(count => (
                    <button
                      key={count}
                      onClick={() => handleCopyKeywords(Math.min(count, filteredAndSortedKeywords.length))}
                      disabled={filteredAndSortedKeywords.length === 0}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md disabled:opacity-50"
                    >
                      Prime {Math.min(count, filteredAndSortedKeywords.length)} keyword
                    </button>
                  ))}
                  <button
                    onClick={() => handleCopyKeywords(filteredAndSortedKeywords.length)}
                    disabled={filteredAndSortedKeywords.length === 0}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md disabled:opacity-50 border-t border-zinc-200 dark:border-zinc-700 mt-1 pt-2"
                  >
                    Tutte ({filteredAndSortedKeywords.length})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
          >
            <Download className="w-4 h-4" />
            Esporta CSV
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 pt-2">
            {(['all', 'eccellente', 'buona', 'moderata', 'scarsa'] as const).map(level => (
              <button
                key={level}
                onClick={() => setFilterRecommendation(level)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterRecommendation === level
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {level === 'all' ? 'Tutte' : level === 'eccellente' ? 'Eccellenti' : level === 'buona' ? 'Buone' : level === 'moderata' ? 'Moderate' : 'Scarse'}
              </button>
            ))}
          </div>
        )}

        <div className="text-sm text-zinc-500">
          {filteredAndSortedKeywords.length} keyword {filteredAndSortedKeywords.length !== keywords.length && `(${keywords.length} totali)`}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('keyword')}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 dark:hover:text-white"
                >
                  Keyword <SortIcon field="keyword" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('profitabilityScore')}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 dark:hover:text-white"
                >
                  Score <SortIcon field="profitabilityScore" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('volume')}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 dark:hover:text-white"
                >
                  Volume <SortIcon field="volume" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('cpcAvg')}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 dark:hover:text-white"
                >
                  CPC <SortIcon field="cpcAvg" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button
                  onClick={() => handleSort('roiEstimate')}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-900 dark:hover:text-white"
                >
                  ROI <SortIcon field="roiEstimate" />
                </button>
              </th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Trend
                </span>
              </th>
              <th className="text-left px-4 py-3 hidden xl:table-cell">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Note
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredAndSortedKeywords.map((keyword, index) => (
              <tr
                key={index}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 dark:text-white">
                    {keyword.keyword}
                  </div>
                  <div className="lg:hidden mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getScoreBadgeColor(keyword.recommendationLevel)}`}>
                      {keyword.recommendationLevel}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {keyword.profitabilityScore}
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(keyword.profitabilityScore)}`}
                          style={{ width: `${keyword.profitabilityScore}%` }}
                        />
                      </div>
                    </div>
                    <span className={`hidden lg:inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getScoreBadgeColor(keyword.recommendationLevel)}`}>
                      {keyword.recommendationLevel}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-zinc-900 dark:text-white">
                    {keyword.volume.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-zinc-900 dark:text-white">
                    {currencySymbol}{keyword.cpcAvg.toFixed(2)}
                  </span>
                  <div className="text-xs text-zinc-500">
                    {currencySymbol}{keyword.cpcLow.toFixed(2)} - {currencySymbol}{keyword.cpcHigh.toFixed(2)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${
                    keyword.roiEstimate > 50 ? 'text-green-600' :
                    keyword.roiEstimate > 0 ? 'text-blue-600' :
                    'text-red-600'
                  }`}>
                    {keyword.roiEstimate > 0 ? '+' : ''}{keyword.roiEstimate}%
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex items-center gap-2">
                    {getTrendIcon(keyword.trend)}
                    <span className="text-sm text-zinc-500">
                      {keyword.stabilityScore}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden xl:table-cell">
                  <span className="text-sm text-zinc-500">
                    {keyword.reasoning}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedKeywords.length === 0 && (
        <div className="p-8 text-center text-zinc-500">
          Nessuna keyword trovata
        </div>
      )}
    </div>
  );
}
