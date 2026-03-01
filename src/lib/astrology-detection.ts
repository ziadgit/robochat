/**
 * Astrology Query Detection
 * Detects when a user query is related to celestial events, zodiac, or astrology
 */

// Zodiac signs
const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

// Celestial events and astrology terms
const ASTROLOGY_KEYWORDS = [
  // Celestial events
  'retrograde', 'eclipse', 'lunar eclipse', 'solar eclipse',
  'full moon', 'new moon', 'moon phase', 'supermoon',
  'equinox', 'solstice', 'meteor shower', 'comet',
  
  // Planetary
  'mercury retrograde', 'venus retrograde', 'mars retrograde',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  'planetary alignment', 'conjunction', 'opposition',
  
  // Astrology terms
  'horoscope', 'birth chart', 'natal chart', 'rising sign',
  'sun sign', 'moon sign', 'ascendant', 'descendant',
  'zodiac', 'astrology', 'astrological',
  'transit', 'house', 'aspect',
  
  // Celestial bodies
  'stars', 'constellation', 'celestial',
];

/**
 * Check if a query is astrology-related
 * @param text - The user's query text
 * @returns true if the query appears to be about astrology/celestial events
 */
export function isAstrologyQuery(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check for zodiac signs
  for (const sign of ZODIAC_SIGNS) {
    if (lowerText.includes(sign)) {
      return true;
    }
  }
  
  // Check for astrology keywords
  for (const keyword of ASTROLOGY_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract the primary astrology topic from a query
 * Useful for logging/debugging
 */
export function extractAstrologyTopic(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  // Check zodiac signs first (more specific)
  for (const sign of ZODIAC_SIGNS) {
    if (lowerText.includes(sign)) {
      return sign;
    }
  }
  
  // Check keywords
  for (const keyword of ASTROLOGY_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return keyword;
    }
  }
  
  return null;
}
