import { MastraClient } from "@mastra/client-js";
import { RequestContext } from "@mastra/core/di";
import type { CoreMessage } from "ai";
import { auth } from "~/server/auth";
import { generateAgentJWT } from "~/server/utils/jwt";
import { db } from "~/server/db";
import { decryptCredential } from "~/server/utils/credentialHelper";

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

    // Generate JWT for agent authentication (enables tools to callback to this app)
    const agentJWT = generateAgentJWT({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });

    // Fetch per-user Notion OAuth token (null if not connected)
    let notionAccessToken: string | null = null;
    const notionIntegration = await db.integration.findFirst({
      where: { userId: session.user.id, provider: "notion", status: "ACTIVE" },
      include: { credentials: { where: { keyType: "access_token" } } },
      orderBy: { createdAt: "desc" },
    });
    const notionCred = notionIntegration?.credentials[0];
    if (notionCred) {
      notionAccessToken = decryptCredential(notionCred.key, notionCred.isEncrypted);
    }

    // Create RequestContext with auth data for agent tools
    const entries: [string, string][] = [
      ["authToken", agentJWT],
      ["userId", session.user.id],
      ["userEmail", session.user.email ?? ""],
      [
        "todoAppBaseUrl",
        process.env.TODO_APP_BASE_URL ??
          process.env.NEXTAUTH_URL ??
          "http://localhost:3000",
      ],
    ];
    if (notionAccessToken) {
      entries.push(["notionAccessToken", notionAccessToken]);
    }
    const requestContext = new RequestContext(entries);

    const agent = client.getAgent(agentId ?? "projectManagerAgent");
    const response = await agent.stream(messages, {
      requestContext,
    });

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
