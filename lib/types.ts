// Tipi per la configurazione campagna
export type CampaignGoal =
  | 'conversions'    // Vendite/Lead
  | 'traffic'        // Visite al sito
  | 'awareness'      // Brand awareness
  | 'engagement';    // Interazioni

export type CampaignType =
  | 'search'         // Rete di ricerca
  | 'shopping'       // Shopping
  | 'display'        // Display
  | 'performance_max' // Performance Max
  | 'demand_gen';    // Demand Gen (Discovery + YouTube + Gmail)

export interface CampaignConfig {
  goal: CampaignGoal;
  type: CampaignType;
  productPrice: number;
  profitMargin?: number; // Margine di guadagno (opzionale) - se non inserito, stima dal prezzo
  currency: string;
  country: string;
}

// Tipi per le keyword
export interface KeywordData {
  keyword: string;
  volume: number;           // Volume di ricerca mensile
  competition: 'low' | 'medium' | 'high';
  competitionIndex: number; // 0-100
  cpcLow: number;          // CPC minimo
  cpcHigh: number;         // CPC massimo
  cpcAvg: number;          // CPC medio
  trend: number[];         // Trend ultimi 12 mesi (valori 0-100)
}

export interface ScoredKeyword extends KeywordData {
  profitabilityScore: number;  // Score 0-100
  roiEstimate: number;         // ROI stimato %
  stabilityScore: number;      // Stabilità del trend 0-100
  recommendationLevel: 'eccellente' | 'buona' | 'moderata' | 'scarsa';
  reasoning: string;           // Spiegazione AI
}

// Tipi per l'input utente
export interface UrlInput {
  url: string;
  content?: string;
  extractedKeywords?: string[];
}

export interface AnalysisRequest {
  urls: UrlInput[];
  campaignConfig: CampaignConfig;
}

export interface AnalysisResponse {
  seedKeywords: string[];
  keywords: ScoredKeyword[];
  summary: {
    totalKeywords: number;
    avgVolume: number;
    avgCpc: number;
    topRecommendations: ScoredKeyword[];
  };
}

// Tipi per lo scraping
export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  content: string;
  success: boolean;
  error?: string;
}

// Paesi e valute supportati
export const SUPPORTED_COUNTRIES = [
  // Europa Occidentale
  { code: 'IT', name: 'Italia', currency: 'EUR' },
  { code: 'DE', name: 'Germania', currency: 'EUR' },
  { code: 'FR', name: 'Francia', currency: 'EUR' },
  { code: 'ES', name: 'Spagna', currency: 'EUR' },
  { code: 'PT', name: 'Portogallo', currency: 'EUR' },
  { code: 'NL', name: 'Paesi Bassi', currency: 'EUR' },
  { code: 'BE', name: 'Belgio', currency: 'EUR' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'CH', name: 'Svizzera', currency: 'CHF' },
  { code: 'GB', name: 'Regno Unito', currency: 'GBP' },
  { code: 'IE', name: 'Irlanda', currency: 'EUR' },
  // Europa Nord-Est
  { code: 'PL', name: 'Polonia', currency: 'PLN' },
  { code: 'CZ', name: 'Repubblica Ceca', currency: 'CZK' },
  { code: 'SK', name: 'Slovacchia', currency: 'EUR' },
  { code: 'HU', name: 'Ungheria', currency: 'HUF' },
  { code: 'RO', name: 'Romania', currency: 'RON' },
  { code: 'BG', name: 'Bulgaria', currency: 'BGN' },
  { code: 'HR', name: 'Croazia', currency: 'EUR' },
  { code: 'SI', name: 'Slovenia', currency: 'EUR' },
  { code: 'RS', name: 'Serbia', currency: 'RSD' },
  // Baltici
  { code: 'LT', name: 'Lituania', currency: 'EUR' },
  { code: 'LV', name: 'Lettonia', currency: 'EUR' },
  { code: 'EE', name: 'Estonia', currency: 'EUR' },
  // Scandinavia
  { code: 'SE', name: 'Svezia', currency: 'SEK' },
  { code: 'NO', name: 'Norvegia', currency: 'NOK' },
  { code: 'DK', name: 'Danimarca', currency: 'DKK' },
  { code: 'FI', name: 'Finlandia', currency: 'EUR' },
  // Altri Europa
  { code: 'GR', name: 'Grecia', currency: 'EUR' },
  { code: 'UA', name: 'Ucraina', currency: 'UAH' },
  // Altri continenti (generici)
  { code: 'US', name: 'Stati Uniti', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'BR', name: 'Brasile', currency: 'BRL' },
  { code: 'MX', name: 'Messico', currency: 'MXN' },
] as const;

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dollaro USA' },
  { code: 'GBP', symbol: '£', name: 'Sterlina' },
  { code: 'CHF', symbol: 'CHF', name: 'Franco Svizzero' },
  { code: 'PLN', symbol: 'zł', name: 'Zloty Polacco' },
  { code: 'CZK', symbol: 'Kč', name: 'Corona Ceca' },
  { code: 'HUF', symbol: 'Ft', name: 'Fiorino Ungherese' },
  { code: 'RON', symbol: 'lei', name: 'Leu Romeno' },
  { code: 'BGN', symbol: 'лв', name: 'Lev Bulgaro' },
  { code: 'RSD', symbol: 'дин', name: 'Dinaro Serbo' },
  { code: 'SEK', symbol: 'kr', name: 'Corona Svedese' },
  { code: 'NOK', symbol: 'kr', name: 'Corona Norvegese' },
  { code: 'DKK', symbol: 'kr', name: 'Corona Danese' },
  { code: 'UAH', symbol: '₴', name: 'Grivnia Ucraina' },
  { code: 'BRL', symbol: 'R$', name: 'Real Brasiliano' },
  { code: 'MXN', symbol: '$', name: 'Peso Messicano' },
  { code: 'AUD', symbol: 'A$', name: 'Dollaro Australiano' },
  { code: 'CAD', symbol: 'C$', name: 'Dollaro Canadese' },
] as const;

