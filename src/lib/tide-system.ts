/**
 * Mindful XP System - "The Flowing Tide"
 * 
 * A gentle, session-based experience system that tracks emotional progression
 * and visualizes it as a rising tide. Designed with mindfulness principles:
 * - No punishment (XP only increases)
 * - Rewards all emotional expression
 * - Celebrates positive emotional shifts
 * - Organic, gentle pacing
 */

import { type Emotion } from './emotion-mapping';

export interface TideState {
  xp: number;
  level: number;
  percentage: number;
  statusPhrase: string;
  lastEmotion: Emotion | null;
  justLeveledUp: boolean;
  reachedFullTide: boolean;
}

export interface XPGainResult {
  xpGained: number;
  reasons: string[];
}

// Tide levels with XP thresholds and status phrases
export const TIDE_LEVELS = [
  { threshold: 0, maxPercent: 10, phrase: "The tide is calm..." },
  { threshold: 25, maxPercent: 25, phrase: "Ripples forming" },
  { threshold: 50, maxPercent: 40, phrase: "Currents stirring" },
  { threshold: 100, maxPercent: 55, phrase: "Flowing smoothly" },
  { threshold: 175, maxPercent: 70, phrase: "Rising gently" },
  { threshold: 275, maxPercent: 85, phrase: "Waves gathering" },
  { threshold: 400, maxPercent: 100, phrase: "Full tide achieved" },
] as const;

// Emotion categorization
const POSITIVE_EMOTIONS: Emotion[] = ['happy', 'excited', 'calm', 'confident'];
const NEGATIVE_EMOTIONS: Emotion[] = ['sad', 'angry', 'frustrated', 'anxious'];

// Keywords that indicate positive expression
const POSITIVE_KEYWORDS = [
  'thank', 'thanks', 'better', 'helped', 'great', 'love', 
  'amazing', 'wonderful', 'appreciate', 'good', 'nice',
  'happy', 'glad', 'awesome', 'fantastic', 'excellent',
  'peaceful', 'calm', 'relaxed', 'fine', 'well'
];

/**
 * Create the initial tide state for a new session
 */
export function createInitialTideState(): TideState {
  return {
    xp: 0,
    level: 0,
    percentage: 0,
    statusPhrase: TIDE_LEVELS[0].phrase,
    lastEmotion: null,
    justLeveledUp: false,
    reachedFullTide: false,
  };
}

/**
 * Calculate XP gain based on user interaction
 * 
 * XP Sources:
 * - Base message: +5
 * - Positive emotion: +10
 * - Neutral emotion: +5
 * - Negative emotion: +3 (healthy to express!)
 * - Negative → Neutral shift: +15
 * - Negative → Positive shift: +25
 * - Robot command: +3
 * - Positive keywords: +8
 */
export function calculateXPGain(
  currentState: TideState,
  newEmotion: Emotion | null,
  messageContent: string,
  isCommand: boolean
): XPGainResult {
  let xp = 0;
  const reasons: string[] = [];
  
  // Base message reward - engagement is always good
  xp += 5;
  reasons.push('Engaging with Aquarius (+5)');
  
  // Emotion-based rewards
  if (newEmotion) {
    if (POSITIVE_EMOTIONS.includes(newEmotion)) {
      xp += 10;
      reasons.push(`Feeling ${newEmotion} (+10)`);
    } else if (newEmotion === 'neutral') {
      xp += 5;
      reasons.push('Finding balance (+5)');
    } else if (NEGATIVE_EMOTIONS.includes(newEmotion)) {
      // Small reward for expression - it's healthy to express feelings!
      xp += 3;
      reasons.push('Expressing your feelings (+3)');
    } else if (newEmotion === 'confused') {
      xp += 4;
      reasons.push('Seeking clarity (+4)');
    }
    
    // Emotional shift bonuses - the heart of mindful progression
    if (currentState.lastEmotion) {
      const wasNegative = NEGATIVE_EMOTIONS.includes(currentState.lastEmotion);
      const nowPositive = POSITIVE_EMOTIONS.includes(newEmotion);
      const nowNeutral = newEmotion === 'neutral';
      
      if (wasNegative && nowPositive) {
        xp += 25;
        reasons.push('Beautiful emotional shift (+25)');
      } else if (wasNegative && nowNeutral) {
        xp += 15;
        reasons.push('Finding calm waters (+15)');
      }
    }
  }
  
  // Robot command interaction reward
  if (isCommand) {
    xp += 3;
    reasons.push('Playful interaction (+3)');
  }
  
  // Positive keyword bonus
  const lowerContent = messageContent.toLowerCase();
  const hasPositiveKeyword = POSITIVE_KEYWORDS.some(kw => lowerContent.includes(kw));
  if (hasPositiveKeyword) {
    xp += 8;
    reasons.push('Positive expression (+8)');
  }
  
  return { xpGained: xp, reasons };
}

/**
 * Update tide state with new XP
 */
export function updateTideState(
  currentState: TideState,
  xpGained: number,
  newEmotion: Emotion | null
): TideState {
  const newXP = currentState.xp + xpGained;
  
  // Find current level based on XP
  let newLevel = 0;
  for (let i = TIDE_LEVELS.length - 1; i >= 0; i--) {
    if (newXP >= TIDE_LEVELS[i].threshold) {
      newLevel = i;
      break;
    }
  }
  
  // Calculate smooth percentage progression
  const currentLevelData = TIDE_LEVELS[newLevel];
  const nextLevelData = TIDE_LEVELS[newLevel + 1];
  
  let percentage: number;
  if (!nextLevelData) {
    // At max level - full tide!
    percentage = 100;
  } else {
    // Calculate progress within current level
    const xpInLevel = newXP - currentLevelData.threshold;
    const xpToNextLevel = nextLevelData.threshold - currentLevelData.threshold;
    const levelProgress = xpInLevel / xpToNextLevel;
    
    // Map to percentage range for this level
    const percentRange = nextLevelData.maxPercent - currentLevelData.maxPercent;
    percentage = currentLevelData.maxPercent + (levelProgress * percentRange);
  }
  
  // Determine if we just leveled up or reached full tide
  const justLeveledUp = newLevel > currentState.level;
  const reachedFullTide = newLevel === TIDE_LEVELS.length - 1 && 
                          currentState.level < TIDE_LEVELS.length - 1;
  
  return {
    xp: newXP,
    level: newLevel,
    percentage: Math.min(100, Math.max(0, percentage)),
    statusPhrase: currentLevelData.phrase,
    lastEmotion: newEmotion ?? currentState.lastEmotion,
    justLeveledUp,
    reachedFullTide,
  };
}

/**
 * Check if an emotion is considered positive
 */
export function isPositiveEmotion(emotion: Emotion): boolean {
  return POSITIVE_EMOTIONS.includes(emotion);
}

/**
 * Check if an emotion is considered negative
 */
export function isNegativeEmotion(emotion: Emotion): boolean {
  return NEGATIVE_EMOTIONS.includes(emotion);
}

/**
 * Get a gentle encouragement message based on current state
 */
export function getEncouragementMessage(state: TideState): string | null {
  if (state.reachedFullTide) {
    return "You've reached full tide. The cosmic waters are with you.";
  }
  
  if (state.justLeveledUp) {
    const messages = [
      "The tide rises with you.",
      "Your waters are flowing beautifully.",
      "Feel the gentle current of progress.",
      "The cosmic ocean embraces your journey.",
    ];
    return messages[state.level % messages.length];
  }
  
  return null;
}
