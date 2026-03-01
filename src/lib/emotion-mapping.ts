/**
 * Intelligent mapping system for emotions and commands to robot animations
 */

export type Emotion = 
  | 'happy' 
  | 'sad' 
  | 'angry' 
  | 'neutral' 
  | 'excited' 
  | 'frustrated' 
  | 'calm' 
  | 'anxious' 
  | 'confused' 
  | 'confident';

export type Command = 
  | 'walk' 
  | 'run' 
  | 'jump' 
  | 'wave' 
  | 'stop' 
  | 'dance' 
  | 'idle'
  | 'celebrate'
  | 'think';

export interface AnimationMapping {
  animation: string;
  duration?: number; // Optional override duration
  loop?: boolean;
  speed?: number;
  emotionGlow?: string; // Hex color for emotion-based glow effect
}

// Map emotions to their most appropriate animations
export const emotionAnimationMap: Record<Emotion, AnimationMapping> = {
  happy: {
    animation: 'a_Idle_Happy',
    loop: true,
    emotionGlow: '#ffeb3b', // Yellow glow
  },
  excited: {
    animation: 'Happy',
    loop: true,
    speed: 1.2,
    emotionGlow: '#ff9800', // Orange glow
  },
  sad: {
    animation: 'a_Idle_Scared', // Using scared as closest to sad posture
    loop: true,
    speed: 0.8,
    emotionGlow: '#2196f3', // Blue glow
  },
  angry: {
    animation: 'a_Idle_Battle',
    loop: true,
    speed: 1.1,
    emotionGlow: '#f44336', // Red glow
  },
  frustrated: {
    animation: 'Puzzled',
    loop: false,
    emotionGlow: '#e91e63', // Pink glow
  },
  neutral: {
    animation: 'a_Idle',
    loop: true,
    emotionGlow: '#9e9e9e', // Gray glow
  },
  calm: {
    animation: 'a_Idle_Relaxed',
    loop: true,
    speed: 0.9,
    emotionGlow: '#4caf50', // Green glow
  },
  anxious: {
    animation: 'a_Idle_Scared',
    loop: true,
    speed: 1.3,
    emotionGlow: '#9c27b0', // Purple glow
  },
  confused: {
    animation: 'Puzzled',
    loop: false,
    emotionGlow: '#ff5722', // Deep orange glow
  },
  confident: {
    animation: 'Victory Idle',
    loop: true,
    emotionGlow: '#00bcd4', // Cyan glow
  },
};

// Map commands to animations with movement behavior
export const commandAnimationMap: Record<Command, AnimationMapping & { movement?: 'walk' | 'run' | 'none' }> = {
  walk: {
    animation: 'a_Walking',
    loop: true,
    movement: 'walk',
  },
  run: {
    animation: 'a_Running',
    loop: true,
    speed: 1.2,
    movement: 'run',
  },
  jump: {
    animation: 'Jump',
    loop: false,
    movement: 'none',
  },
  wave: {
    animation: 'Waving',
    loop: false,
    movement: 'none',
  },
  stop: {
    animation: 'a_Idle',
    loop: true,
    movement: 'none',
  },
  idle: {
    animation: 'a_Idle',
    loop: true,
    movement: 'none',
  },
  dance: {
    animation: 'Happy',
    loop: true,
    speed: 1.3,
    movement: 'none',
  },
  celebrate: {
    animation: 'Fist Pump',
    loop: false,
    movement: 'none',
  },
  think: {
    animation: 'Puzzled',
    loop: false,
    movement: 'none',
  },
};

// Keywords that trigger specific commands
const commandKeywords: Record<Command, string[]> = {
  walk: ['walk', 'stroll', 'move', 'go', 'come here'],
  run: ['run', 'sprint', 'hurry', 'quick', 'fast'],
  jump: ['jump', 'hop', 'leap', 'bounce'],
  wave: ['wave', 'hello', 'hi', 'bye', 'goodbye', 'greet'],
  stop: ['stop', 'halt', 'freeze', 'stay', 'still'],
  dance: ['dance', 'groove', 'boogie', 'party'],
  idle: ['idle', 'relax', 'chill', 'rest'],
  celebrate: ['celebrate', 'victory', 'win', 'yes', 'woohoo', 'yay'],
  think: ['think', 'hmm', 'wonder', 'consider', 'ponder'],
};

/**
 * Detect if the user's message contains a command for the robot
 */
export function detectCommand(text: string): Command | null {
  const lowerText = text.toLowerCase();
  
  for (const [command, keywords] of Object.entries(commandKeywords)) {
    for (const keyword of keywords) {
      // Check for exact word match or command-like phrases
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerText)) {
        return command as Command;
      }
    }
  }
  
  return null;
}

