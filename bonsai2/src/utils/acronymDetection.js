/**
 * Acronym detection and handling utilities for feed generation
 */

/**
 * Detects if a string is likely an acronym based on multiple heuristics
 * @param {string} text - The text to check
 * @returns {boolean} - True if likely an acronym
 */
export function isLikelyAcronym(text) {
  if (!text || typeof text !== "string") return false;

  const trimmed = text.trim();

  // Heuristics for acronym detection:
  // 1. All uppercase and short (2-6 characters)
  const isAllCaps =
    trimmed === trimmed.toUpperCase() &&
    trimmed.length >= 2 &&
    trimmed.length <= 6;

  // 2. Contains only letters (no spaces, no special chars except maybe periods)
  const isAlphaOnly = /^[A-Z]+$/.test(trimmed.replace(/\./g, ""));

  // 3. Common acronym patterns (e.g., "CHI", "NBA", "AI", "ML")
  const hasAcronymPattern = /^[A-Z]{2,6}$/.test(trimmed);

  return isAllCaps && isAlphaOnly && hasAcronymPattern;
}

/**
 * Processes topics and flags acronyms
 * @param {Array<string>} topics - Array of topic strings
 * @param {string} originalPrompt - The original user intent/prompt for context
 * @returns {Array<{name: string, isAcronym: boolean, context: string}>}
 */
export function processTopicsWithAcronymDetection(topics, originalPrompt = "") {
  return topics.map((topic) => {
    const isAcronym = isLikelyAcronym(topic);

    return {
      name: topic,
      isAcronym,
      context: isAcronym ? originalPrompt : null,
    };
  });
}

/**
 * Converts processed topics to API blueprint format
 * @param {Array} processedTopics - Topics processed by processTopicsWithAcronymDetection
 * @param {number} defaultWeight - Default weight for topics
 * @returns {Array} - API-compatible topic preferences
 */
export function convertToApiFormat(processedTopics, defaultWeight = 0.5) {
  return processedTopics.map(({ name, isAcronym, context }) => ({
    name,
    weight: defaultWeight,
    is_acronym: isAcronym ? 1 : 0,
    context: context || null,
  }));
}

/**
 * Example usage in feed generation:
 *
 * const userIntent = "I want a feed about CHI conference, Ferrari, and NBA basketball";
 * const topics = ["CHI", "Ferrari", "NBA", "basketball"];
 *
 * const processed = processTopicsWithAcronymDetection(topics, userIntent);
 * // Result:
 * // [
 * //   { name: "CHI", isAcronym: true, context: "I want a feed about CHI conference, Ferrari, and NBA basketball" },
 * //   { name: "Ferrari", isAcronym: false, context: null },
 * //   { name: "NBA", isAcronym: true, context: "I want a feed about CHI conference, Ferrari, and NBA basketball" },
 * //   { name: "basketball", isAcronym: false, context: null }
 * // ]
 *
 * const apiFormat = convertToApiFormat(processed, 0.65);
 * // Ready to send to backend API
 */
