import { CampaignConfig, CampaignGoal, KeywordData, ScoredKeyword } from './types';

// Pesi per ogni metrica in base all'obiettivo della campagna
// Volume è sempre la metrica principale, gli altri fattori variano per obiettivo
const GOAL_WEIGHTS: Record<CampaignGoal, {
  roi: number;
  volume: number;
  cpc: number;
  stability: number;
  competition: number;
}> = {
  conversions: {
    volume: 0.35,     // Volume sempre importante
    roi: 0.30,        // ROI per conversioni
    cpc: 0.15,        // CPC impatta sul CPA
    stability: 0.10,
    competition: 0.10
  },
  traffic: {
    volume: 0.40,     // Volume prioritario per traffico
    cpc: 0.30,        // CPC basso = più click
    roi: 0.10,
    stability: 0.10,
    competition: 0.10
  },
  awareness: {
    volume: 0.50,     // Massimo volume per awareness
    stability: 0.15,
    cpc: 0.15,
    competition: 0.15,
    roi: 0.05
  },
  engagement: {
    volume: 0.35,     // Volume importante
    roi: 0.20,
    cpc: 0.20,
    stability: 0.15,
    competition: 0.10
  }
};

// Calcola il punteggio di stabilità dal trend
function calculateStabilityScore(trend: number[]): number {
  if (!trend || trend.length < 2) return 50;

  // Calcola la varianza
  const avg = trend.reduce((a, b) => a + b, 0) / trend.length;
  const variance = trend.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / trend.length;
  const stdDev = Math.sqrt(variance);

  // Meno varianza = più stabilità
  // stdDev di 0 = score 100, stdDev di 30+ = score basso
  const stabilityScore = Math.max(0, Math.min(100, 100 - (stdDev * 2)));

  return Math.round(stabilityScore);
}

// Calcola il margine effettivo (usa quello inserito o stima dal prezzo)
function getEffectiveMargin(productPrice: number, profitMargin?: number): number {
  if (profitMargin && profitMargin > 0) {
    return profitMargin;
  }
  // Stima margine come 30% del prezzo se non specificato
  return productPrice * 0.30;
}

// Calcola il punteggio ROI stimato basato sul MARGINE REALE
function calculateRoiScore(keyword: KeywordData, productPrice: number, profitMargin?: number): number {
  const margin = getEffectiveMargin(productPrice, profitMargin);

  // Stima conversion rate in base alla competizione
  const estimatedConversionRate = keyword.competition === 'low' ? 0.04 :
    keyword.competition === 'medium' ? 0.03 : 0.02;

  // Costo per 100 click
  const costPer100Clicks = keyword.cpcAvg * 100;

  // Profitto stimato per 100 click (basato sul MARGINE, non sul prezzo)
  const conversions = 100 * estimatedConversionRate;
  const profit = conversions * margin;

  // ROI = (Profitto - Costo) / Costo * 100
  const roi = costPer100Clicks > 0 ? ((profit - costPer100Clicks) / costPer100Clicks) * 100 : 0;

  // Converti ROI in score 0-100
  const roiScore = Math.max(0, Math.min(100, 50 + (roi / 2)));

  return Math.round(roiScore);
}

// Calcola il ROI numerico per display
function calculateRoiEstimate(keyword: KeywordData, productPrice: number, profitMargin?: number): number {
  const margin = getEffectiveMargin(productPrice, profitMargin);

  const estimatedConversionRate = keyword.competition === 'low' ? 0.04 :
    keyword.competition === 'medium' ? 0.03 : 0.02;

  const costPer100Clicks = keyword.cpcAvg * 100;
  const conversions = 100 * estimatedConversionRate;
  const profit = conversions * margin;

  if (costPer100Clicks <= 0) return 0;
  return Math.round(((profit - costPer100Clicks) / costPer100Clicks) * 100);
}

// Calcola score normalizzato per CPC (più basso = meglio)
function calculateCpcScore(cpc: number, avgCpcInCategory: number): number {
  // Se CPC è metà della media = score 100
  // Se CPC è doppio della media = score 0
  const ratio = cpc / avgCpcInCategory;
  const score = Math.max(0, Math.min(100, (2 - ratio) * 50));
  return Math.round(score);
}

// Calcola score per volume
function calculateVolumeScore(volume: number): number {
  // Log scale per volume
  // 100 ricerche = ~50, 1000 = ~70, 10000 = ~90
  if (volume <= 0) return 0;
  const score = Math.min(100, 20 * Math.log10(volume + 1));
  return Math.round(score);
}

