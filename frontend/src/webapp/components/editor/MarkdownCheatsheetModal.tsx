// Reference dialog summarizing the Markdown features the preview renders,
// plus a LaTeX section for the math syntax the marked-katex pipeline
// accepts. Opened from the Info button beside the editor's Settings
// button (rendered for active markdown documents only).

import Modal from "../ui/Modal"
import "./MarkdownCheatsheetModal.css"

type Row = { syntax: string; description: string }

type Section = {
  title: string
  rows: Row[]
}

const MARKDOWN_SECTIONS: Section[] = [
  {
    title: "Text",
    rows: [
      { syntax: "**bold**", description: "Bold" },
      { syntax: "*italic*", description: "Italic" },
      { syntax: "~~strike~~", description: "Strikethrough" },
      { syntax: "`inline code`", description: "Inline code" },
      { syntax: "[label](https://example.com)", description: "Link" },
      { syntax: "![alt](https://…/img.png)", description: "Image" },
    ],
  },
  {
    title: "Headings",
    rows: [
      { syntax: "# Heading 1", description: "H1" },
      { syntax: "## Heading 2", description: "H2" },
      { syntax: "### Heading 3", description: "H3 (down to ######)" },
    ],
  },
  {
    title: "Lists",
    rows: [
      { syntax: "- item", description: "Bulleted (also * or +)" },
      { syntax: "1. item", description: "Numbered" },
      { syntax: "- [x] done\n- [ ] todo", description: "Task list" },
      { syntax: "  - nested", description: "Indent two spaces to nest" },
    ],
  },
  {
    title: "Blocks",
    rows: [
      { syntax: "> quote", description: "Blockquote" },
      { syntax: "```python\ncode\n```", description: "Fenced code (language-aware highlighting)" },
      { syntax: "---", description: "Horizontal rule (also ***)" },
    ],
  },
  {
    title: "Tables (GFM)",
    rows: [
      {
        syntax: "| col 1 | col 2 |\n| ----- | ----- |\n| foo   | bar   |",
        description: "Pipe-delimited table — separator row sets alignment with :--- / :---: / ---:",
      },
    ],
  },
]

const LATEX_SECTIONS: Section[] = [
  {
    title: "Math delimiters",
    rows: [
      { syntax: "$E = mc^2$", description: "Inline math (single dollars)" },
      { syntax: "\\(a^2 + b^2 = c^2\\)", description: "Inline math (backslash parens)" },
      { syntax: "$$\\int_a^b f(x)\\,dx$$", description: "Display math (double dollars)" },
      { syntax: "\\[\\frac{d}{dx} \\sin x = \\cos x\\]", description: "Display math (backslash brackets)" },
    ],
  },
  {
    title: "Common notation",
    rows: [
      { syntax: "\\frac{a}{b}", description: "Fraction" },
      { syntax: "\\sqrt{x}, \\sqrt[3]{x}", description: "Square / nth root" },
      { syntax: "x^{2n}, a_{ij}", description: "Super / subscript (braces for multi-char)" },
      { syntax: "\\sum_{i=0}^{n} i, \\prod, \\int", description: "Sum / product / integral" },
      { syntax: "\\lim_{x \\to \\infty}", description: "Limit" },
      { syntax: "\\vec{v}, \\hat{x}, \\bar{y}", description: "Accents" },
    ],
  },
  {
    title: "Greek & symbols",
    rows: [
      { syntax: "\\alpha \\beta \\gamma \\pi", description: "Lowercase Greek" },
      { syntax: "\\Alpha \\Sigma \\Omega", description: "Uppercase Greek" },
      { syntax: "\\leq \\geq \\neq \\approx", description: "Relations" },
      { syntax: "\\cdot \\times \\pm \\infty", description: "Operators / constants" },
      { syntax: "\\rightarrow \\Leftrightarrow \\mapsto", description: "Arrows" },
    ],
  },
  {
    title: "Structures",
    rows: [
      {
        syntax: "\\begin{matrix}\n  a & b \\\\\n  c & d\n\\end{matrix}",
        description: "Matrix (also pmatrix / bmatrix / vmatrix)",
      },
      {
        syntax: "\\begin{cases}\n  x, & x \\geq 0 \\\\\n  -x, & x < 0\n\\end{cases}",
        description: "Piecewise function",
      },
      { syntax: "\\left( \\frac{a}{b} \\right)", description: "Auto-sized delimiters" },
    ],
  },
]

function CheatsheetSection({ section }: { section: Section }) {
  return (
    <section className="markdown-cheatsheet__section">
      <h4 className="markdown-cheatsheet__section-title">{section.title}</h4>
      <dl className="markdown-cheatsheet__list">
        {section.rows.map((row) => (
          <div className="markdown-cheatsheet__row" key={`${section.title}::${row.syntax}`}>
            <dt>
              <pre className="markdown-cheatsheet__code">{row.syntax}</pre>
            </dt>
            <dd>{row.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

type MarkdownCheatsheetModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function MarkdownCheatsheetModal({ isOpen, onClose }: MarkdownCheatsheetModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Markdown reference"
      panelClassName="markdown-cheatsheet__panel"
    >
      <div className="markdown-cheatsheet__body">
        <p className="markdown-cheatsheet__intro">
          The preview renders GitHub-Flavored Markdown. Fenced code blocks are syntax-highlighted when a
          language tag is given (e.g. <code>```python</code>). Math is rendered with KaTeX.
        </p>

        <div className="markdown-cheatsheet__group">
          <h3 className="markdown-cheatsheet__group-title">Markdown</h3>
          {MARKDOWN_SECTIONS.map((section) => (
            <CheatsheetSection key={section.title} section={section} />
          ))}
        </div>

        <div className="markdown-cheatsheet__group">
          <h3 className="markdown-cheatsheet__group-title">LaTeX (KaTeX)</h3>
          {LATEX_SECTIONS.map((section) => (
            <CheatsheetSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </Modal>
  )
}
