// The marketing site only needs the palette *type* for its theme swatches, not
// the app's DOM/theme runtime (which lives in frontend/src/core/utils/appearance).
// Kept in sync manually — this is a stable value type.
export type Palette =
  | "ivory"
  | "elephant"
  | "midnight"
  | "sunset"
  | "woodland"
  | "glacier"
  | "custom"
