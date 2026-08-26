/**
 * Normalize newlines to LF so local strings share the same character index
 * space as Pronunciation Score API spans (`details.reference_newline === "lf"`).
 */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