// Calcola score per competizione (bassa = meglio per ROI)
function calculateCompetitionScore(competitionIndex: number): number {
  return Math.round(100 - competitionIndex);
}

// Assegna livelli basati su valutazione ASSOLUTA + CONTESTUALE
// Valuta ogni keyword in base a: score, ROI, volume contestuale al margine, CPC sostenibile
function assignProfitabilityLevels(
  keywords: ScoredKeyword[],
  margin: number,
  goal: CampaignGoal
): void {
  if (keywords.length === 0) return;

  // Soglie di volume contestuali al margine
  // Margine alto (>50€) = nicchia, volume basso accettabile
  // Margine medio (20-50€) = volume medio necessario
  // Margine basso (<20€) = serve volume alto per guadagnare
  const volumeSogliaEccellente = margin > 50 ? 200 : margin > 20 ? 500 : 1000;
  const volumeSogliaBuona = margin > 50 ? 100 : margin > 20 ? 250 : 500;
  const volumeSogliaMinima = margin > 50 ? 50 : margin > 20 ? 100 : 200;

  // CPC massimo sostenibile (basato sul margine e conversion rate stimato ~3%)
  const cpcMaxSostenibile = margin * 0.03;

  keywords.forEach(kw => {
    const score = kw.profitabilityScore;
    const roiPositivo = kw.roiEstimate > 0;
    const roiOttimo = kw.roiEstimate > 30;
    const volumeEccellente = kw.volume >= volumeSogliaEccellente;
    const volumeBuono = kw.volume >= volumeSogliaBuona;
    const volumeMinimo = kw.volume >= volumeSogliaMinima;
    const cpcSostenibile = kw.cpcAvg <= cpcMaxSostenibile;
    const cpcAccettabile = kw.cpcAvg <= cpcMaxSostenibile * 2;
    const competizioneBassa = kw.competition === 'low' || kw.competition === 'medium';

    // ECCELLENTE: score alto + profittevole per questo prodotto
    // Keyword che vale assolutamente la pena usare
    if (score >= 60 && (roiPositivo || volumeEccellente) && (cpcSostenibile || volumeEccellente)) {
      kw.recommendationLevel = 'eccellente';
    }
    // Anche con score medio-alto se ha ottimi indicatori di profittabilità
    else if (score >= 50 && roiOttimo && volumeBuono) {
      kw.recommendationLevel = 'eccellente';
    }
    // BUONA: keyword valida, da considerare seriamente
    else if (score >= 50 && (roiPositivo || volumeBuono)) {
      kw.recommendationLevel = 'buona';
    }
    else if (score >= 45 && volumeBuono && cpcAccettabile) {
      kw.recommendationLevel = 'buona';
    }
    else if (score >= 40 && roiOttimo) {
      kw.recommendationLevel = 'buona';
    }
    // MODERATA: può funzionare, da valutare caso per caso
    else if (score >= 35 && (volumeMinimo || roiPositivo || competizioneBassa)) {
      kw.recommendationLevel = 'moderata';
    }
    else if (score >= 30 && volumeBuono) {
      kw.recommendationLevel = 'moderata';
    }
    else if (volumeMinimo && cpcAccettabile) {
      kw.recommendationLevel = 'moderata';
    }
    // SCARSA: probabilmente non vale l'investimento per questo prodotto
    else {
      kw.recommendationLevel = 'scarsa';
    }
  });
}

// Genera reasoning automatico
function generateReasoning(
  keyword: ScoredKeyword,
  config: CampaignConfig
): string {
  const parts: string[] = [];

  // Commento sul volume
  if (keyword.volume > 5000) {
    parts.push('Alto volume di ricerca');
  } else if (keyword.volume > 1000) {
    parts.push('Volume di ricerca discreto');
  } else {
    parts.push('Volume limitato ma mirato');
  }

  // Commento sul CPC
  if (keyword.cpcAvg < 0.5) {
    parts.push('CPC molto conveniente');
  } else if (keyword.cpcAvg > 2) {
    parts.push('CPC elevato');
  }

  // Commento sulla competizione
  if (keyword.competition === 'low') {
    parts.push('bassa competizione');
  } else if (keyword.competition === 'high') {
    parts.push('alta competizione');
  }

  // Commento sul ROI per campagne conversioni
  if (config.goal === 'conversions') {
    if (keyword.roiEstimate > 50) {
      parts.push('ROI potenzialmente alto');
    } else if (keyword.roiEstimate < 0) {
      parts.push('attenzione al ROI');
    }
  }

  // Commento sulla stabilità
  if (keyword.stabilityScore > 70) {
    parts.push('trend stabile');
  } else if (keyword.stabilityScore < 40) {
    parts.push('trend instabile');
  }

  return parts.join(', ') + '.';
}

