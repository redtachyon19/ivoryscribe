import { Extension, InputRule, nodeInputRule } from "@tiptap/core"
import HorizontalRule from "@tiptap/extension-horizontal-rule"

const EN_DASH = "–"
const EM_DASH = "—"
const MINUS_SIGN = "−"

export const SmartTypographyExtension = Extension.create({
  name: "smartTypography",

  addInputRules() {
    return [
      new InputRule({
        find: /(\s)-(\s)$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${match[1] ?? ""}${MINUS_SIGN}${match[2] ?? ""}`, range.from, range.to)
        },
      }),
      new InputRule({
        find: /(?<!-)-{3}([^-])$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${EM_DASH}${match[1] ?? ""}`, range.from, range.to)
        },
      }),
      new InputRule({
        find: /(?<!-)-{2}([^-])$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${EN_DASH}${match[1] ?? ""}`, range.from, range.to)
        },
      }),
    ]
  },
})

export const HorizontalRuleSixDashes = HorizontalRule.extend({
  addInputRules() {
    return [nodeInputRule({ find: /^-{6}$/, type: this.type })]
  },
})
