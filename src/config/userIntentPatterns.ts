/**
 * User Intent Pattern Configuration
 * Data-driven patterns for recognizing user responses
 * Makes the system flexible to handle unexpected variations
 */

/**
 * Confirmation/Affirmative patterns - Flexible set that covers common variations
 * Add new variations here without touching code logic
 */
export const AFFIRMATIVE_PATTERNS = [
  // Direct yes
  'yes',
  'yep',
  'yeah',
  'yah',
  'ya',
  'y',
  'yup',
  // Strong affirmations
  'absolutely',
  'definitely',
  'certainly',
  'sure',
  'of course',
  'okay',
  'ok',
  'alright',
  'all right',
  'fine',
  // Agreement/Confirmation
  'correct',
  'that\'s right',
  'thats right',
  'exactly',
  'affirmative',
  'confirmed',
  'true',
  // Casual affirmations
  'for sure',
  'no doubt',
  'you bet',
  'sounds good',
  'works for me',
  'i agree',
  'amen',
];

/**
 * Negative/Denial patterns
 * Add variations to be recognized as negative responses
 */
export const NEGATIVE_PATTERNS = [
  // Direct no
  'no',
  'nope',
  'nah',
  'n',
  'nooo',
  'noooo',
  // Negation
  'not really',
  'not at all',
  'not exactly',
  // Contradiction
  'incorrect',
  'wrong',
  'that\'s wrong',
  'thats wrong',
  'not correct',
  'not true',
  'false',
  // Refusal/Disagreement
  'i disagree',
  'i don\'t agree',
  'don\'t think so',
  'not likely',
  'not going to happen',
  'negative',
  // Casual negations
  'nah uh',
  'uh uh',
  'never',
];

/**
 * "I don't know" / Skip patterns
 * Covers various ways users express uncertainty or want to skip
 */
export const SKIP_PATTERNS = [
  'i don\'t know',
  'i dont know',
  'don\'t know',
  'dont know',
  'don\'t know',
  'i\'m not sure',
  'im not sure',
  'not sure',
  'unsure',
  'not certain',
  'uncertain',
  'no idea',
  'no clue',
  'beats me',
  'dunno',
  'duno',
  'can\'t remember',
  'cant remember',
  'don\'t remember',
  'dont remember',
  'do not remember',
  'can\'t recall',
  'cant recall',
  'don\'t recall',
  'dont recall',
  'don\'t have it',
  'dont have it',
  'don\'t have that info',
  'cant say',
  'can\'t say',
  'no comment',
  'prefer not to say',
  'rather not say',
  'rather not',
  'skip',
  'pass',
  'not applicable',
  'n/a',
  'na',
  'not relevant',
  'irrelevant',
  'doesn\'t apply',
  'doesnt apply',
  'doesn\'t pertain',
  'not pertinent',
  'not applicable to me',
  'not sure how to answer',
  'can\'t answer that',
  'cant answer that',
];

/**
 * Clarification request patterns
 * Detect when user is asking for explanation instead of answering
 */
export const CLARIFICATION_PATTERNS = [
  'what do you mean',
  'what does that mean',
  'explain',
  'can you explain',
  'i don\'t understand',
  'i dont understand',
  'i\'m confused',
  'im confused',
  'what are you asking',
  'what\'s that',
  'whats that',
  'huh',
  'pardon',
  'come again',
  'can you rephrase',
  'say that again',
  'repeat that',
  'can you repeat',
  'what do you want to know',
  'not sure what you mean',
  'confused about what you mean',
];

/**
 * Convert patterns to regex for flexible matching
 * Case-insensitive, handles whitespace variations
 */
export function createPatternRegex(patterns: string[]): RegExp[] {
  return patterns.map(pattern => {
    // Escape special regex chars but keep apostrophes flexible
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\'/g, "'?"); // Make apostrophes optional
    return new RegExp(`^${escaped}$`, 'i');
  });
}

export const AFFIRMATIVE_REGEX = createPatternRegex(AFFIRMATIVE_PATTERNS);
export const NEGATIVE_REGEX = createPatternRegex(NEGATIVE_PATTERNS);
export const SKIP_REGEX = createPatternRegex(SKIP_PATTERNS);
export const CLARIFICATION_REGEX = createPatternRegex(CLARIFICATION_PATTERNS);

/**
 * Test if a user response matches any pattern category
 */
export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE_REGEX.some(regex => regex.test(text.trim()));
}

export function isNegative(text: string): boolean {
  return NEGATIVE_REGEX.some(regex => regex.test(text.trim()));
}

export function isSkip(text: string): boolean {
  return SKIP_REGEX.some(regex => regex.test(text.trim()));
}

export function isClarificationRequest(text: string): boolean {
  return CLARIFICATION_REGEX.some(regex => regex.test(text.trim()));
}

/**
 * Determine user intent from their response
 * Returns: 'AFFIRMATIVE' | 'NEGATIVE' | 'SKIP' | 'CLARIFY' | 'ANSWER' | 'UNCLEAR'
 */
export function determineUserIntent(text: string): 'AFFIRMATIVE' | 'NEGATIVE' | 'SKIP' | 'CLARIFY' | 'ANSWER' | 'UNCLEAR' {
  const trimmed = text.trim();

  if (isAffirmative(trimmed)) return 'AFFIRMATIVE';
  if (isNegative(trimmed)) return 'NEGATIVE';
  if (isSkip(trimmed)) return 'SKIP';
  if (isClarificationRequest(trimmed)) return 'CLARIFY';

  // If response is substantial (3+ words), likely an answer
  if (trimmed.split(/\s+/).length >= 3 && !trimmed.includes('?')) {
    return 'ANSWER';
  }

  return 'UNCLEAR';
}
