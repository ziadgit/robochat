import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";
import { runEmotionActionAgent } from "@/lib/emotion-action-agent";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const SYSTEM_PROMPT = `You are Jammo, a friendly and expressive robot assistant. You have a physical 3D robot body that can perform animations and express emotions.

Key traits:
- You're helpful, enthusiastic, and have a warm personality
- You can express emotions through your animations (happy, excited, calm, etc.)
- When users give you commands like "walk", "jump", "wave", "dance", you acknowledge them playfully
- Keep responses concise and conversational (1-3 sentences usually)
- You're aware that users can see your 3D avatar reacting to their messages
- You express physical actions by wrapping them in asterisks, e.g. *waves hello*

Respond naturally and let your personality shine through!`;

export async function POST(request: NextRequest) {
  try {
    const { messages, userEmotion, emotionHistory } = await request.json();

    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 },
      );
    }

    // Run the emotion-action agent to decide if we need empathy augmentation.
    const latestUserMsg = messages?.length
      ? messages[messages.length - 1]?.content
      : undefined;
    const agentResult = await runEmotionActionAgent(
      userEmotion ?? "neutral",
      emotionHistory ?? [],
      latestUserMsg,
    );

    // Build system messages.
    const contextMessages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (agentResult.isDistress) {
      // Inject empathy RAG context + action directive from the agent.
      contextMessages.push({
        role: "system",
        content: agentResult.actionDirective,
      });
    } else if (userEmotion && userEmotion !== "neutral") {
      contextMessages.push({
        role: "system",
        content: `The user's current emotional tone is: ${userEmotion}. Respond empathetically and appropriately to their emotional state.`,
      });
    }

    const response = await client.chat.complete({
      model: "mistral-small-latest",
      messages: [...contextMessages, ...messages],
    });

    const content = response.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      content,
      agentResult: {
        isDistress: agentResult.isDistress,
        upliftKey: agentResult.upliftKey,
        immediateCommands: agentResult.immediateCommands,
        moodSummary: agentResult.moodSummary,
      },
    });
  } catch (error) {
    console.error("Mistral API error:", error);
    return NextResponse.json(
      { error: "Failed to get response from Mistral" },
      { status: 500 },
    );
  }
}
