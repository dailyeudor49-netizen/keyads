'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Search,
  Target,
  Award,
  BarChart3
} from 'lucide-react';
import { ScoredKeyword } from '@/lib/types';

interface DashboardProps {
  keywords: ScoredKeyword[];
  summary: {
    totalKeywords: number;
    avgVolume: number;
    avgCpc: number;
    avgScore: number;
    eccellentiCount: number;
    buoneCount: number;
  };
  currency: string;
}

const COLORS = {
  eccellente: '#22c55e',
  buona: '#3b82f6',
  moderata: '#eab308',
  scarsa: '#ef4444'
};

export default function Dashboard({ keywords, summary, currency }: DashboardProps) {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;

  // Dati per grafico distribuzione raccomandazioni
  const recommendationData = [
    { name: 'Eccellenti', value: keywords.filter(k => k.recommendationLevel === 'eccellente').length, color: COLORS.eccellente },
    { name: 'Buone', value: keywords.filter(k => k.recommendationLevel === 'buona').length, color: COLORS.buona },
    { name: 'Moderate', value: keywords.filter(k => k.recommendationLevel === 'moderata').length, color: COLORS.moderata },
    { name: 'Scarse', value: keywords.filter(k => k.recommendationLevel === 'scarsa').length, color: COLORS.scarsa },
  ].filter(d => d.value > 0);

  // Top 10 keyword per score
  const topKeywords = keywords.slice(0, 10).map(k => ({
    name: k.keyword.length > 20 ? k.keyword.slice(0, 20) + '...' : k.keyword,
    score: k.profitabilityScore,
    volume: k.volume
  }));

  // Statistiche aggregate
  const stats = [
    {
      label: 'Keyword analizzate',
      value: summary.totalKeywords.toString(),
      icon: <Search className="w-5 h-5" />,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
    },
    {
      label: 'Score medio',
      value: summary.avgScore.toString(),
      icon: <Target className="w-5 h-5" />,
      color: 'text-green-500 bg-green-50 dark:bg-green-900/20'
    },
    {
      label: 'Volume medio',
      value: summary.avgVolume.toLocaleString(),
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20'
    },
    {
      label: 'CPC medio',
      value: `${currencySymbol}${summary.avgCpc.toFixed(2)}`,
      icon: <DollarSign className="w-5 h-5" />,
      color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20'
    },
    {
      label: 'Top keyword',
      value: summary.eccellentiCount.toString(),
      subtext: 'eccellenti',
      icon: <Award className="w-5 h-5" />,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
    },
    {
      label: 'ROI potenziale',
      value: keywords.length > 0 ? `${keywords[0].roiEstimate > 0 ? '+' : ''}${keywords[0].roiEstimate}%` : 'N/A',
      subtext: 'top keyword',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4"
          >
            <div className={`inline-flex p-2 rounded-lg mb-3 ${stat.color}`}>
              {stat.icon}
            </div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {stat.value}
            </div>
            <div className="text-sm text-zinc-500">
              {stat.label}
              {stat.subtext && <span className="block text-xs">{stat.subtext}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Keywords Bar Chart */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Top 10 Keyword per Score
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topKeywords} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recommendation Distribution Pie Chart */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Distribuzione Raccomandazioni
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={recommendationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: '#6b7280' }}
                >
                  {recommendationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {recommendationData.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {item.name} ({item.value})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
