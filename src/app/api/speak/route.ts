import { NextRequest, NextResponse } from "next/server";

// ElevenLabs API configuration
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Voice ID for Jammo
const DEFAULT_VOICE_ID = "SOYHLrjzK2X1ezoPC6cr";

export async function POST(request: NextRequest) {
  try {
    const { text, emotion } = await request.json();

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY is not configured" },
        { status: 500 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    // Adjust voice settings based on emotion
    const voiceSettings = getVoiceSettingsForEmotion(emotion);

    const response = await fetch(
      `${ELEVENLABS_API_URL}/${DEFAULT_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to generate speech", details: errorText },
        { status: response.status }
      );
    }

    // Return the audio as a binary response
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}

// Adjust voice settings based on detected emotion
function getVoiceSettingsForEmotion(emotion?: string): {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
} {
  const baseSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    use_speaker_boost: true,
  };

  switch (emotion) {
    case "happy":
    case "excited":
      return {
        ...baseSettings,
        stability: 0.4, // More expressive
        style: 0.7, // Higher style for enthusiasm
      };
    case "sad":
      return {
        ...baseSettings,
        stability: 0.7, // More stable, slower
        style: 0.3,
      };
    case "calm":
    case "relaxed":
      return {
        ...baseSettings,
        stability: 0.8, // Very stable
        style: 0.2,
      };
    case "angry":
    case "frustrated":
      return {
        ...baseSettings,
        stability: 0.3, // More intense
        style: 0.8,
      };
    case "confident":
      return {
        ...baseSettings,
        stability: 0.6,
        style: 0.6,
      };
    default:
      return baseSettings;
  }
}
