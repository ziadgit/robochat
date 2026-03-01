/**
 * Secret World System - Sky Island mini-game
 * Handles warp commands, game state, and collectible orbs
 */

// ============================================
// WARP COMMAND DETECTION
// ============================================

const WARP_SECRET_KEYWORDS = [
  'warp secret',
  'warp to secret',
  'secret warp',
  'take me to the secret',
  'go to secret',
  'secret world',
  'sky island',
  'take me to sky island',
];

const WARP_HOME_KEYWORDS = [
  'warp home',
  'warp back',
  'return home',
  'go home',
  'go back',
  'take me home',
  'take me back',
  'leave island',
  'leave sky island',
  'exit island',
  'home',
];

/**
 * Detect if the user wants to warp to the secret Sky Island
 */
export function isWarpSecretCommand(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  return WARP_SECRET_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Detect if the user wants to return home from the secret world
 */
export function isWarpHomeCommand(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  return WARP_HOME_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// ============================================
// GAME COMMAND DETECTION
// ============================================

export type GameCommand = 'left' | 'right' | 'forward' | 'back' | 'collect' | 'magic';

const GAME_COMMAND_KEYWORDS: Record<GameCommand, string[]> = {
  left: ['go left', 'turn left', 'move left', 'left'],
  right: ['go right', 'turn right', 'move right', 'right'],
  forward: ['go forward', 'move forward', 'forward', 'go ahead', 'straight'],
  back: ['go back', 'move back', 'backward', 'backwards', 'reverse'],
  collect: ['collect', 'grab', 'get it', 'pick up', 'gather'],
  magic: ['magic', 'auto', 'find it', 'go to orb', 'find orb', 'help me'],
};

/**
 * Detect game commands for controlling the robot on Sky Island
 */
export function detectGameCommand(text: string): GameCommand | null {
  const lowerText = text.toLowerCase().trim();
  
  for (const [command, keywords] of Object.entries(GAME_COMMAND_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return command as GameCommand;
      }
    }
  }
  
  return null;
}

// ============================================
// GAME STATE MANAGEMENT
// ============================================

export interface OrbState {
  id: number;
  position: [number, number, number]; // x, y, z
  collected: boolean;
}

export interface GameState {
  orbs: OrbState[];
  robotPosition: [number, number, number];
  robotRotation: number; // Y-axis rotation in radians
  completed: boolean;
  orbsCollected: number;
  totalOrbs: number;
}

// Predefined orb positions on the Sky Island (adjusted for GLTF island scale 0.24)
const ORB_POSITIONS: [number, number, number][] = [
  [1.6, 0.9, 0.4],   // Orb 1 - right side of island, hovering above ground
  [-1.2, 1.0, -0.6], // Orb 2 - left back of island, slightly higher
];

/**
 * Create initial game state for Sky Island
 */
export function createInitialGameState(): GameState {
  const orbs: OrbState[] = ORB_POSITIONS.map((position, index) => ({
    id: index,
    position,
    collected: false,
  }));
  
  return {
    orbs,
    robotPosition: [0, 1.51, 1.0], // Starting position on island surface
    robotRotation: 0,
    completed: false,
    orbsCollected: 0,
    totalOrbs: orbs.length,
  };
}

/**
 * Calculate distance between robot and an orb
 */
export function getDistanceToOrb(robotPos: [number, number, number], orbPos: [number, number, number]): number {
  const dx = robotPos[0] - orbPos[0];
  const dy = robotPos[1] - orbPos[1];
  const dz = robotPos[2] - orbPos[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Find the nearest uncollected orb
 */
export function findNearestOrb(gameState: GameState): OrbState | null {
  const uncollected = gameState.orbs.filter(orb => !orb.collected);
  if (uncollected.length === 0) return null;
  
  let nearest: OrbState | null = null;
  let minDistance = Infinity;
  
  for (const orb of uncollected) {
    const distance = getDistanceToOrb(gameState.robotPosition, orb.position);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = orb;
    }
  }
  
  return nearest;
}

/**
 * Check if robot is close enough to collect an orb
 */
export function canCollectOrb(robotPos: [number, number, number], orbPos: [number, number, number]): boolean {
  const distance = getDistanceToOrb(robotPos, orbPos);
  return distance < 0.8; // Collection radius
}

/**
 * Get a nearby uncollected orb that can be collected
 */
export function getCollectableOrb(gameState: GameState): OrbState | null {
  for (const orb of gameState.orbs) {
    if (!orb.collected && canCollectOrb(gameState.robotPosition, orb.position)) {
      return orb;
    }
  }
  return null;
}

/**
 * Move robot in a direction
 */
export function moveRobot(
  gameState: GameState, 
  direction: 'left' | 'right' | 'forward' | 'back'
): GameState {
  const moveSpeed = 0.5;
  const turnSpeed = Math.PI / 4; // 45 degrees
  
  let newPosition = [...gameState.robotPosition] as [number, number, number];
  let newRotation = gameState.robotRotation;
  
  switch (direction) {
    case 'left':
      newRotation += turnSpeed;
      newPosition[0] -= Math.cos(newRotation) * moveSpeed;
      newPosition[2] -= Math.sin(newRotation) * moveSpeed;
      break;
    case 'right':
      newRotation -= turnSpeed;
      newPosition[0] += Math.cos(newRotation) * moveSpeed;
      newPosition[2] += Math.sin(newRotation) * moveSpeed;
      break;
    case 'forward':
      newPosition[0] += Math.sin(newRotation) * moveSpeed;
      newPosition[2] -= Math.cos(newRotation) * moveSpeed;
      break;
    case 'back':
      newPosition[0] -= Math.sin(newRotation) * moveSpeed;
      newPosition[2] += Math.cos(newRotation) * moveSpeed;
      break;
  }
  
  // Clamp position to island bounds (roughly)
  newPosition[0] = Math.max(-5.0, Math.min(5.0, newPosition[0]));
  newPosition[2] = Math.max(-5.0, Math.min(5.0, newPosition[2]));
  
  return {
    ...gameState,
    robotPosition: newPosition,
    robotRotation: newRotation,
  };
}

/**
 * Move robot directly to the nearest orb (magic command)
 */
export function magicMoveToOrb(gameState: GameState): GameState {
  const nearestOrb = findNearestOrb(gameState);
  if (!nearestOrb) return gameState;
  
  // Move to a position just next to the orb (within collection range)
  const targetPos: [number, number, number] = [
    nearestOrb.position[0] * 0.7, // Move towards but not exactly on
    gameState.robotPosition[1],
    nearestOrb.position[2] * 0.7,
  ];
  
  // Calculate rotation to face the orb
  const dx = nearestOrb.position[0] - targetPos[0];
  const dz = nearestOrb.position[2] - targetPos[2];
  const targetRotation = Math.atan2(dx, -dz);
  
  return {
    ...gameState,
    robotPosition: targetPos,
    robotRotation: targetRotation,
  };
}

/**
 * Collect an orb and update game state
 */
export function collectOrb(gameState: GameState, orbId: number): GameState {
  const newOrbs = gameState.orbs.map(orb => 
    orb.id === orbId ? { ...orb, collected: true } : orb
  );
  
  const orbsCollected = newOrbs.filter(o => o.collected).length;
  const completed = orbsCollected === gameState.totalOrbs;
  
  return {
    ...gameState,
    orbs: newOrbs,
    orbsCollected,
    completed,
  };
}

// ============================================
// SOUND EFFECTS
// ============================================

/**
 * Play the warp whistle sound effect
 */
export function playWarpSound(): void {
  if (typeof window === 'undefined') return;
  
  const audio = new Audio('/sounds/whistle.wav');
  audio.volume = 0.7;
  audio.play().catch(() => {
    // Ignore autoplay restrictions - sound will play on next user interaction
  });
}

/**
 * Play a collection sound (using a simple beep for now)
 */
export function playCollectSound(): void {
  if (typeof window === 'undefined') return;
  
  // Create a simple synth "ding" sound using Web Audio API
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch {
    // Ignore audio errors
  }
}

// ============================================
// GAME MESSAGES
// ============================================

export const GAME_MESSAGES = {
  welcome: "Welcome to the Sky Island! I see 2 celestial orbs waiting to be gathered. Guide me with your voice - say 'go left', 'go right', 'forward', or 'magic' to auto-navigate to the nearest orb!",
  nearOrb: "I sense an orb nearby! Say 'collect' to gather it!",
  collected: "Got it! The orb's energy flows into us.",
  allCollected: "All orbs gathered! The celestial energy is ours! +50 Tide XP!",
  magic: "Following the celestial pull...",
  moving: "On my way!",
  noOrbs: "No orbs nearby to collect. Keep exploring!",
  returnHome: "Warping back to the Cosmic Aquarium...",
};
