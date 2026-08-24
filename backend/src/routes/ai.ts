import { Router, type Request, type Response } from "express";

const router = Router();

type ProjectTab = { id: string; title: string; children?: ProjectTab[] };

type SanitizedProject = {
  name: string;
  kind: string;
  tabs: ProjectTab[];
  activeId: string | null;
  contentById: Record<string, unknown>;
};

type ContextTab = { tabId: string; tabTitle: string; fullContent: string; plainContent: string };
type ScoredTab = ContextTab & { score: number };

type ModelEdit = {
  id: string;
  tabId: string;
  tabTitle: string;
  summary: string;
  before: string;
  after: string;
  isNew?: boolean;
};

type ProviderId = "gpt" | "claude" | "grok";
type RequestedProvider = ProviderId | "auto";
type ProviderCall = (prompt: string, apiKey: string, modelName: string) => Promise<string>;
type ProviderConfig = { provider: ProviderId; modelName: string; apiKey: string; call: ProviderCall };
type ProviderResult = {
  text: string;
  provider: ProviderId;
  modelName: string;
  fellBackFrom: ProviderId | null;
};

type ChatBody = {
  provider?: unknown;
  message?: unknown;
  project?: unknown;
  mode?: unknown;
};

const REQUESTED_PROVIDERS: RequestedProvider[] = ["auto", "gpt", "claude", "grok"];

function isRequestedProvider(value: unknown): value is RequestedProvider {
  return typeof value === "string" && (REQUESTED_PROVIDERS as string[]).includes(value);
}

