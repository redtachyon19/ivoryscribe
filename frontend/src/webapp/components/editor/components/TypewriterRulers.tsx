// Horizontal + vertical rulers + corner toggle for TypewriterEditor.
//
// Pure presentation: the parent computes margin/indent values via
// `useRulerDrag` and passes them in. This component renders the tick marks,
// rails, and drag handles.

import type { CSSProperties, RefObject } from "react"
import { RulerDimensionLine, X } from "lucide-react"
import { PAGE_GAP_PX, PAGE_H_PX, PAGE_W_PX, type Margins, inToPx } from "../utils/typewriterMargins"
import type { RulerSide } from "../hooks/useRulerDrag"

type TypewriterRulersProps = {
  isUiTyping: boolean
  showRulers: boolean
  onToggleRulers: () => void
  rulerXRef: RefObject<HTMLDivElement | null>
  rulerYRef: RefObject<HTMLDivElement | null>
  numPages: number
  margins: Margins
  hasNonEmptySelection: boolean
  selIndentLeftPx: number
  selIndentRightPx: number
  leftHandleX: number
  rightHandleX: number
  handleRulerDown: (side: RulerSide, pageTop?: number) => (event: React.MouseEvent) => void
}

export function TypewriterRulerRow({
  isUiTyping,
  showRulers,
  onToggleRulers,
  rulerXRef,
  margins,
  hasNonEmptySelection,
  selIndentLeftPx,
  selIndentRightPx,
  leftHandleX,
  rightHandleX,
  handleRulerDown,
}: Pick<
  TypewriterRulersProps,
  | "isUiTyping"
  | "showRulers"
  | "onToggleRulers"
  | "rulerXRef"
  | "margins"
  | "hasNonEmptySelection"
  | "selIndentLeftPx"
  | "selIndentRightPx"
  | "leftHandleX"
  | "rightHandleX"
  | "handleRulerDown"
>) {
  const xTicks = Array.from({ length: 20 }, (_, i) => {
    const x = Math.round((i * 0.5) * 96)
    return x <= PAGE_W_PX ? { x, major: i % 2 === 0, label: i / 2 } : null
  }).filter(Boolean) as { x: number; major: boolean; label: number }[]

  return (
    <div className="tw-ruler-row">
      <div className="tw-corner-bg" aria-hidden="true" />
      <div className="tw-corner-spacer" aria-hidden="true" />

      <div
        className={`tw-ruler-x${isUiTyping ? " tw-ruler-x--typing" : ""}${!showRulers ? " tw-ruler-x--hidden" : ""}`}
        ref={rulerXRef}
        style={{ width: PAGE_W_PX } as CSSProperties}
        aria-hidden="true"
      >
        {xTicks.map(({ x, major, label }) => (
          <div
            key={x}
            className={`tw-ruler__tick tw-ruler__tick--x${major ? " tw-ruler__tick--major" : " tw-ruler__tick--minor"}`}
            style={{ left: x }}
          >
            {major && x > 0 && x < PAGE_W_PX ? (
              <span className="tw-ruler__label">{label}</span>
            ) : null}
          </div>
        ))}

        <div
          className={`tw-ruler__handle tw-ruler__handle--x${hasNonEmptySelection ? " tw-ruler__handle--indent" : ""}`}
          style={{ left: leftHandleX }}
          onMouseDown={handleRulerDown("left")}
          title={hasNonEmptySelection
            ? `Left indent: ${(selIndentLeftPx / 96).toFixed(2)} in`
            : `Left margin: ${margins.left.toFixed(2)} in`}
        />
        <div
          className={`tw-ruler__handle tw-ruler__handle--x${hasNonEmptySelection ? " tw-ruler__handle--indent" : ""}`}
          style={{ left: rightHandleX }}
          onMouseDown={handleRulerDown("right")}
          title={hasNonEmptySelection
            ? `Right indent: ${(selIndentRightPx / 96).toFixed(2)} in`
            : `Right margin: ${margins.right.toFixed(2)} in`}
        />
      </div>

      <button
        type="button"
        className={`tw-corner-btn${isUiTyping ? " tw-corner-btn--typing" : ""}`}
        onClick={onToggleRulers}
        title={showRulers ? "Hide rulers" : "Show rulers"}
        aria-label={showRulers ? "Hide rulers" : "Show rulers"}
      >
        <span className={`tw-corner-btn__icon${showRulers ? " tw-corner-btn__icon--visible" : ""}`} aria-hidden="true">
          <X size={14} />
        </span>
        <span className={`tw-corner-btn__icon${!showRulers ? " tw-corner-btn__icon--visible" : ""}`} aria-hidden="true">
          <RulerDimensionLine size={14} />
        </span>
      </button>
    </div>
  )
}

