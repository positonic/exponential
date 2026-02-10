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

    const { messages, agentId: rawAgentId, assistantId, workspaceId, projectId, conversationId } = (await req.json()) as {
      messages: CoreMessage[];
      agentId?: string;
      assistantId?: string;
      workspaceId?: string;
      projectId?: string;
      conversationId?: string;
    };

    let agentId = rawAgentId;
    let finalMessages = messages;

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
    
    // Verify workspace access and fetch workspace details for agent context
    let workspaceInfo: { slug: string; name: string; type: string } | null = null;
    if (workspaceId) {
      const workspaceAccess = await db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: session.user.id,
        },
        include: { workspace: { select: { slug: true, name: true, type: true } } },
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
      if (workspaceAccess.workspace) {
        workspaceInfo = workspaceAccess.workspace;
        entries.push(["workspaceSlug", workspaceAccess.workspace.slug]);
        entries.push(["workspaceName", workspaceAccess.workspace.name]);
        entries.push(["workspaceType", workspaceAccess.workspace.type]);
      }
    }
    if (projectId) {
      entries.push(["projectId", projectId]);
    }
    // If an assistantId is provided, fetch the custom personality and inject it
    if (assistantId) {
      const assistant = await db.assistant.findUnique({
        where: { id: assistantId },
      });

      if (assistant) {
        // Route to the blank-canvas assistantAgent
        agentId = 'assistantAgent';

        // Build personality overlay
        const personalityParts: string[] = [];
        personalityParts.push(`# Your Identity\nName: ${assistant.name}${assistant.emoji ? ` ${assistant.emoji}` : ''}`);
        if (assistant.personality) {
          personalityParts.push(`# Personality & Soul\n${assistant.personality}`);
        }
        if (assistant.instructions) {
          personalityParts.push(`# Instructions\n${assistant.instructions}`);
        }
        if (assistant.userContext) {
          personalityParts.push(`# About the User/Team\n${assistant.userContext}`);
        }

        // Prepend personality as first system message
        finalMessages = [
          { role: 'system' as const, content: personalityParts.join('\n\n') },
          ...messages,
        ];
      }
    }

    // Inject workspace navigation context so agents can build links to Exponential pages
    if (workspaceInfo) {
      const baseUrl = process.env.TODO_APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
      const wsContext = [
        `Current workspace: "${workspaceInfo.name}" (type: ${workspaceInfo.type})`,
        `Workspace slug: ${workspaceInfo.slug}`,
        `Base URL: ${baseUrl}`,
        `When linking to Exponential pages, replace {workspaceSlug} with "${workspaceInfo.slug}". Example: ${baseUrl}/w/${workspaceInfo.slug}/okrs`,
      ].join('\n');
      finalMessages = [
        { role: 'system' as const, content: wsContext },
        ...finalMessages,
      ];
    }

    console.log(`🔗 [chat/stream] agentId=${agentId}, assistantId=${assistantId || "none"}, projectId=${projectId || "none"}, workspaceId=${workspaceId || "none"}, messages=${finalMessages.length}`);
    const requestContext = new RequestContext(entries);

    const agent = client.getAgent(agentId ?? "projectManagerAgent");
    const response = await agent.stream(finalMessages, {
      requestContext,
      memory: {
        resource: session.user.id,
        thread: conversationId || `session-${session.user.id}-${Date.now()}`,
      },
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
