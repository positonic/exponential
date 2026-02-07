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

    const { messages, agentId, workspaceId } = (await req.json()) as {
      messages: CoreMessage[];
      agentId?: string;
      workspaceId?: string;
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
    
    // Verify workspace access before adding workspaceId to context
    if (workspaceId) {
      const workspaceAccess = await db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: session.user.id,
        },
      });

      if (!workspaceAccess) {
        return new Response(
          JSON.stringify({ 
            error: "Forbidden: You do not have access to this workspace" 
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      entries.push(["workspaceId", workspaceId]);
    }
    const requestContext = new RequestContext(entries);

    const agent = client.getAgent(agentId ?? "projectManagerAgent");
    const response = await agent.stream(messages, {
      requestContext,
    });

    // Extract text from Mastra's chunk protocol (text-delta events)
    const textStream = new ReadableStream({
      async start(controller) {
        try {
          await response.processDataStream({
            onChunk: async (chunk) => {
              if (chunk.type === "text-delta") {
                controller.enqueue(
                  new TextEncoder().encode(chunk.payload.text),
                );
              }
            },
          });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(textStream, {
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
