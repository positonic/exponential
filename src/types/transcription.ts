interface TradeSetup {
    position: 'long' | 'short' | 'abstain';
    entryTriggers: string;
    entryPrice: string;
    timeframe: string;
    takeProfit: string;
    t1: string;
    t2: string;
    t3: string;
    stopLoss: string;
    stopLossPrice: number;
    invalidation: string;
    confidenceLevel: string;
    transcriptExcerpt: string;
}

interface CoinAnalysis {
    coin: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    marketContext: string;
    tradeSetups: TradeSetup[];
}

export interface TranscriptionSummary {
    generalMarketContext: string;
    coins: CoinAnalysis[];
}