// Funzione principale di scoring
export function scoreKeywords(
  keywords: KeywordData[],
  config: CampaignConfig
): ScoredKeyword[] {
  const weights = GOAL_WEIGHTS[config.goal];
  const margin = getEffectiveMargin(config.productPrice, config.profitMargin);

  // Calcola CPC medio per normalizzazione
  const avgCpc = keywords.reduce((sum, k) => sum + k.cpcAvg, 0) / keywords.length || 1;

  // Calcola soglie dinamiche basate sul margine
  // Keyword è "buona" se con 100 click puoi fare profitto
  const targetCpcForProfit = margin * 0.03; // CPC target = margine * conversion rate stimato

  const scored: ScoredKeyword[] = keywords.map(keyword => {
    // Calcola i singoli score
    const stabilityScore = calculateStabilityScore(keyword.trend);
    const roiScore = calculateRoiScore(keyword, config.productPrice, config.profitMargin);
    const cpcScore = calculateCpcScore(keyword.cpcAvg, avgCpc);
    const volumeScore = calculateVolumeScore(keyword.volume);
    const competitionScore = calculateCompetitionScore(keyword.competitionIndex);

    // Calcola il profitability score pesato
    const profitabilityScore = Math.round(
      (roiScore * weights.roi) +
      (volumeScore * weights.volume) +
      (cpcScore * weights.cpc) +
      (stabilityScore * weights.stability) +
      (competitionScore * weights.competition)
    );

    // Calcola ROI estimate numerico basato sul MARGINE REALE
    const roiEstimate = calculateRoiEstimate(keyword, config.productPrice, config.profitMargin);

    const scoredKeyword: ScoredKeyword = {
      ...keyword,
      profitabilityScore,
      roiEstimate,
      stabilityScore,
      recommendationLevel: 'moderata', // Placeholder, verrà assegnato dopo
      reasoning: ''
    };

    return scoredKeyword;
  });

  // Ordina per profitability score decrescente
  scored.sort((a, b) => b.profitabilityScore - a.profitabilityScore);

  // Assegna i livelli di raccomandazione basati sulla PROFITTABILITÀ REALE
  assignProfitabilityLevels(scored, margin, config.goal);

  // Genera reasoning per ogni keyword
  scored.forEach(kw => {
    kw.reasoning = generateReasoning(kw, config);
  });

  return scored;
}

// Genera statistiche di riepilogo
export function generateSummary(keywords: ScoredKeyword[]) {
  const eccellenti = keywords.filter(k => k.recommendationLevel === 'eccellente');
  const buone = keywords.filter(k => k.recommendationLevel === 'buona');

  return {
    totalKeywords: keywords.length,
    avgVolume: Math.round(keywords.reduce((sum, k) => sum + k.volume, 0) / keywords.length),
    avgCpc: +(keywords.reduce((sum, k) => sum + k.cpcAvg, 0) / keywords.length).toFixed(2),
    avgScore: Math.round(keywords.reduce((sum, k) => sum + k.profitabilityScore, 0) / keywords.length),
    eccellentiCount: eccellenti.length,
    buoneCount: buone.length,
    topRecommendations: keywords.slice(0, 10)
  };
}

// Esporta in CSV
export function exportToCSV(keywords: ScoredKeyword[], currency: string): string {
  const headers = [
    'Keyword',
    'Score',
    'Raccomandazione',
    'Volume',
    'CPC Medio (' + currency + ')',
    'Competizione',
    'ROI Stimato %',
    'Stabilità',
    'Note'
  ];

  const rows = keywords.map(k => [
    k.keyword,
    k.profitabilityScore,
    k.recommendationLevel,
    k.volume,
    k.cpcAvg.toFixed(2),
    k.competition,
    k.roiEstimate,
    k.stabilityScore,
    k.reasoning
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell =>
      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
    ).join(','))
  ].join('\n');

  return csvContent;
}
