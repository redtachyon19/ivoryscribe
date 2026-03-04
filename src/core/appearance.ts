export const FONT_OPTIONS = [
  { label: "Times (Default)", value: '"Times", "Times New Roman", serif' },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Roboto Mono", value: '"Roboto Mono", monospace' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
  { label: "EB Garamond", value: '"EB Garamond", serif' },
  { label: "Montserrat", value: '"Montserrat", sans-serif' },
] as const

export type Palette = "ivory" | "elephant" | "midnight" | "sunset" | "woodland" | "glacier" | "custom"

export const PALETTE_OPTIONS: { label: string; value: Palette }[] = [
  { label: "Ivory Tusk (Default)", value: "ivory" },
  { label: "Elephant (Dark Mode)", value: "elephant" },
  { label: "Moon & Midnight", value: "midnight" },
  { label: "Sunset Savannah", value: "sunset" },
  { label: "Woodland Forrest", value: "woodland" },
  { label: "Glaciers & Waterfalls", value: "glacier" },
  { label: "(Custom)", value: "custom" },
]
