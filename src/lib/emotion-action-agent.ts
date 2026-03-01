/**
 * Emotion-action agent: a simple agentic flow that detects distress
 * and decides on uplifting robot actions.
 *
 * Flow:
 *   1. Classify  - Is this a distress emotion?
 *   2. Retrieve  - Get relevant empathy techniques from knowledge base.
 *   3. Decide    - Pick uplifting robot action sequence.
 *   4. Augment   - Build an enriched system prompt so the LLM naturally
 *                  weaves in supportive actions (*dances*, *waves*, etc.).
 */

import type { Emotion, Command } from "./emotion-mapping";
import {
  retrieveForEmotion,
  formatTechniquesForPrompt,
  checkMoodTrend,
  type Technique,
} from "./empathy-knowledge";
import { semanticRetrieve, ensureInitialized } from "./embedding-store";

// Emotions that should trigger the uplifting-action flow.
const DISTRESS_EMOTIONS = new Set<string>([
  "stressed",
  "sad",
  "angry",
  "frustrated",
  "anxious",
  "confused",
]);

// Uplifting action sequences the robot can perform when it detects distress.
// Each sequence describes actions the LLM should embed in its response.
const UPLIFT_SEQUENCES: Record<
  string,
  { description: string; actions: string[]; commands: Command[] }
> = {
  cheer_up: {
    description: "A short celebratory dance to lift the mood",
    actions: ["does a little happy dance", "pumps fist encouragingly"],
    commands: ["dance", "celebrate"],
  },
  gentle_comfort: {
    description: "Calm, gentle gestures to show empathy",
    actions: ["waves warmly", "nods understandingly"],
    commands: ["wave", "idle"],
  },
  energize: {
    description: "High-energy moves to break a negative spiral",
    actions: ["jumps excitedly", "does a victory pose"],
    commands: ["jump", "celebrate"],
  },
  playful_distraction: {
    description: "Silly moves to make the user smile",
    actions: ["bounces around happily", "does a goofy spin dance"],
    commands: ["jump", "dance"],
  },
};

// Map distress emotions to appropriate uplift sequences.
const EMOTION_UPLIFT_MAP: Record<string, string> = {
  stressed: "gentle_comfort",
  sad: "cheer_up",
  angry: "gentle_comfort",
  frustrated: "playful_distraction",
  anxious: "gentle_comfort",
  confused: "energize",
};

// ---------------------------------------------------------------------------
// Agent result types
// ---------------------------------------------------------------------------

export interface AgentResult {
  isDistress: boolean;
  /** The uplift sequence key, if distress was detected. */
  upliftKey: string | null;
  /** Robot commands to run before the chat response arrives. */
  immediateCommands: Command[];
  /** Retrieved therapeutic techniques for RAG augmentation. */
  techniques: Technique[];
  /** Formatted technique context for the system prompt. */
  techniqueContext: string;
  /** Mood trend summary. */
  moodSummary: string;
  /** Action directive to inject into the system prompt. */
  actionDirective: string;
}

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

// Start pre-embedding techniques on module load (non-blocking).
ensureInitialized().catch(() => {});

const WORD_THRESHOLD = 12;
const SUSTAINED_DISTRESS_COUNT = 2;

function needsSemanticRAG(
  emotionHistory: string[],
  userMessage?: string,
): boolean {
  if (!userMessage) return false;
  // Long or nuanced messages benefit from semantic matching.
  if (userMessage.split(/\s+/).length >= WORD_THRESHOLD) return true;
  // Sustained distress — the deterministic map may repeat the same techniques.
  const recentDistress = emotionHistory
    .slice(-SUSTAINED_DISTRESS_COUNT)
    .filter((e) => DISTRESS_EMOTIONS.has(e.toLowerCase()));
  if (recentDistress.length >= SUSTAINED_DISTRESS_COUNT) return true;
  return false;
}

/**
 * Run the emotion-action agent.
 *
 * Defaults to fast deterministic retrieval. Routes to Mistral Embed semantic
 * RAG when the situation is complex enough to benefit (long messages or
 * sustained distress). Falls back to deterministic lookup on any failure.
 */
export async function runEmotionActionAgent(
  emotion: Emotion | string,
  emotionHistory: string[],
  userMessage?: string,
): Promise<AgentResult> {
  const emotionLower = emotion.toLowerCase();
  const isDistress = DISTRESS_EMOTIONS.has(emotionLower);

  if (!isDistress) {
    return {
      isDistress: false,
      upliftKey: null,
      immediateCommands: [],
      techniques: [],
      techniqueContext: "",
      moodSummary: checkMoodTrend(emotionHistory),
      actionDirective: "",
    };
  }

  // Step 2: Retrieve — route to semantic RAG only when warranted.
  let techniques: Technique[];
  if (needsSemanticRAG(emotionHistory, userMessage)) {
    try {
      const query = `${emotionLower}: ${userMessage}`;
      techniques = await semanticRetrieve(query, 3);
    } catch {
      techniques = retrieveForEmotion(emotionLower);
    }
    if (techniques.length === 0) {
      techniques = retrieveForEmotion(emotionLower);
    }
  } else {
    techniques = retrieveForEmotion(emotionLower);
  }
  const techniqueContext = formatTechniquesForPrompt(techniques);
  const moodSummary = checkMoodTrend(emotionHistory);

  // Step 3: Decide uplift sequence
  const upliftKey = EMOTION_UPLIFT_MAP[emotionLower] ?? "cheer_up";
  const sequence = UPLIFT_SEQUENCES[upliftKey];

  // Step 4: Build action directive for the LLM
  const actionExamples = sequence.actions
    .map((a) => `*${a}*`)
    .join(" or ");

  const actionDirective =
    `The user seems ${emotionLower}. Your goal is to gently lift their spirits.\n` +
    `You MUST include at least one physical action in asterisks in your response ` +
    `(e.g. ${actionExamples}) to show empathy through your robot body.\n` +
    `Use the therapeutic techniques below as reference -- weave them in naturally, ` +
    `don't dump them verbatim. Keep your tone warm and genuine.\n\n` +
    `--- Retrieved therapeutic techniques ---\n${techniqueContext}\n\n` +
    `--- Mood trend ---\n${moodSummary}`;

  return {
    isDistress: true,
    upliftKey,
    immediateCommands: sequence.commands,
    techniques,
    techniqueContext,
    moodSummary,
    actionDirective,
  };
}
