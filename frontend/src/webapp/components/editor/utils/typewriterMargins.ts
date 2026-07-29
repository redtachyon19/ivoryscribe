export type { Margins } from "../../../../core/utils/projects"
export { DEFAULT_MARGINS } from "../../../../core/utils/projects"

export const PAGE_W_PX = 816
export const PAGE_H_PX = 1056
export const PAGE_GAP_PX = 40

export const MIN_MARGIN_IN = 0.25
export const MAX_MARGIN_IN = 3.0

export function inToPx(inches: number) {
  return Math.round(inches * 96)
}
