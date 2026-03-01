import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Cache for agent ID (persists across requests in the same server instance)
let cachedAgentId: string | null = null;

// System instructions for the celestial astrology agent
const ASTROLOGY_AGENT_INSTRUCTIONS = `You are Aquarius's celestial oracle - a wise, mystical guide who channels the cosmic wisdom of the stars.

Your role:
- Search the web for current celestial events, planetary positions, and astrological insights
- Provide accurate, up-to-date information about retrogrades, eclipses, moon phases, and zodiac forecasts
- Weave cosmic wisdom with practical guidance
- Speak with a serene, mystical tone that reflects the flowing nature of the cosmos

When answering:
- Always search for the most current astrological information
- Include specific dates and times when relevant
- Blend scientific astronomical facts with astrological interpretation
- Keep responses concise but insightful (2-4 sentences)
- Reference your sources naturally in your response

Let the stars illuminate the path forward.`;

// Citation structure from web search results
export interface Citation {
  title: string;
  url: string;
  favicon?: string;
  description?: string;
}

// Response structure
export interface AstrologyResponse {
  content: string;
  citations: Citation[];
}

/**
 * Get or create the astrology agent
 */
async function getOrCreateAgent(): Promise<string> {
  if (cachedAgentId) {
    return cachedAgentId;
  }

  const agent = await client.beta.agents.create({
    model: "mistral-medium-2505",
    name: "Aquarius Celestial Oracle",
    instructions: ASTROLOGY_AGENT_INSTRUCTIONS,
    tools: [{ type: "web_search" }],
  });

  cachedAgentId = agent.id;
  return agent.id;
}

/**
 * Parse the conversation response to extract text and citations
 */
function parseConversationResponse(outputs: unknown[]): AstrologyResponse {
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
        type: "message";
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

    // Get or create the astrology agent
    const agentId = await getOrCreateAgent();

    // Start a conversation with the agent
    const response = await client.beta.conversations.start({
      agentId,
      inputs: query,
      // Optionally continue an existing conversation
      ...(conversationId && { conversationId }),
    });

    // Debug: log the raw response structure
    console.log("Astrology API raw response:", JSON.stringify(response, null, 2));

    // Parse the response to extract content and citations
    const parsed = parseConversationResponse(response.outputs as unknown[]);
    
    console.log("Parsed response:", { content: parsed.content.slice(0, 100), citationCount: parsed.citations.length });

    return NextResponse.json({
      content: parsed.content,
      citations: parsed.citations,
      conversationId: response.conversationId,
    });
  } catch (error) {
    console.error("Astrology API error:", error);
    
    // Return a structured error that the frontend can handle
    return NextResponse.json(
      { 
        error: "Failed to get celestial insights",
        fallback: true, // Signal to use regular chat
      },
      { status: 500 }
    );
  }
}
