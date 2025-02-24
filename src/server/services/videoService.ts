import { type PrismaClient } from "@prisma/client";

// Define types based on Prisma schema
type VideoCreateInput = {
  id?: string;
  slug?: string;
  title?: string;
  videoUrl: string;
  transcription?: string;
  status: string;
  userId: string;
  isSearchable?: boolean;
};

type VideoUpdateInput = {
  slug?: string;
  title?: string;
  videoUrl?: string;
  transcription?: string;
  status?: string;
  isSearchable?: boolean;
  updatedAt?: Date;
};

type TranscriptionSummary = {
  generalMarketContext: string;
  coins: Array<{
    coin: string;
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
};

const prompts = {
  'trade-setups': `Please analyze this crypto trading video transcript and extract the following information in JSON format:

1. generalMarketContext: A brief overview of the current market conditions and sentiment discussed
2. coins: An array of objects for each cryptocurrency discussed, containing:
   - symbol: The cryptocurrency symbol (e.g., "BTC", "ETH")
   - analysis: Key points about the coin's current situation and analysis
   - tradeSetup: Object containing:
     - entry: Suggested entry price or range
     - stopLoss: Suggested stop loss level
     - targets: Array of price targets

Please structure the response as a JSON object with these exact fields. Output only the JSON.

Transcript:`,

  'basic': `Please provide a concise summary of the following transcript in two parts:

1. First, give me a 3-line overview that captures the main essence of the content.
2. Then, list 3-5 key bullet points highlighting the most important specific information or takeaways.

Keep the summary clear and focused, avoiding any unnecessary details.

Transcript:`
} as const;

const getPrompt = (summaryType: string): string => {
  return summaryType in prompts ? prompts[summaryType as keyof typeof prompts] : prompts.basic;
};

export async function summarizeTranscription(transcription: string, summaryType: string): Promise<TranscriptionSummary> {
    const responseFormat = summaryType === 'trade-setups' ? { type: "json_object" } : { type: "text" }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a crypto trading analysis assistant that extracts structured trade ideas from video transcripts. You focus on identifying specific trade setups, entry/exit points, and market context for each cryptocurrency mentioned."
                },
                {
                    role: "user",
                    content: `${getPrompt(summaryType)}${transcription}`
                }
            ],
            temperature: 0.7,
            max_tokens: 1500,
            response_format: responseFormat,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    
    if (!content.generalMarketContext || !Array.isArray(content.coins)) {
        throw new Error('Invalid response format from OpenAI');
    }

    return content;
}

export class VideoService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createVideo(data: VideoCreateInput) {
    return this.prisma.video.create({
      data
    });
  }

  async updateVideo(id: string, data: VideoUpdateInput) {
    return this.prisma.video.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  async getVideo(id: string) {
    return this.prisma.video.findUnique({
      where: { id }
    });
  }

  async getVideoBySlug(slug: string) {
    return this.prisma.video.findFirst({
      where: { slug }
    });
  }

  async getVideos() {
    return this.prisma.video.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async deleteVideo(id: string) {
    return this.prisma.video.delete({
      where: { id }
    });
  }
}
