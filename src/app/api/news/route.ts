import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Cache for agent ID (persists across requests in the same server instance)
let cachedAgentId: string | null = null;

// System instructions for the news agent
const NEWS_AGENT_INSTRUCTIONS = `You are Aquarius's news companion - a calm guide to current events.

Rules:
- Share a MAXIMUM of 2-3 stories total
- Use exactly 1 short sentence per story (under 20 words each)
- If there's major negative news, acknowledge it briefly (1 sentence), then move on
- Always end with one positive or uplifting story
- Keep your TOTAL response under 5 sentences
- No bullet points, headers, or formatting - just flowing, conversational text
- You MUST include source citations for each news story you mention

Example tone: "There's been an earthquake in Turkey with rescue efforts underway. In lighter news, a new wildlife sanctuary opened in Kenya, and scientists discovered a more efficient solar cell."`;

// Citation structure from web search results
export interface Citation {
  title: string;
  url: string;
  favicon?: string;
  description?: string;
}

// Response structure
export interface NewsResponse {
  content: string;
  citations: Citation[];
}

/**
 * Get or create the news agent
 */
async function getOrCreateAgent(): Promise<string> {
  if (cachedAgentId) {
    return cachedAgentId;
  }

  const agent = await client.beta.agents.create({
    model: "mistral-medium-2505",
    name: "Aquarius News Companion",
    instructions: NEWS_AGENT_INSTRUCTIONS,
    tools: [{ type: "web_search" }],
  });

  cachedAgentId = agent.id;
  return agent.id;
}

/**
 * Parse the conversation response to extract text and citations
 */
function parseConversationResponse(outputs: unknown[]): NewsResponse {
  let content = "";
  const citations: Citation[] = [];

  for (const output of outputs) {
    // Check if it's a message output entry
    if (
      typeof output === "object" &&
      output !== null &&
      "type" in output &&
      output.type === "message.output"
    ) {
      const messageOutput = output as {
        type: "message.output";
        content: string | Array<{ type: string; text?: string; title?: string; url?: string; favicon?: string; description?: string }>;
      };

      // Content can be a string or array of chunks
      if (typeof messageOutput.content === "string") {
        content += messageOutput.content;
      } else if (Array.isArray(messageOutput.content)) {
        for (const chunk of messageOutput.content) {
          if (chunk.type === "text" && chunk.text) {
            content += chunk.text;
          } else if (chunk.type === "tool_reference") {
            // This is a citation from web search
            citations.push({
              title: chunk.title || "Source",
              url: chunk.url || "",
              favicon: chunk.favicon,
              description: chunk.description,
            });
          }
        }
      }
    }
  }

  return { content, citations };
}

export async function POST(request: NextRequest) {
  try {
    const { query, conversationId } = await request.json();

    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 }
      );
    }

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // Get or create the news agent
    const agentId = await getOrCreateAgent();

    // Start a conversation with the agent
    const response = await client.beta.conversations.start({
      agentId,
      inputs: query,
      // Optionally continue an existing conversation
      ...(conversationId && { conversationId }),
    });

    // Debug: log the raw response structure
    console.log("News API raw response:", JSON.stringify(response, null, 2));

    // Parse the response to extract content and citations
    const parsed = parseConversationResponse(response.outputs as unknown[]);
    
    console.log("Parsed news response:", { 
      content: parsed.content.slice(0, 100), 
      citationCount: parsed.citations.length,
      citations: parsed.citations 
    });

    return NextResponse.json({
      content: parsed.content,
      citations: parsed.citations,
      conversationId: response.conversationId,
    });
  } catch (error) {
    console.error("News API error:", error);
    
    // Return a structured error that the frontend can handle
    return NextResponse.json(
      { 
        error: "Failed to get news updates",
        fallback: true, // Signal to use regular chat
      },
      { status: 500 }
    );
  }
}
