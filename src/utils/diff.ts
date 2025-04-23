/**
 * Simple utility functions to highlight the differences between text strings for console output
 */

/**
 * Highlights the additions in the "after" text compared to the "before" text
 * @param before Original text
 * @param after Modified text
 * @returns A formatted string with additions highlighted
 */
export function highlightAdditions(before: string, after: string): string {
  // Check if the 'after' string contains the 'before' string plus additional content
  if (after.includes(before) && before !== after) {
    // Find the addition by removing the 'before' string from the 'after' string
    const addition = after.replace(before, "").trim();
    // Format the output with the original text and the highlighted addition
    return `${before} ${addition
      .split(" ")
      .map((word) => `\x1b[32m${word}\x1b[0m`)
      .join(" ")}`;
  }

  // If simple inclusion doesn't work, we'll just return the full "after" string
  return after;
}

/**
 * Highlights the removals in the "before" text compared to the "after" text
 * @param before Original text
 * @param after Modified text
 * @returns A formatted string highlighting what was removed
 */
export function highlightRemovals(before: string, after: string): string {
  // This is a very simplified approach - we'll show what was in "before"
  // and cross out what's not in "after"
  const lines = before.split(" ");

  // For each word in before, check if removed in after
  const result = lines
    .map((word) => {
      if (!after.includes(word) && word.startsWith("@")) {
        // If the word starts with @ and is removed, highlight it
        return `\x1b[31m${word}\x1b[0m`;
      }
      return word;
    })
    .join(" ");

  return result;
}

/**
 * Format a message to highlight the changes between before and after
 * @param before Original message
 * @param after New message
 * @param type Type of operation ('add' or 'remove')
 * @returns Formatted string with highlights
 */
export function formatMessageDiff(
  before: string,
  after: string,
  type: "add" | "remove",
): string {
  if (type === "add") {
    return highlightAdditions(before, after);
  } else {
    // remove
    return highlightRemovals(before, after);
  }
}
