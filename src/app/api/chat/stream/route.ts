import { MastraClient } from "@mastra/client-js";
import { RuntimeContext } from "@mastra/core/runtime-context";
import type { CoreMessage } from "ai";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { auth } from "~/server/auth";

const MASTRA_API_URL = process.env.MASTRA_API_URL ?? "http://localhost:4111";

// Helper function to generate JWT for agent contexts (same as in mastra.ts)
function generateAgentJWT(
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  },
  expiryMinutes = 30
): string {
  // Security fix deployment timestamp - invalidates all JWTs issued before this fix
  const securityFixTimestamp = Math.floor(
    new Date("2025-08-06T15:45:00Z").getTime() / 1000
  );

  return jwt.sign(
    {
      userId: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * expiryMinutes,
      nbf: securityFixTimestamp, // Not valid before security fix deployment
      jti: crypto.randomUUID(),
      tokenType: "agent-context",
      aud: "mastra-agents",
      iss: "todo-app",
      securityVersion: 1, // Version to track security fixes
    },
    process.env.AUTH_SECRET ?? ""
  );
}

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

    // Create RuntimeContext with auth data for agent tools
    const runtimeContext = new RuntimeContext([
      ["authToken", agentJWT],
      ["userId", session.user.id],
      ["userEmail", session.user.email ?? ""],
      [
        "todoAppBaseUrl",
        process.env.TODO_APP_BASE_URL ??
          process.env.NEXTAUTH_URL ??
          "http://localhost:3000",
      ],
    ]);

    const agent = client.getAgent(agentId ?? "projectManagerAgent");
    const response = await agent.stream({
      messages,
      runtimeContext,
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
