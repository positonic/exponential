import { type PrismaClient } from "@prisma/client";
import type { Caption } from "~/utils/vttParser";
import type { TranscriptionSummary, TranscriptionSetups } from "~/types/transcription";
import { VideoRepository } from "~/server/repositories/videoRepository";
import { db } from "~/server/db";
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

// type TranscriptionSetups = {
//   generalMarketContext: string;
//   coins: Array<{
//     coin: string;
//     sentiment: 'bullish' | 'bearish' | 'neutral';
//     marketContext: string;
//     tradeSetups: Array<{
//       position: 'long' | 'short' | 'abstain';
//       entryTriggers: string;
//       entryPrice: string;
//       timeframe: string;
//       takeProfit: string;
//       t1: string;
//       t2: string;
//       t3: string;
//       stopLoss: string;
//       stopLossPrice: number;
//       invalidation: string;
//       confidenceLevel: string;
//       transcriptExcerpt: string;
//     }>;
//   }>;
// };

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
  
    'basic': `Please provide a concise summary of the following transcript in markdown format:
  
  1. First, give me a 3-line overview that captures the main essence of the content.
  2. Then, list 3-5 key bullet points highlighting the most important specific information or takeaways.
  
  Keep the summary clear and focused, avoiding any unnecessary details.

  Example Output:
  ### Overview
  The transcript covers crypto market analysis, focusing on Bitcoin's recent price action and potential trade setups. The speaker discusses market sentiment, technical indicators, and specific entry/exit points. Several altcoins are analyzed with detailed trade recommendations.

  ### Key Takeaways
  * **Market Sentiment**: Recent times have been tough, with significant losses across the crypto space. However, several indicators suggest we might have hit bottom.

  * **Bitcoin Analysis**: Currently bullish on Bitcoin, with key support at $45k. Technical indicators suggest potential for upward movement, particularly if $48k resistance is broken.

  * **Altcoin Insights**: Detailed trade setups provided for ETH, SOL, and others. Focus on utility-driven projects rather than meme coins.

  * **Trading Strategy**: Emphasis on risk management and position sizing. Recommends scaling into positions and having clear exit strategies.

  Remember: Output only the markdown formatted text.

  Transcript:`,
  
    'description': `You are a crypto trading analyst expert. Below is a transcript of a crypto trading video that you created. Please extract and structure the information using markdown formatting. The transcript includes timestamps that you should use to create clickable links to the video sections.

  IMPORTANT: The transcript is provided with timestamps in the format "(123.45) Some text here". You MUST use these exact timestamps from the transcript to create your section links. DO NOT use arbitrary timestamps. Each section should use the timestamp of the first relevant mention of that topic in the transcript.

  1. Start with a "MARKET CONTEXT" section that captures the overall market sentiment and conditions discussed.
  Use the timestamp of the first market context discussion from the transcript.
  
  2. For each cryptocurrency discussed, create a section with:
     - The coin/token symbol in caps (e.g., "BTC", "ETH")
     - A timestamp link using the EXACT timestamp when that coin is first mentioned in the transcript
     - Format: [MM:SS]({{VIDEO_URL}}?t=N) where N is the exact number of seconds from the transcript
     Example: If BTC is first mentioned at timestamp (123.45), use [02:03]({{VIDEO_URL}}?t=123)
     - The key price levels discussed (support, resistance, targets)
     - The trading setup or analysis provided
     - The trader's sentiment (bullish, bearish, neutral)
     - Specific trade recommendations if given (entry, exit, stop loss)
  
  3. Include relevant "MEMBER QUESTION" sections when they provide valuable trading insights or market wisdom.
     Use the exact timestamp when the question is asked in the transcript.

  Rules:
  - ALWAYS use the exact timestamps from the provided transcript - DO NOT make up timestamps
  - Each section MUST use the timestamp of when that topic is first mentioned in the transcript
  - Focus only on actionable trading information and meaningful market insights
  - Skip casual conversation and non-trading related content
  - Use clear, concise language
  - Maintain chronological order from the stream
  - For each section, note key price levels and specific trade setups when mentioned
  - Include exact quotes when they provide important context or insight
  - Add timestamp links at the start of each major section using the exact seconds from the transcript

  Format each section like this:

  ### MARKET CONTEXT ([02:03]({{VIDEO_URL}}?t=123))
  [Overall market summary and conditions]

  ### COIN ANALYSIS
  #### BTC ([05:30]({{VIDEO_URL}}?t=330))
  [Analysis and trading setup details]

  ### MEMBER QUESTIONS
  #### [Question] ([10:15]({{VIDEO_URL}}?t=615))
  [Question and response if trading relevant]

  Rules:
  - Use markdown headers (##, ###) for sections
  - Use bullet points (*) for lists
  - Use **bold** for emphasis on important points
  - Use *italic* for secondary emphasis
  - Format price levels and numbers with code blocks where appropriate
  - Focus only on actionable trading information
  - Skip casual conversation
  - Maintain chronological order
  - Format timestamps as MM:SS in the display text
  - Use the exact seconds from the transcript in the URL
  - Make timestamps clickable links to the video section

  The transcript includes timestamps in the format "(seconds) text", for example:
  "(66.64) What about Bitcoin? (69.18) Let's look at the chart"
  You MUST use these exact timestamps (converting to MM:SS format for display) when creating your sections.

  VIDEO_URL: {{VIDEO_URL}}
  VIDEO_ID: {{VIDEO_ID}}
  
  Transcript:{{TRANSCRIPT_WITH_SECONDS}}
  `,
} as const;