/**
 * Get the appropriate animation based on emotion and/or command
 * Command takes priority over emotion
 */
export function getAnimationForInput(
  emotion: Emotion | null,
  command: Command | null
): AnimationMapping & { movement?: 'walk' | 'run' | 'none' } {
  // Command takes priority
  if (command && commandAnimationMap[command]) {
    return commandAnimationMap[command];
  }
  
  // Fall back to emotion-based animation
  if (emotion && emotionAnimationMap[emotion]) {
    return { ...emotionAnimationMap[emotion], movement: 'none' };
  }
  
  // Default to neutral idle
  return { ...emotionAnimationMap.neutral, movement: 'none' };
}

/**
 * Get the response emotion for the AI based on user emotion
 * The robot should respond empathetically
 */
export function getResponseEmotion(userEmotion: Emotion): Emotion {
  const responseMap: Record<Emotion, Emotion> = {
    happy: 'happy',
    excited: 'excited',
    sad: 'calm', // Respond calmly to sadness
    angry: 'calm', // Respond calmly to anger
    frustrated: 'calm',
    neutral: 'neutral',
    calm: 'calm',
    anxious: 'calm', // Soothing response
    confused: 'confident', // Confident to help
    confident: 'happy',
  };
  
  return responseMap[userEmotion];
}

/**
 * Available animations list for reference
 */
export const availableAnimations = [
  // Actions
  'Fist Pump',
  'Happy',
  'Jump',
  'Puzzled',
  'Standing',
  'Victory Idle',
  'Waving',
  'Falling To Landing',
  // Default
  'a_Idle',
  'a_Idle_Battle',
  'a_Idle_Happy',
  'a_Idle_Relaxed',
  'a_Idle_Scared',
  'a_Running',
  'a_Walking',
];

/**
 * Parsed action from asterisk-enclosed text
 */
export interface ParsedAction {
  text: string;           // The raw action text (e.g., "leans in slightly")
  animation: string;      // Mapped animation name
  emotionGlow?: string;   // Optional glow color
}

/**
 * Result of parsing a response
 */
export interface ParsedResponse {
  spokenText: string;     // Text without actions (for TTS)
  displayText: string;    // Clean text for display
  actions: ParsedAction[]; // Extracted actions
}

/**
 * Action keywords mapped to animations
 */
