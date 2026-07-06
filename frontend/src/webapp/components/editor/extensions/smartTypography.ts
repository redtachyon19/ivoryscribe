// Smart-typography input rules for the prose editors (Drafting + Typewriter).
//
//   --                 → en dash (–)        on the next non-hyphen keystroke
//   ---                → em dash (—)         on the next non-hyphen keystroke
//   <space>-<space>    → minus sign (−)      space-hyphen-space
//   ------             → horizontal rule     a full-line divider on its own line
//
// Trigger model: a run of hyphens only converts once you type a NON-hyphen after
// it, so you can reach 3 (em) and 6 (divider) without `--` converting to an en
// dash first. The 6-hyphen divider fires once the line is exactly six hyphens.
// Every rule is `undoable` (TipTap default), so pressing Backspace right after a
// conversion reverts it to the literal hyphens you typed.
//
// HorizontalRule note: StarterKit's built-in HorizontalRule turns `---` into a
// rule, which would collide with the em dash AND make the 6-hyphen divider
// unreachable (it would fire at 3). So the editors disable it
// (`StarterKit.configure({ horizontalRule: false })`) and register
// `HorizontalRuleSixDashes` (below) instead — same node, six-hyphen input rule.

import { Extension, InputRule, nodeInputRule } from "@tiptap/core"
// Transitive dep of @tiptap/starter-kit (which depends on ^3.20.1), so always
// installed; imported directly here because we replace its default input rule.
import HorizontalRule from "@tiptap/extension-horizontal-rule"

const EN_DASH = "–"
const EM_DASH = "—"
const MINUS_SIGN = "−"

export const SmartTypographyExtension = Extension.create({
  name: "smartTypography",

  addInputRules() {
    return [
      // space-hyphen-space → space-minus-space (keep both spaces).
      new InputRule({
        find: /(\s)-(\s)$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${match[1] ?? ""}${MINUS_SIGN}${match[2] ?? ""}`, range.from, range.to)
        },
      }),
      // exactly three hyphens, then a non-hyphen → em dash (keep the trigger char).
      // Listed before the two-hyphen rule; the lookbehind already disambiguates.
      new InputRule({
        find: /(?<!-)-{3}([^-])$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${EM_DASH}${match[1] ?? ""}`, range.from, range.to)
        },
      }),
      // exactly two hyphens, then a non-hyphen → en dash.
      new InputRule({
        find: /(?<!-)-{2}([^-])$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${EN_DASH}${match[1] ?? ""}`, range.from, range.to)
        },
      }),
    ]
  },
})

// HorizontalRule with its input rule changed from StarterKit's `---` to six
// hyphens alone on a line. Must be paired with
// `StarterKit.configure({ horizontalRule: false })` so the node isn't defined
// twice.
export const HorizontalRuleSixDashes = HorizontalRule.extend({
  addInputRules() {
    return [nodeInputRule({ find: /^-{6}$/, type: this.type })]
  },
})