const getPrompt = (summaryType: string): string => {
  return summaryType in prompts ? prompts[summaryType as keyof typeof prompts] : prompts.basic;
};

export async function summarizeTranscription(transcription: string, summaryType: string, captions?: {text: string, startSeconds: number, endSeconds: number}[], videoUrl?: string): Promise<TranscriptionSummary> {
    console.log("transcription, summaryType, captions, videoUrl ", transcription, summaryType, captions, videoUrl)    
    const isDescription = summaryType === 'description';

    if(isDescription && (!captions || captions.length === 0 || !videoUrl)){
        throw new Error('Captions and videoUrl are required for description summary type');
    }

    if(isDescription) {

    }
    const formattedCaptions = isDescription && captions 
        ? captions.map(caption => `(${caption.startSeconds.toFixed(2)}) ${caption.text}`).join(" ") 
        : "";
    const responseFormat = summaryType === 'trade-setups' ? { type: "json_object" } : { type: "text" }
    
    // Format video URL to maintain proper query parameter structure
    const formattedVideoUrl = videoUrl?.includes('?v=') 
        ? videoUrl.replace('?v=', '?v=').split('&')[0]
        : videoUrl;
    
    const prompt = isDescription
        ? getPrompt(summaryType)
            .replace('{{TRANSCRIPT_WITH_SECONDS}}', JSON.stringify(formattedCaptions))
            .replace(/\{\{VIDEO_URL\}\}/g, formattedVideoUrl ? `${formattedVideoUrl}&t=` : '')
        : getPrompt(summaryType);

    console.log("createVideo: summaryType is ", summaryType)
    console.log("createVideo: responseFormat is ", responseFormat)
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
                    content: `${prompt}${transcription}`
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
    const content = summaryType === 'trade-setups' ? JSON.parse(data.choices[0].message.content) : data.choices[0].message;
    
    if (summaryType === 'trade-setups' && (!content.generalMarketContext || !Array.isArray(content.coins)) ){
        throw new Error('Invalid response format from OpenAI');
    }

    return content;
}
export async function getSetups(transcription: string, summaryType: string): Promise<TranscriptionSetups> {
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
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    //console.log("createVideo: response is ", response)

    const data = await response.json();
    console.log("createVideo: data is ", data)
    console.log("createVideo: 'description' data.choices[0].message is ", data.choices[0].message)
    const content = JSON.parse(data.choices[0].message.content) 
    console.log("createVideo: content is ", content)
    if (!content.generalMarketContext || !Array.isArray(content.coins) ){
        throw new Error('Invalid response format from OpenAI');
    }

    return content;
}
export async function summarizeAndSaveSummary(
  videoId: string,
  transcription: string,
  summaryType: string,
  captions?: { text: string; startSeconds: number; endSeconds: number }[],
  videoUrl?: string
): Promise<string> {
  // Get the summary using existing function
  const summary = await summarizeTranscription(transcription, summaryType, captions, videoUrl);
  const content = summary.content;
  // Use the existing db instance and create a repository
  const repository = new VideoRepository(db);

  console.log("summarizeAndSaveSummary: content is ", content)
  // Save the summary
  if (content) {
    await repository.saveSummary(videoId, content, summaryType);
  }

  return content;
}

//input.transcription, input.summaryType, input.captions, input.vi
export async function describeAndSave(
  transcription: string,
  summaryType: string,
  captions?: { text: string; startSeconds: number; endSeconds: number }[],
  videoUrl?: string
): Promise<string> {
  // Get the summary using existing function
  const summary = await summarizeTranscription(transcription, summaryType, captions, videoUrl);
  const content = summary.content;
  // Use the existing db instance and create a repository
  const repository = new VideoRepository(db);

  console.log("summarizeAndSaveSummary: content is ", content)
  // Save the summary
  if (content) {
    await repository.saveSummary(undefined, content, summaryType, videoUrl);
  }

  return content;
}

export class VideoService {
  private repository: VideoRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new VideoRepository(prisma);
  }

  async summarizeAndSave(videoId: string, transcription: string, summaryType: string) {
    const summary = await summarizeTranscription(transcription, summaryType);
    
    // Save to database based on summary type
    return await this.repository.updateVideoContent(videoId, {
      summary: summaryType === 'basic' ? summary.content : undefined,
      description: summaryType === 'description' ? summary.content : undefined,
    });
  }

  async createVideo(data: VideoCreateInput) {
    // First, check if a video with this URL already exists
    const existingVideo = await this.repository.getVideoByUrl(data.videoUrl);
    console.log("createVideo: existingVideo is ", existingVideo?.videoUrl)
    
    if (existingVideo) {
      // Check if the user-video relation already exists
      const existingUserVideo = await this.repository.getUserVideo(data.userId, existingVideo.id);

      // Only create the relation if it doesn't exist
      if (!existingUserVideo) {
        await this.repository.createUserVideo(data.userId, existingVideo.id);
      }
      return existingVideo;
    }

    // If video doesn't exist, create it and the UserVideo relation
    return await this.repository.createVideo(data);
  }

  async updateVideo(id: string, data: VideoUpdateInput) {
    return this.repository.updateVideo(id, data);
  }

  async getVideo(id: string) {
    return await this.repository.getVideo(id);
  }

  async getVideoBySlug(slug: string) {
    return await this.repository.getVideoBySlug(slug);
  }

  async getVideos() {
    return await this.repository.getVideos();
  }

  async deleteVideo(id: string) {
    return await this.repository.deleteVideo(id);
  }
}
