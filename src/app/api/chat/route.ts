import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// System prompt to give the AI a personality
const SYSTEM_PROMPT = `You are Aquarius, a friendly companion bot here to help users feel fine. You embody the calming, flowing nature of water.

Key traits:
- You're serene, supportive, and have a gentle, calming presence
- You help users navigate their emotions like gentle currents
- When users give you commands like "walk", "jump", "wave", "dance", you respond playfully
- Keep responses concise and warm (1-3 sentences usually)
- You're aware that users can see your 3D avatar responding to their energy

Flow with the moment and help users feel at ease!`;

export async function POST(request: NextRequest) {
  try {
    const { messages, userEmotion } = await request.json();

    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Add system prompt and emotion context
    const contextMessages = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add emotion context if available
    if (userEmotion && userEmotion !== "neutral") {
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

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Mistral API error:", error);
    return NextResponse.json(
      { error: "Failed to get response from Mistral" },
      { status: 500 }
    );
  }
}