export function TypewriterRulerY({
  isUiTyping,
  showRulers,
  rulerYRef,
  numPages,
  margins,
  handleRulerDown,
}: Pick<
  TypewriterRulersProps,
  "isUiTyping" | "showRulers" | "rulerYRef" | "numPages" | "margins" | "handleRulerDown"
>) {
  const mTopPx = inToPx(margins.top)
  const mBottomPx = inToPx(margins.bottom)
  const totalH = numPages * PAGE_H_PX + (numPages - 1) * PAGE_GAP_PX

  const yTicks = Array.from({ length: 24 }, (_, i) => {
    const y = Math.round((i * 0.5) * 96)
    return y <= PAGE_H_PX ? { y, major: i % 2 === 0, label: i / 2 } : null
  }).filter(Boolean) as { y: number; major: boolean; label: number }[]

  // Ticks across every page, offset by each page's top position.
  const allYTicks = Array.from({ length: numPages }, (_, pageIndex) => {
    const pageTop = pageIndex * (PAGE_H_PX + PAGE_GAP_PX)
    return yTicks.map((t) => ({ ...t, absY: pageTop + t.y, pageIndex }))
  }).flat()

  return (
    <div
      className={`tw-ruler-y${isUiTyping || !showRulers ? " tw-ruler-y--typing" : ""}`}
      ref={rulerYRef}
      style={{ height: totalH + 48 } as CSSProperties}
      aria-hidden="true"
    >
      {/* Per-page rails: bg + right border for each page; gaps stay empty */}
      {Array.from({ length: numPages }, (_, i) => (
        <div
          key={`rail-${i}`}
          className="tw-ruler-y-rail"
          style={{
            top: i * (PAGE_H_PX + PAGE_GAP_PX),
            height: PAGE_H_PX,
          } as CSSProperties}
        />
      ))}

      {/* Ticks for every page */}
      {allYTicks.map(({ absY, major, label, pageIndex }) => (
        <div
          key={`${pageIndex}-${absY}`}
          className={`tw-ruler__tick tw-ruler__tick--y${major ? " tw-ruler__tick--major" : " tw-ruler__tick--minor"}`}
          style={{ top: absY }}
        >
          {major && label > 0 && label < 11 ? (
            <span className="tw-ruler__label tw-ruler__label--y">{label}</span>
          ) : null}
        </div>
      ))}

      {/* Margin handles repeated on every page */}
      {Array.from({ length: numPages }, (_, pageIndex) => {
        const pageTop = pageIndex * (PAGE_H_PX + PAGE_GAP_PX)
        return (
          <div key={`handles-${pageIndex}`}>
            <div
              className="tw-ruler__handle tw-ruler__handle--y"
              style={{ top: pageTop + mTopPx } as CSSProperties}
              onMouseDown={handleRulerDown("top", pageTop)}
              title={`Top margin: ${margins.top.toFixed(2)} in`}
            />
            <div
              className="tw-ruler__handle tw-ruler__handle--y"
              style={{ top: pageTop + PAGE_H_PX - mBottomPx } as CSSProperties}
              onMouseDown={handleRulerDown("bottom", pageTop)}
              title={`Bottom margin: ${margins.bottom.toFixed(2)} in`}
            />
          </div>
        )
      })}
    </div>
  )
}