export const CAMPAIGN_GOALS = [
  {
    id: 'conversions' as const,
    name: 'Conversioni',
    description: 'Vendite, lead, iscrizioni',
    priorityMetrics: ['roi', 'cpa', 'conversion_rate']
  },
  {
    id: 'traffic' as const,
    name: 'Traffico',
    description: 'Portare visite al sito',
    priorityMetrics: ['cpc', 'volume', 'ctr']
  },
  {
    id: 'awareness' as const,
    name: 'Brand Awareness',
    description: 'Far conoscere il brand',
    priorityMetrics: ['volume', 'impressions', 'reach']
  },
  {
    id: 'engagement' as const,
    name: 'Engagement',
    description: 'Interazioni e coinvolgimento',
    priorityMetrics: ['ctr', 'engagement_rate', 'volume']
  },
] as const;

export const CAMPAIGN_TYPES = [
  { id: 'search' as const, name: 'Ricerca', description: 'Annunci testuali su Google' },
  { id: 'shopping' as const, name: 'Shopping', description: 'Annunci prodotto con immagine' },
  { id: 'display' as const, name: 'Display', description: 'Banner su siti partner' },
  { id: 'performance_max' as const, name: 'Performance Max', description: 'Campagna automatizzata multi-canale' },
  { id: 'demand_gen' as const, name: 'Demand Gen', description: 'Discovery, YouTube e Gmail Ads' },
] as const;

// ============================================
// TIPI PER COPY GENERATION (Meta + Google Ads)
// ============================================

export interface CountryPricing {
  countryCode: string;
  currency: string;
  finalPrice: number;
  originalPrice?: number; // Prezzo scontato (opzionale)
}

export interface CopyGenerationRequest {
  landingUrl: string;
  competitorUrls?: string[];
  countries: CountryPricing[];
}

// Struttura per un singolo angle Facebook
export interface FacebookAngle {
  angleName: string;
  angleDescription: string;
  primaryText1: string;
  primaryText2: string; // Variante A/B
  headline: string;
  description: string;
}

// Struttura per Google Demand Gen
export interface GoogleDemandGen {
  titles: string[];        // 5 titoli (≤40 caratteri)
  descriptions: string[];  // 5 descrizioni (≤90 caratteri)
  longTitles: string[];    // 5 titoli lunghi video (≤90 caratteri)
}

// Risultati per singola nazione
export interface CountryCopyResult {
  countryCode: string;
  countryName: string;
  language: string;
  currency: string;
  finalPrice: number;
  originalPrice?: number;
  landingTakeaways: string;
  competitorSnapshot?: string;
  facebookAngles: FacebookAngle[];
  googleDemandGen: GoogleDemandGen;
}

// Risposta completa della generazione copy
export interface CopyGenerationResponse {
  results: CountryCopyResult[];
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  landingContent?: string; // Contenuto landing per rigenerazioni future
}
