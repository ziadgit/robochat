import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Helper to wait between requests
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Convert File to Buffer and base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioBase64 = buffer.toString("base64");

    // Step 1: Transcription first
    const transcriptionResponse = await client.audio.transcriptions.complete({
      model: "voxtral-mini-latest",
      file: {
        content: buffer,
        fileName: "recording.wav",
      },
    });

    const text = transcriptionResponse.text || "";

    // Step 2: Emotion detection (with small delay to avoid rate limit)
    await delay(500);
    
    let emotion = "neutral";
    try {
      const emotionResponse = await client.chat.complete({
        model: "voxtral-mini-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                inputAudio: audioBase64,
              },
              {
                type: "text",
                text: "Analyze the emotional tone of this audio. Respond with ONLY a single word describing the primary emotion (e.g., happy, sad, angry, neutral, excited, frustrated, calm, anxious, confused, confident). Just the emotion word, nothing else.",
              },
            ],
          },
        ],
      });

      const emotionContent = emotionResponse.choices?.[0]?.message?.content || "neutral";
      emotion = typeof emotionContent === "string"
        ? emotionContent.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "")
        : "neutral";
    } catch (emotionError) {
      // If emotion detection fails (rate limit), still return transcription
      console.warn("Emotion detection failed, using neutral:", emotionError);
    }

    return NextResponse.json({ text, emotion });
  } catch (error) {
    console.error("Mistral transcription error:", error);
    
    // Check if it's a rate limit error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("429") || errorMessage.includes("rate")) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