/** Provider responses arrive as untyped JSON; read them through this. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const MAX_CONTEXT_CHARS_PER_TAB = 30_000;
const MAX_TOTAL_CONTEXT_CHARS = 250_000;

function stripHtml(value: unknown): string {
  return String(value)
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenTabs(tabs: unknown): { id: string; title: string }[] {
  const result: { id: string; title: string }[] = [];
  const visit = (nodes: ProjectTab[]): void => {
    for (const tab of nodes) {
      result.push({ id: tab.id, title: tab.title });
      visit(tab.children ?? []);
    }
  };
  visit(Array.isArray(tabs) ? (tabs as ProjectTab[]) : []);
  return result;
}

function tokenize(input: unknown): string[] {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreTabForPrompt(promptTokens: string[], title: string, content: string): number {
  if (promptTokens.length === 0) {
    return 0;
  }

  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  let score = 0;

  for (const token of promptTokens) {
    if (titleLower.includes(token)) {
      score += 4;
    }

    const firstIndex = contentLower.indexOf(token);
    if (firstIndex !== -1) {
      score += 2;
      if (firstIndex < 1_500) {
        score += 1;
      }
    }
  }

  return score;
}

function selectRelevantTabs(project: SanitizedProject, userMessage: string): ScoredTab[] {
  const flatTabs = flattenTabs(project.tabs ?? []);
  const promptTokens = tokenize(userMessage);
  const ranked = flatTabs
    .map((tab) => {
      const fullContent = String(project.contentById?.[tab.id] ?? "");
      const plainContent = stripHtml(fullContent);
      const score = scoreTabForPrompt(promptTokens, tab.title, plainContent);

      return {
        tabId: tab.id,
        tabTitle: tab.title,
        score,
        fullContent,
        plainContent,
      };
    })
    .sort((a, b) => b.score - a.score);

  const topScored = ranked.filter((entry) => entry.score > 0).slice(0, 5);
  if (topScored.length > 0) {
    return topScored;
  }

  return ranked.slice(0, Math.min(3, ranked.length));
}

function gatherProjectContext(project: SanitizedProject): ContextTab[] {
  const flatTabs = flattenTabs(project.tabs ?? []);
  return flatTabs.map((tab) => {
    const fullContent = String(project.contentById?.[tab.id] ?? "");
    const plainContent = stripHtml(fullContent);
    return {
      tabId: tab.id,
      tabTitle: tab.title,
      fullContent,
      plainContent,
    };
  });
}

function extractCharacterCandidates(input: string): string[] {
  const names = new Set<string>();
  const phraseMatches = String(input).matchAll(/\bcharacter\s+([A-Z][a-zA-Z'-]+)/g);
  for (const match of phraseMatches) {
    const captured = match[1];
    if (captured) {
      names.add(captured);
    }
  }

  const properNouns = String(input).matchAll(/\b([A-Z][a-zA-Z'-]{2,})\b/g);
  for (const match of properNouns) {
    const captured = match[1];
    if (captured && captured.toLowerCase() !== "chapter") {
      names.add(captured);
    }
  }

  return Array.from(names).slice(0, 3);
}

function detectCharacterLine(content: string, name: string): string | null {
  const lines = content.split(/\r?\n/);
  const loweredName = name.toLowerCase();

  for (const line of lines) {
    if (!line.toLowerCase().includes(loweredName)) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    return trimmed;
  }

  return null;
}

function buildFallbackEdit(tab: ContextTab, userMessage: string, projectName: string): ModelEdit {
  const names = extractCharacterCandidates(userMessage);
  const likelyName = names.find((name) => tab.plainContent.toLowerCase().includes(name.toLowerCase())) ?? names[0] ?? null;

  const styleAnchor = likelyName ? detectCharacterLine(tab.plainContent, likelyName) : null;
  const summarySentence = likelyName
    ? `${likelyName} carries the emotional current in this beat, and their choices should feel internally consistent with earlier scenes.`
    : "This passage should reinforce continuity with prior chapters while sharpening the immediate emotional stakes.";
  const anchorSentence = styleAnchor
    ? `Anchor tone to this prior line: \"${styleAnchor.slice(0, 180)}\".`
    : "Preserve established voice and pacing from this project.";

  const analysisBlock = `\n\n---\nTusk AI Revision (${new Date().toLocaleString()})\nRequest: ${userMessage.trim()}\nContext Project: ${projectName}\nRevision Notes: ${summarySentence} ${anchorSentence}\n`;

  const after = `${tab.fullContent}${analysisBlock}`;

  return {
    id: `${tab.tabId}-fallback-${Date.now()}`,
    tabId: tab.tabId,
    tabTitle: tab.tabTitle,
    summary: likelyName
      ? `Expanded characterization continuity for ${likelyName}.`
      : "Added continuity-driven revision guidance for this section.",
    before: tab.fullContent,
    after,
  };
}

function parseJsonFromText(value: string): unknown {
  const trimmed = String(value).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function makeNewTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ai-new-${crypto.randomUUID()}`;
  }
  return `ai-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeModelEdits(raw: unknown, availableTabsById: Map<string, ContextTab>): ModelEdit[] {
  const rawEdits = asRecord(raw).edits;
  const edits: unknown[] = Array.isArray(rawEdits) ? rawEdits : [];

  return edits
    .map((rawEdit, index): ModelEdit | null => {
      const edit = asRecord(rawEdit);
      const after = typeof edit?.after === "string" ? edit.after : null;
      if (!after) return null;

      if (edit?.isNew === true) {
        const title =
          typeof edit?.title === "string" && edit.title.trim()
            ? edit.title.trim()
            : "Untitled Chapter";
        const newTabId = makeNewTabId();
        return {
          id: typeof edit?.id === "string" ? edit.id : `${newTabId}-model-${index}`,
          tabId: newTabId,
          tabTitle: title,
          summary:
            typeof edit?.summary === "string" && edit.summary.trim()
              ? edit.summary.trim()
              : `New chapter: ${title}`,
          before: "",
          after,
          isNew: true,
        };
      }

      const tabId = typeof edit?.tabId === "string" ? edit.tabId : null;
      if (!tabId) return null;

      const tab = availableTabsById.get(tabId);
      if (!tab) return null;

      if (after === tab.fullContent) return null;

      return {
        id: typeof edit?.id === "string" ? edit.id : `${tabId}-model-${index}`,
        tabId,
        tabTitle: tab.tabTitle,
        summary:
          typeof edit?.summary === "string" && edit.summary.trim()
            ? edit.summary.trim()
            : `Proposed revision for ${tab.tabTitle}`,
        before: tab.fullContent,
        after,
        isNew: false,
      };
    })
    .filter((edit): edit is ModelEdit => edit !== null);
}

function buildInstructionPrompt({ provider, modelName, userMessage, project, contextTabs, scoredTabIds }: { provider: ProviderId; modelName: string; userMessage: string; project: SanitizedProject; contextTabs: ContextTab[]; scoredTabIds: Set<string> }): string {
  const orderedForBudget = [...contextTabs].sort((a, b) => {
    const aRanked = scoredTabIds.has(a.tabId) ? 1 : 0;
    const bRanked = scoredTabIds.has(b.tabId) ? 1 : 0;
    return bRanked - aRanked;
  });

  let usedChars = 0;
  const allocatedById = new Map<string, { content: string; truncated: boolean }>();
  for (const tab of orderedForBudget) {
    if (usedChars >= MAX_TOTAL_CONTEXT_CHARS) {
      allocatedById.set(tab.tabId, { content: "", truncated: true });
      continue;
    }
    const remainingBudget = MAX_TOTAL_CONTEXT_CHARS - usedChars;
    const cap = Math.min(MAX_CONTEXT_CHARS_PER_TAB, remainingBudget);
    const excerpt = tab.fullContent.slice(0, cap);
    usedChars += excerpt.length;
    const truncated = excerpt.length < tab.fullContent.length;
    allocatedById.set(tab.tabId, { content: excerpt, truncated });
  }

  const tabContext = contextTabs.map((tab) => {
    const allocated = allocatedById.get(tab.tabId);
    return {
      tabId: tab.tabId,
      tabTitle: tab.tabTitle,
      content: allocated?.content ?? "",
      ...(allocated?.truncated ? { truncated: true } : {}),
    };
  });

  return `You are Tusk AI, an editorial assistant for long-form fiction writing.
Provider selected: ${provider}
Model name hint: ${modelName}

You have FULL ACCESS to the writer's entire project below. Tabs are listed in
document order (chapters / scenes / notes). Read across the whole book to
understand character arcs, plot threads, tone, and continuity before deciding
what to edit. You can — and SHOULD — edit multiple tabs in one response when
the request requires it (e.g. "make Maya's arc more pessimistic across all
chapters" should produce edits for every chapter Maya appears in).

You can also CREATE NEW CHAPTERS / TABS when the request asks for them
(e.g. "write a new chapter where Maya confronts her father" or "add an
epilogue"). New chapters use \`isNew: true\` instead of a \`tabId\`, with
a \`title\` for the new chapter.

Task:
- Read the user request.
- Use the full document context to make decisions.
- If the request spans multiple chapters, return edits for ALL of them.
- If the request asks for a new chapter, return it with isNew:true.
- For each edited tab, return the COMPLETE replacement content.
- For new chapters, return the FULL content of the new chapter.
- Do not invent IDs for existing tabs — only use IDs listed below.
- Preserve format style (HTML stays HTML, markdown stays markdown).

User request:
${userMessage}

Project metadata:
- Project name: ${project.name}
- Project kind: ${project.kind}
- Active tab id (the one the writer was last looking at): ${project.activeId ?? "none"}

All tabs in the project (document order):
${JSON.stringify(tabContext, null, 2)}

Output requirements:
- Return strict JSON only. No prose outside JSON.
- Schema:
{
  "edits": [
    // Edit an existing tab:
    {
      "tabId": "exact-existing-tab-id",
      "summary": "short summary of what changed",
      "after": "full revised content for that tab"
    },
    // OR create a new chapter / tab:
    {
      "isNew": true,
      "title": "Chapter 5: The Confrontation",
      "summary": "short summary of what this new chapter contains",
      "after": "full content of the new chapter"
    }
  ]
}

Important:
- Include only items that should change or be added.
- Multi-tab edits and new-chapter creation are both encouraged when the request implies them.
- Use existing tab IDs as listed above. For new chapters, use isNew:true (no tabId).`;
}

const callOpenAi: ProviderCall = async (prompt, apiKey, modelName) => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      input: prompt,
      max_output_tokens: 2200,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const payload = asRecord(await response.json());
  const fromOutputText = payload.output_text;
  if (typeof fromOutputText === "string" && fromOutputText.trim()) {
    return fromOutputText;
  }

  const chunks: unknown[] = Array.isArray(payload.output) ? payload.output : [];
  const contentText = chunks
    .flatMap((item): unknown[] => {
      const content = asRecord(item).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => asString(asRecord(part).text))
    .join("\n")
    .trim();

  if (!contentText) {
    throw new Error("OpenAI response did not include text output");
  }

  return contentText;
};

class ProviderModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderModerationError";
  }
}

const CLAUDE_REFUSAL_PATTERNS = [
  /i can(?:'|no)t (?:help|assist|create|write|generate)/i,
  /i (?:won't|will not) (?:help|assist|create|write|generate)/i,
  /i'?m (?:not able|unable) to (?:help|assist|create|write|generate)/i,
  /against (?:my|anthropic'?s) (?:guidelines|policies|policy)/i,
  /i must decline/i,
];

function looksLikeClaudeRefusal(text: string): boolean {
  const sample = String(text).slice(0, 600);
  return CLAUDE_REFUSAL_PATTERNS.some((pattern) => pattern.test(sample));
}

const callAnthropic: ProviderCall = async (prompt, apiKey, modelName) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 2200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    if (response.status === 400 && /policy|moderation|content/i.test(details)) {
      throw new ProviderModerationError(`Anthropic refused (${response.status}): ${details.slice(0, 240)}`);
    }
    throw new Error(`Anthropic request failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const payload = asRecord(await response.json());
  if (payload.stop_reason === "refusal") {
    throw new ProviderModerationError("Anthropic returned stop_reason=refusal");
  }

  const contentParts: unknown[] = Array.isArray(payload.content) ? payload.content : [];
  const text = contentParts
    .map((part) => asString(asRecord(part).text))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic response did not include text content");
  }

  if (looksLikeClaudeRefusal(text)) {
    throw new ProviderModerationError("Anthropic response matched refusal patterns");
  }

  return text;
};

const callXAi: ProviderCall = async (prompt, apiKey, modelName) => {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2200,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`xAI request failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const payload = asRecord(await response.json());
  const choices: unknown[] = Array.isArray(payload.choices) ? payload.choices : [];
  const text = asString(asRecord(asRecord(choices[0]).message).content);

  if (!text.trim()) {
    throw new Error("xAI response did not include message content");
  }

  return text;
};

function resolveProviderConfig(provider: ProviderId): ProviderConfig {
  if (provider === "claude") {
    return {
      provider: "claude",
      modelName: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      call: callAnthropic,
    };
  }
  if (provider === "grok") {
    return {
      provider: "grok",
      modelName: process.env.XAI_MODEL ?? "grok-4-fast-reasoning",
      apiKey: process.env.XAI_API_KEY ?? "",
      call: callXAi,
    };
  }
  return {
    provider: "gpt",
    modelName: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    call: callOpenAi,
  };
}

async function callWithModerationFallback(initialProvider: ProviderId, prompt: string): Promise<ProviderResult> {
  const primary = resolveProviderConfig(initialProvider);
  if (!primary.apiKey) {
    // `code` is set but never read anywhere in the codebase; preserved as-is
    // rather than dropped, since removing it would be a behaviour change.
    const error: Error & { code?: string } = new Error(
      `No API key configured for provider ${initialProvider}.`,
    );
    error.code = "NO_API_KEY";
    throw error;
  }

  try {
    const text = await primary.call(prompt, primary.apiKey, primary.modelName);
    return { text, provider: primary.provider, modelName: primary.modelName, fellBackFrom: null };
  } catch (error) {
    const isClaudeRefusal = initialProvider === "claude" && error instanceof ProviderModerationError;
    if (!isClaudeRefusal) {
      throw error;
    }

    const grok = resolveProviderConfig("grok");
    if (!grok.apiKey) {
      const wrapped = new Error(
        "Claude refused due to content moderation, and no XAI_API_KEY is configured for fallback.",
      );
      wrapped.cause = error;
      throw wrapped;
    }

    const text = await grok.call(prompt, grok.apiKey, grok.modelName);
    return {
      text,
      provider: grok.provider,
      modelName: grok.modelName,
      fellBackFrom: "claude",
    };
  }
}

async function generateModelEdits({ provider, userMessage, project, contextTabs, scoredTabIds, fallbackTabsForLocal }: { provider: ProviderId; userMessage: string; project: SanitizedProject; contextTabs: ContextTab[]; scoredTabIds: Set<string>; fallbackTabsForLocal: ContextTab[] }) {
  const availableTabsById = new Map(contextTabs.map((tab) => [tab.tabId, tab]));
  const prompt = buildInstructionPrompt({
    provider,
    modelName: resolveProviderConfig(provider).modelName,
    userMessage,
    project,
    contextTabs,
    scoredTabIds,
  });

  let result: ProviderResult;
  try {
    result = await callWithModerationFallback(provider, prompt);
  } catch (error) {
    return {
      usedFallback: true,
      providerNote: error instanceof Error ? error.message : "Provider request failed; using fallback edits.",
      modelName: null,
      providerUsed: provider,
      fellBackFrom: null,
      edits: fallbackTabsForLocal.slice(0, 2).map((tab) => buildFallbackEdit(tab, userMessage, project.name)),
    };
  }

  const parsed = parseJsonFromText(result.text);
  const edits = normalizeModelEdits(parsed, availableTabsById);

  if (edits.length === 0) {
    return {
      usedFallback: true,
      providerNote: "Model returned no valid edits; using local fallback revisions.",
      modelName: result.modelName,
      providerUsed: result.provider,
      fellBackFrom: result.fellBackFrom,
      edits: fallbackTabsForLocal.slice(0, 2).map((tab) => buildFallbackEdit(tab, userMessage, project.name)),
    };
  }

  return {
    usedFallback: false,
    providerNote: result.fellBackFrom
      ? `Switched from ${result.fellBackFrom} to ${result.provider} (content moderation).`
      : null,
    modelName: result.modelName,
    providerUsed: result.provider,
    fellBackFrom: result.fellBackFrom,
    edits,
  };
}

function buildChatPrompt({ userMessage, project, contextTabs, scoredTabIds }: { userMessage: string; project: SanitizedProject; contextTabs: ContextTab[]; scoredTabIds: Set<string> }): string {
  const orderedForBudget = [...contextTabs].sort((a, b) => {
    const aRanked = scoredTabIds.has(a.tabId) ? 1 : 0;
    const bRanked = scoredTabIds.has(b.tabId) ? 1 : 0;
    return bRanked - aRanked;
  });

  let usedChars = 0;
  const allocatedById = new Map();
  for (const tab of orderedForBudget) {
    if (usedChars >= MAX_TOTAL_CONTEXT_CHARS) {
      allocatedById.set(tab.tabId, "");
      continue;
    }
    const remainingBudget = MAX_TOTAL_CONTEXT_CHARS - usedChars;
    const cap = Math.min(MAX_CONTEXT_CHARS_PER_TAB, remainingBudget);
    const excerpt = tab.fullContent.slice(0, cap);
    usedChars += excerpt.length;
    allocatedById.set(tab.tabId, excerpt);
  }

  const tabContext = contextTabs.map((tab) => ({
    tabId: tab.tabId,
    tabTitle: tab.tabTitle,
    content: allocatedById.get(tab.tabId) ?? "",
  }));

  return `You are Tusk AI, an editorial assistant for long-form fiction writing.
You have FULL ACCESS to the writer's entire project below (all tabs in document order).
Reply conversationally. Reference specific chapters/tabs by title when relevant.
Walk through your reasoning briefly before giving your answer.
Do not output JSON or edit blocks here — that's a separate mode.

User message:
${userMessage}

Project:
- Name: ${project.name}
- Kind: ${project.kind}
- Active tab id: ${project.activeId ?? "none"}

All tabs in the project (document order):
${JSON.stringify(tabContext, null, 2)}`;
}

async function generateModelChat({ provider, userMessage, project, contextTabs, scoredTabIds }: { provider: ProviderId; userMessage: string; project: SanitizedProject; contextTabs: ContextTab[]; scoredTabIds: Set<string> }) {
  const prompt = buildChatPrompt({ userMessage, project, contextTabs, scoredTabIds });

  try {
    const result = await callWithModerationFallback(provider, prompt);
    return {
      reply: result.text,
      modelName: result.modelName,
      providerUsed: result.provider,
      fellBackFrom: result.fellBackFrom,
      providerNote: result.fellBackFrom
        ? `Switched from ${result.fellBackFrom} to ${result.provider} (content moderation).`
        : null,
      error: null,
    };
  } catch (error) {
    return {
      reply: null,
      modelName: null,
      providerUsed: provider,
      fellBackFrom: null,
      providerNote: null,
      error: error instanceof Error ? error.message : "Provider request failed.",
    };
  }
}

router.post("/chat", async (req: Request<unknown, unknown, ChatBody>, res: Response) => {
  try {
    const requestedProvider = req.body?.provider;
    const userMessage = req.body?.message;
    const rawProject = req.body?.project;
    const mode = req.body?.mode === "chat" ? "chat" : "edit";

    if (!isRequestedProvider(requestedProvider)) {
      return res.status(400).json({ message: "Invalid provider" });
    }

    const provider: ProviderId = requestedProvider === "auto" ? "claude" : requestedProvider;

    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    if (!rawProject || typeof rawProject !== "object") {
      return res.status(400).json({ message: "Project context is required" });
    }

    const project = asRecord(rawProject);
    const projectName = typeof project.name === "string" ? project.name : "Untitled Project";
    const projectKind = typeof project.kind === "string" ? project.kind : "Book";
    const projectTabs: ProjectTab[] = Array.isArray(project.tabs) ? (project.tabs as ProjectTab[]) : [];
    const projectContentById =
      project.contentById && typeof project.contentById === "object"
        ? (project.contentById as Record<string, unknown>)
        : {};

    const sanitizedProject: SanitizedProject = {
      name: projectName,
      kind: projectKind,
      tabs: projectTabs,
      activeId: typeof project.activeId === "string" ? project.activeId : null,
      contentById: projectContentById,
    };

    const contextTabs = gatherProjectContext(sanitizedProject);
    const scoredTabs = selectRelevantTabs(sanitizedProject, userMessage);
    const scoredTabIds = new Set(scoredTabs.map((tab) => tab.tabId));

    if (mode === "chat") {
      const chatResult = await generateModelChat({
        provider,
        userMessage,
        project: sanitizedProject,
        contextTabs,
        scoredTabIds,
      });

      return res.status(200).json({
        mode: "chat",
        provider: requestedProvider,
        providerUsed: chatResult.providerUsed,
        fellBackFrom: chatResult.fellBackFrom,
        model: chatResult.modelName ?? null,
        providerNote: chatResult.providerNote,
        error: chatResult.error,
        reply: chatResult.reply,
        contextMatches: scoredTabs.map((tab) => ({
          tabId: tab.tabId,
          tabTitle: tab.tabTitle,
          relevanceScore: tab.score,
        })),
      });
    }

    if (contextTabs.length === 0) {
      return res.status(200).json({
        mode: "edit",
        provider: requestedProvider,
        providerUsed: provider,
        fellBackFrom: null,
        usedFallback: true,
        contextMatches: [],
        edits: [],
      });
    }

    const generated = await generateModelEdits({
      provider,
      userMessage,
      project: sanitizedProject,
      contextTabs,
      scoredTabIds,
      fallbackTabsForLocal: scoredTabs.length > 0 ? scoredTabs : contextTabs,
    });

    return res.status(200).json({
      mode: "edit",
      provider: requestedProvider,
      providerUsed: generated.providerUsed,
      fellBackFrom: generated.fellBackFrom,
      model: generated.modelName ?? null,
      usedFallback: generated.usedFallback,
      providerNote: generated.providerNote,
      contextMatches: scoredTabs.map((tab) => ({
        tabId: tab.tabId,
        tabTitle: tab.tabTitle,
        relevanceScore: tab.score,
      })),
      edits: generated.edits,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate Tusk AI response",
      details: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});

export default router;