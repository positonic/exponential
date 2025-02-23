import { TranscriptionSummary } from "~/types/transcription";

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
};

const getPrompt = (summaryType: string) => {
  return prompts[summaryType as keyof typeof prompts] || prompts['basic'];
};

export async function summarizeTranscription(transcription: string, summaryType: string): Promise<TranscriptionSummary> {
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
            response_format: { type: "json_object" }
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

    return content as TranscriptionSummary;
}
