import { MastraClient } from "@mastra/client-js";
import type { CoreMessage } from "ai";
import { auth } from "~/server/auth";

const MASTRA_API_URL = process.env.MASTRA_API_URL ?? "http://localhost:4111";

export async function POST(req: Request) {
  try {
    // Require authentication
    const session = await auth();
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { messages, agentId } = (await req.json()) as {
      messages: CoreMessage[];
      agentId?: string;
    };

    const client = new MastraClient({
      baseUrl: MASTRA_API_URL,
    });

    const agent = client.getAgent(agentId ?? "projectManagerAgent");
    const response = await agent.stream({ messages });

    // Transform stream to extract text content from AI SDK format
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Parse AI SDK format: lines like '0:"text"' or '0:"text"\n'
        const lines = text.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          // Text chunks start with "0:"
          if (line.startsWith("0:")) {
            try {
              // Extract the JSON string after "0:"
              const jsonStr = line.slice(2);
              const content = JSON.parse(jsonStr) as unknown;
              if (typeof content === "string") {
                controller.enqueue(new TextEncoder().encode(content));
              }
            } catch {
              // If parsing fails, skip this chunk
            }
          }
        }
      },
    });

    const transformedStream = response.body?.pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Streaming error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to stream response" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
