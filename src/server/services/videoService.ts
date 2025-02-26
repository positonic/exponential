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
  'trade-setups': `Below is a transcript of a crypto trading video from an influencer. The transcript contains both trade ideas and non-trading commentary. Please extract a list of trade ideas for each crypto coin or token mentioned. For each coin/token, provide a structured output in JSON format with the following details:
  
  - coin: The name (and symbol, if available) of the cryptocurrency.
  - sentiment: The overall sentiment expressed about the coin (bullish, bearish, or neutral).
  - marketContext: A brief summary of the overall market conditions or context mentioned.
  - tradeSetups: An array of trade setups suggested for that coin. Each trade setup should include:
      - position: The recommended position (Valid values are "long" or "short", otherwise don't return the coin in trade_setups).
      - entryTriggers: Detailed entry triggers, criteria or conditions required to enter the trade. This may be a price level, a technical indicator, or a combination of both.
      - entryPrice: The price at which to enter the trade.
      - timeframe: The timeframe associated with the trade setup. Valid values are "m5", "m15", "m30", "h1", "h4", "h8", "h12", "d1", "d2", "d3", "w", "m", "y".
      - takeProfit: The target price or condition for taking profit.
      - t1: The first target price or condition for taking profit if mentioned.
      - t2: The second target price or condition for taking profit if mentioned.
      - t3: The third target price or condition for taking profit if mentioned.
      - invalidation: Conditions under which the trade setup would be invalidated
      - stopLoss: The stop loss level or condition. Could also be candle close above / below a price level.
      - stopLossPrice: Price to use for stop loss when creating the trade if mentioned.
      - confidenceLevel: Any qualifiers or hedging language mentioned.
      - transcriptExcerpt: A short excerpt supporting this setup.
  
  Additional Instructions:
  
  - Extraction Focus:
      - Identify and extract every crypto coin/token mentioned (e.g., BTC, ETH, LTC, etc.).
      - For each coin, capture every distinct trade idea or setup discussed—even if multiple setups are mentioned for the same coin.
  - Information Details:
      - Capture specific price triggers, technical indicator references (like RSI, moving averages, divergences), and key support/resistance levels.
      - Include any relevant timeframes or contextual comments that influence the trade idea.
  - Filtering:
      - Ignore off-topic commentary, general market chatter, or non-trading-related discussions.
  - Output Format:
      - Please present your final output in a clean, structured JSON format that follows the example below.
  - generalMarketContext 
      - Brief overall summary of market conditions
      - Exclude casual chitchat like "Hey guys, so today we're going to talk about a few different coins."
  
  Example Output:
  {
    generalMarketContext: "Potential short squeeze with resistance around 99k.",
    coins: [
      {
          "coin": "BTC",
          "sentiment": "bullish",
          "marketContext": "Potential short squeeze with resistance around 99k.",
          "tradeSetups": [
              {
                  "position": "long",
                  "entryTriggers": "Price breaking above 99k accompanied by RSI momentum, Confirmation on 12-hour chart with a close above 100k",
                  "entryPrice": "99100",
                  "timeframe": "12-hour",
                  "takeProfit": "Target around 105k",
                  "t1": "105000",
                  "t2": "110000",
                  "t3": "115000",
                  "stopLoss": "Below 98k",
                  "stopLossPrice": 98000,
                  "invalidation": "If RSI drops significantly or a candle closes below 98. h12 close below 98000",
                  "confidenceLevel": "cautiously optimistic",
                  "transcriptExcerpt": "BTC is still facing a challenge around 99k..."
              }
          ]
      }
    ]
  }
  
  Remember: Output only the JSON.
  
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
    console.log("createVideo: summaryType is ", summaryType)
    console.log("createVideo: responseFormat is ", responseFormat)
    console.log("createVideo: Full prompt is ", `${getPrompt(summaryType)}${transcription}`)
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
    console.log("createVideo: content is ", content)
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
    // First, check if a video with this URL already exists
    const existingVideo = await this.prisma.video.findFirst({
      where: { videoUrl: data.videoUrl }
    });
    console.log("createVideo: existingVideo is ", existingVideo?.videoUrl)
    
    if (existingVideo) {
      // Check if the user-video relation already exists
      const existingUserVideo = await this.prisma.userVideo.findFirst({
        where: {
          userId: data.userId,
          videoId: existingVideo.id
        }
      });

      // Only create the relation if it doesn't exist
      if (!existingUserVideo) {
        await this.prisma.userVideo.create({
          data: {
            userId: data.userId,
            videoId: existingVideo.id
          }
        });
      }
      return existingVideo;
    }

    // If video doesn't exist, create it and the UserVideo relation
    return await this.prisma.$transaction(async (tx) => {
      const video = await tx.video.create({
        data: {
          id: data.id,
          slug: data.slug,
          title: data.title,
          videoUrl: data.videoUrl,
          transcription: data.transcription,
          status: data.status,
          isSearchable: data.isSearchable,
          users: {
            create: {
              userId: data.userId
            }
          }
        }
      });
      return video;
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
    return await this.prisma.video.findUnique({
      where: { id },
      include: {
        userVideos: {
          include: {
            user: true
          }
        }
      }
    });
  }

  async getVideoBySlug(slug: string) {
    return await this.prisma.video.findFirst({
      where: { slug },
      include: {
        userVideos: {
          include: {
            user: true
          }
        }
      }
    });
  }

  async getVideos() {
    return await this.prisma.video.findMany({
      include: {
        userVideos: {
          include: {
            user: true
          }
        }
      }
    });
  }

  async deleteVideo(id: string) {
    return await this.prisma.video.delete({
      where: { id }
    });
  }
}
