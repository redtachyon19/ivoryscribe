/**
 * Every route reports failures as `{ message, details }`. Under strict mode a
 * `catch` binding is `unknown`, and the previous `error.message` was unsound
 * anyway — a thrown string or a rejected non-Error would have made `details`
 * undefined rather than the thrown value.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
