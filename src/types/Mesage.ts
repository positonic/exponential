export interface Message {
    type: 'system' | 'human' | 'ai' | 'tool';
    content: string;
    tool_call_id?: string;
    name?: string;
    tradeSetups?: MarketScanResult | null;
}

export interface MarketScanResult {
  generalMarketContext: string;
  coins: Array<{
    coinSymbol: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    marketContext: string;
    tradeSetups: Array<{
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
    }>;
  }>;
}

export interface CoinSetup {
  position: string;
  entryTriggers: string;
  entryPrice: string;
  timeframe: string;
  takeProfit: string;
  t1?: string;
  stopLoss: string;
  stopLossPrice?: number;
  invalidation: string;
  confidenceLevel: string;
  transcriptExcerpt: string;
}

export interface CoinData {
  coinSymbol: string;
  sentiment: string;
  marketContext: string;
  tradeSetups: CoinSetup[];
}

export interface ChatToolResult {
  toolName: string;
  result: string;
}

export interface ChatResponse {
  validToolResults?: ChatToolResult[];
  response: string | Record<string, unknown>;
}