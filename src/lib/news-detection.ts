/**
 * News Query Detection
 * Detects when a user query is related to current news and events
 */

// Time-based news phrases
const TIME_BASED_KEYWORDS = [
  "today's news", "this week's news", "this month's news",
  "latest news", "recent news", "current events",
  "what's happening", "what happened today", "what happened this week",
];

// General news terms
const NEWS_KEYWORDS = [
  'headlines', 'breaking news', 'top stories', 'news update',
  'news today', 'in the news', 'news report',
];

// Positive news specific
const GOOD_NEWS_KEYWORDS = [
  'good news', 'positive news', 'uplifting news', 'feel-good news',
];

// Combined for detection
const ALL_NEWS_KEYWORDS = [
  ...TIME_BASED_KEYWORDS,
  ...NEWS_KEYWORDS,
  ...GOOD_NEWS_KEYWORDS,
];

/**
 * Check if a query is news-related
 * @param text - The user's query text
 * @returns true if the query appears to be about news/current events
 */
export function isNewsQuery(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check for news keywords/phrases
  for (const keyword of ALL_NEWS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }
  
  // Also check for standalone "news" with context clues
  if (lowerText.includes('news') && 
      (lowerText.includes('what') || 
       lowerText.includes('any') || 
       lowerText.includes('tell me') ||
       lowerText.includes('show me') ||
       lowerText.includes('give me'))) {
    return true;
  }
  
  return false;
}

/**
 * Check if the query is specifically asking for good/positive news
 */
export function isGoodNewsQuery(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  for (const keyword of GOOD_NEWS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}