const actionKeywordMap: Record<string, { animation: string; emotionGlow?: string }> = {
  // Physical movements
  'lean': { animation: 'a_Idle_Relaxed' },
  'leans': { animation: 'a_Idle_Relaxed' },
  'tilt': { animation: 'Puzzled' },
  'tilts': { animation: 'Puzzled' },
  'nod': { animation: 'a_Idle_Happy' },
  'nods': { animation: 'a_Idle_Happy' },
  'shake': { animation: 'Puzzled' },
  'shakes': { animation: 'Puzzled' },
  'jump': { animation: 'Jump' },
  'jumps': { animation: 'Jump' },
  'bounce': { animation: 'Jump' },
  'bounces': { animation: 'Jump' },
  'wave': { animation: 'Waving' },
  'waves': { animation: 'Waving' },
  'pump': { animation: 'Fist Pump' },
  'pumps': { animation: 'Fist Pump' },
  'fist': { animation: 'Fist Pump' },
  'stand': { animation: 'Standing' },
  'stands': { animation: 'Standing' },
  'walk': { animation: 'a_Walking' },
  'walks': { animation: 'a_Walking' },
  'run': { animation: 'a_Running' },
  'runs': { animation: 'a_Running' },
  
  // Emotional expressions
  'smile': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  'smiles': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  'grin': { animation: 'Happy', emotionGlow: '#ffeb3b' },
  'grins': { animation: 'Happy', emotionGlow: '#ffeb3b' },
  'laugh': { animation: 'Happy', emotionGlow: '#ff9800' },
  'laughs': { animation: 'Happy', emotionGlow: '#ff9800' },
  'chuckle': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  'chuckles': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  'giggle': { animation: 'Happy', emotionGlow: '#ffeb3b' },
  'giggles': { animation: 'Happy', emotionGlow: '#ffeb3b' },
  'beam': { animation: 'Happy', emotionGlow: '#ff9800' },
  'beams': { animation: 'Happy', emotionGlow: '#ff9800' },
  'excited': { animation: 'Happy', emotionGlow: '#ff9800' },
  'happy': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  'warmly': { animation: 'a_Idle_Happy', emotionGlow: '#ffeb3b' },
  
  // Thinking/curiosity
  'think': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'thinks': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'ponder': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'ponders': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'consider': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'considers': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'curious': { animation: 'Puzzled', emotionGlow: '#00bcd4' },
  'confused': { animation: 'Puzzled', emotionGlow: '#ff5722' },
  'puzzled': { animation: 'Puzzled', emotionGlow: '#ff5722' },
  'wonder': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  'wonders': { animation: 'Puzzled', emotionGlow: '#9c27b0' },
  
  // Alert/attention
  'perk': { animation: 'a_Idle_Battle', emotionGlow: '#00bcd4' },
  'perks': { animation: 'a_Idle_Battle', emotionGlow: '#00bcd4' },
  'alert': { animation: 'a_Idle_Battle', emotionGlow: '#00bcd4' },
  'attentive': { animation: 'a_Idle_Battle', emotionGlow: '#00bcd4' },
  'listen': { animation: 'a_Idle', emotionGlow: '#4caf50' },
  'listens': { animation: 'a_Idle', emotionGlow: '#4caf50' },
  
  // Celebratory
  'celebrate': { animation: 'Fist Pump', emotionGlow: '#ff9800' },
  'celebrates': { animation: 'Fist Pump', emotionGlow: '#ff9800' },
  'cheer': { animation: 'Victory Idle', emotionGlow: '#ffeb3b' },
  'cheers': { animation: 'Victory Idle', emotionGlow: '#ffeb3b' },
  'victory': { animation: 'Victory Idle', emotionGlow: '#ffeb3b' },
  'triumph': { animation: 'Victory Idle', emotionGlow: '#ffeb3b' },
  
  // Calm/relaxed
  'relax': { animation: 'a_Idle_Relaxed', emotionGlow: '#4caf50' },
  'relaxes': { animation: 'a_Idle_Relaxed', emotionGlow: '#4caf50' },
  'calm': { animation: 'a_Idle_Relaxed', emotionGlow: '#4caf50' },
  'sigh': { animation: 'a_Idle_Relaxed', emotionGlow: '#2196f3' },
  'sighs': { animation: 'a_Idle_Relaxed', emotionGlow: '#2196f3' },
  
  // Negative emotions
  'frown': { animation: 'a_Idle_Scared', emotionGlow: '#2196f3' },
  'frowns': { animation: 'a_Idle_Scared', emotionGlow: '#2196f3' },
  'sad': { animation: 'a_Idle_Scared', emotionGlow: '#2196f3' },
  'worried': { animation: 'a_Idle_Scared', emotionGlow: '#9c27b0' },
  'nervous': { animation: 'a_Idle_Scared', emotionGlow: '#9c27b0' },
  'scared': { animation: 'a_Idle_Scared', emotionGlow: '#9c27b0' },
  'angry': { animation: 'a_Idle_Battle', emotionGlow: '#f44336' },
  'frustrated': { animation: 'a_Idle_Battle', emotionGlow: '#e91e63' },
};

/**
 * Parse a response to extract actions (text between asterisks)
 * and map them to appropriate animations
 */
export function parseResponseActions(text: string): ParsedResponse {
  const actionRegex = /\*([^*]+)\*/g;
  const actions: ParsedAction[] = [];
  
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    const actionText = match[1].trim();
    const mappedAction = mapActionToAnimation(actionText);
    actions.push({
      text: actionText,
      ...mappedAction,
    });
  }
  
  // Remove actions from text for display and TTS
  const cleanText = text.replace(actionRegex, '').replace(/\s+/g, ' ').trim();
  
  return {
    spokenText: cleanText,
    displayText: cleanText,
    actions,
  };
}

/**
 * Map action text to an animation by finding keywords
 */
function mapActionToAnimation(actionText: string): { animation: string; emotionGlow?: string } {
  const lowerText = actionText.toLowerCase();
  
  // Check each keyword
  for (const [keyword, mapping] of Object.entries(actionKeywordMap)) {
    if (lowerText.includes(keyword)) {
      return mapping;
    }
  }
  
  // Default to idle if no match
  return { animation: 'a_Idle' };
}

/**
 * Get the primary action from a list (first one, or most expressive)
 */
export function getPrimaryAction(actions: ParsedAction[]): ParsedAction | null {
  if (actions.length === 0) return null;
  
  // Prioritize actions with emotion glow (more expressive)
  const expressiveAction = actions.find(a => a.emotionGlow);
  if (expressiveAction) return expressiveAction;
  
  // Otherwise return the first action
  return actions[0];
}
