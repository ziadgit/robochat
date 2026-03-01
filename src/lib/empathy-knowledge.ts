/**
 * Therapeutic knowledge base ported from windx/rag-empathy.
 *
 * Provides CBT techniques, grounding exercises, and tech-stress strategies
 * for emotion-aware robot responses.
 */

export interface Technique {
  name: string;
  summary: string;
  steps?: string[];
  strategies?: string[];
  questions?: string[];
  signs?: string[];
  duration?: string;
  example?: string;
}

// ---------------------------------------------------------------------------
// CBT techniques
// ---------------------------------------------------------------------------

const CBT_TECHNIQUES: Record<string, Technique> = {
  cognitive_restructuring: {
    name: "Cognitive Restructuring",
    summary:
      "Identify and reframe distorted thoughts into balanced alternatives.",
    steps: [
      "Notice the automatic thought (e.g. 'I'll never finish this').",
      "Label the cognitive distortion (catastrophizing, black-and-white, etc.).",
      "Ask: What evidence supports this? What evidence contradicts it?",
      "Formulate a balanced replacement thought.",
    ],
    example:
      "Distorted: 'If this launch fails, my career is over.' " +
      "Reframed: 'A rough launch is stressful, but one setback doesn't define my whole career.'",
  },
  thought_challenging: {
    name: "Thought Challenging (Socratic Questions)",
    summary:
      "Use targeted questions to test the validity of a negative belief.",
    questions: [
      "What is the evidence for and against this thought?",
      "Am I confusing a thought with a fact?",
      "What would I tell a friend who had this thought?",
      "Will this matter in five years?",
      "What is the most realistic outcome?",
    ],
  },
  behavioral_activation: {
    name: "Behavioral Activation",
    summary:
      "Schedule small, achievable activities that restore a sense of mastery or pleasure.",
    steps: [
      "List activities that used to bring satisfaction or joy.",
      "Pick one small action you can do in the next hour.",
      "Do it without judging the outcome.",
      "Notice any shift in mood, however slight.",
    ],
  },
  decatastrophizing: {
    name: "Decatastrophizing",
    summary:
      "Walk through worst / best / most-likely scenarios to shrink anxiety.",
    steps: [
      "Describe the feared outcome in concrete terms.",
      "Rate its actual probability (0-100%).",
      "Describe the best-case outcome.",
      "Describe the most likely outcome.",
      "Plan one coping step for the most likely scenario.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Grounding exercises
// ---------------------------------------------------------------------------

const GROUNDING_EXERCISES: Record<string, Technique> = {
  five_senses: {
    name: "5-4-3-2-1 Grounding",
    summary: "Anchor to the present through your five senses.",
    steps: [
      "Name 5 things you can see.",
      "Name 4 things you can touch or feel.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell.",
      "Name 1 thing you can taste.",
    ],
    duration: "2-3 minutes",
  },
  box_breathing: {
    name: "Box Breathing",
    summary:
      "A four-count breathing pattern used by Navy SEALs to calm the nervous system.",
    steps: [
      "Breathe in through your nose for 4 counts.",
      "Hold your breath for 4 counts.",
      "Exhale slowly through your mouth for 4 counts.",
      "Hold empty for 4 counts.",
      "Repeat for 4 cycles.",
    ],
    duration: "2-4 minutes",
  },
  body_scan: {
    name: "Quick Body Scan",
    summary: "Progressively notice and release tension from head to toe.",
    steps: [
      "Close your eyes and take three slow breaths.",
      "Bring attention to the top of your head.",
      "Slowly scan downward: forehead, jaw, neck, shoulders.",
      "Continue through arms, chest, belly, legs, feet.",
      "Wherever you notice tension, breathe into that spot and let it soften.",
    ],
    duration: "3-5 minutes",
  },
};

// ---------------------------------------------------------------------------
// Tech-worker stress strategies
// ---------------------------------------------------------------------------

const TECH_STRESS: Record<string, Technique> = {
  burnout: {
    name: "Burnout Recovery",
    signs: [
      "Chronic exhaustion that sleep doesn't fix",
      "Cynicism or detachment from work",
      "Feeling ineffective despite long hours",
    ],
    summary: "Recognize and address burnout before it deepens.",
    strategies: [
      "Set a hard shutdown time and close the laptop.",
      "Identify one task you can delegate or drop this week.",
      "Schedule a non-negotiable 15-minute break every 90 minutes.",
      "Reconnect with the reason you started building in the first place.",
      "Talk to someone you trust -- isolation amplifies burnout.",
    ],
  },
  imposter_syndrome: {
    name: "Imposter Syndrome",
    signs: [
      "Attributing success to luck rather than skill",
      "Fear of being 'found out'",
      "Downplaying accomplishments",
    ],
    summary: "Reframe self-doubt with evidence and perspective.",
    strategies: [
      "Keep a 'wins' doc -- write down one accomplishment each day.",
      "Remember: if you were truly unqualified, you wouldn't worry about it.",
      "Ask a peer for honest feedback; external data beats internal narrative.",
      "Notice when you compare your behind-the-scenes to someone else's highlight reel.",
    ],
  },
  deadline_anxiety: {
    name: "Deadline Anxiety",
    signs: [
      "Racing thoughts about timelines",
      "Procrastination driven by overwhelm",
      "Physical tension (tight shoulders, shallow breathing)",
    ],
    summary: "Break the freeze cycle with one small step.",
    strategies: [
      "Break the deliverable into the smallest possible next step.",
      "Time-box: work for 25 minutes, then reassess.",
      "Write down everything swirling in your head -- externalize the chaos.",
      "Ask: What is the real consequence of being one day late?",
    ],
  },
};

// ---------------------------------------------------------------------------
// Emotion -> technique mapping
// ---------------------------------------------------------------------------

const EMOTION_TECHNIQUE_MAP: Record<string, string[]> = {
  stressed: ["burnout", "box_breathing", "behavioral_activation"],
  anxious: ["decatastrophizing", "five_senses", "box_breathing"],
  sad: ["behavioral_activation", "cognitive_restructuring", "body_scan"],
  angry: ["box_breathing", "body_scan", "thought_challenging"],
  frustrated: ["thought_challenging", "deadline_anxiety"],
  overwhelmed: ["five_senses", "box_breathing", "burnout"],
  insecure: ["imposter_syndrome", "cognitive_restructuring"],
  confused: ["decatastrophizing", "five_senses"],
};

// ---------------------------------------------------------------------------
// Retrieval helpers
// ---------------------------------------------------------------------------

const ALL_STORES = [CBT_TECHNIQUES, GROUNDING_EXERCISES, TECH_STRESS] as const;

export function getAllTechniques(): [string, Technique][] {
  return ALL_STORES.flatMap((s) => Object.entries(s));
}

function lookup(key: string): Technique | null {
  for (const store of ALL_STORES) {
    if (key in store) return store[key];
  }
  return null;
}

export function retrieveForEmotion(emotion: string): Technique[] {
  const keys =
    EMOTION_TECHNIQUE_MAP[emotion.toLowerCase()] ?? ["box_breathing", "five_senses"];
  return keys.map(lookup).filter((t): t is Technique => t !== null);
}

export function formatTechniquesForPrompt(techniques: Technique[]): string {
  if (techniques.length === 0) return "No specific techniques retrieved.";
  return techniques
    .map((t) => {
      const items = t.steps ?? t.strategies ?? t.questions ?? [];
      const itemsText = items.map((s) => `  - ${s}`).join("\n");
      let block = `### ${t.name}\n${t.summary}`;
      if (itemsText) block += `\nSteps:\n${itemsText}`;
      return block;
    })
    .join("\n\n");
}

export function checkMoodTrend(emotionHistory: string[]): string {
  if (emotionHistory.length === 0) return "No mood history yet.";
  if (emotionHistory.length === 1) return `Starting mood: ${emotionHistory[0]}.`;

  const negative = new Set([
    "stressed",
    "anxious",
    "sad",
    "angry",
    "frustrated",
    "overwhelmed",
    "insecure",
  ]);
  const positive = new Set(["calm", "happy", "excited", "confident"]);

  const first = emotionHistory[0].toLowerCase();
  const recent = emotionHistory[emotionHistory.length - 1].toLowerCase();

  if (negative.has(first) && positive.has(recent))
    return `Positive shift detected: ${first} -> ${recent}. Things are moving in a good direction.`;
  if (negative.has(first) && negative.has(recent) && first !== recent)
    return `Mood shifted from ${first} to ${recent}. Still in a tough stretch.`;
  if (positive.has(first) && negative.has(recent))
    return `Mood dipped from ${first} to ${recent}. Worth checking in on what changed.`;
  if (first === recent)
    return `Mood has been consistently ${recent} across the conversation.`;
  return `Mood trajectory: ${emotionHistory.join(" -> ")}.`;
}
