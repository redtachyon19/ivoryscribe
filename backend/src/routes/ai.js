import { Router } from "express";

const router = Router();

const MAX_CONTEXT_CHARS_PER_TAB = 11_000;
const MAX_TOTAL_CONTEXT_CHARS = 80_000;

function stripHtml(value) {
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

function flattenTabs(tabs) {
  const result = [];
  const visit = (nodes) => {
    for (const tab of nodes) {
      result.push({ id: tab.id, title: tab.title });
      visit(tab.children ?? []);
    }
  };
  visit(Array.isArray(tabs) ? tabs : []);
  return result;
}

function tokenize(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreTabForPrompt(promptTokens, title, content) {
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

function selectRelevantTabs(project, userMessage) {
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

function extractCharacterCandidates(input) {
  const names = new Set();
  const phraseMatches = String(input).matchAll(/\bcharacter\s+([A-Z][a-zA-Z'-]+)/g);
  for (const match of phraseMatches) {
    names.add(match[1]);
  }

  const properNouns = String(input).matchAll(/\b([A-Z][a-zA-Z'-]{2,})\b/g);
  for (const match of properNouns) {
    if (match[1].toLowerCase() !== "chapter") {
      names.add(match[1]);
    }
  }

  return Array.from(names).slice(0, 3);
}

function detectCharacterLine(content, name) {
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

function buildFallbackEdit(tab, userMessage, projectName) {
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

function parseJsonFromText(value) {
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

function normalizeModelEdits(raw, availableTabsById) {
  const edits = Array.isArray(raw?.edits) ? raw.edits : [];

  return edits
    .map((edit, index) => {
      const tabId = typeof edit?.tabId === "string" ? edit.tabId : null;
      if (!tabId) {
        return null;
      }

      const tab = availableTabsById.get(tabId);
      if (!tab) {
        return null;
      }

      const after = typeof edit?.after === "string" ? edit.after : null;
      if (!after || after === tab.fullContent) {
        return null;
      }

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
      };
    })
    .filter(Boolean);
}

function buildInstructionPrompt({ provider, modelName, userMessage, project, selectedTabs }) {
  let usedChars = 0;
  const tabContext = [];

  for (const tab of selectedTabs) {
    if (usedChars >= MAX_TOTAL_CONTEXT_CHARS) {
      break;
    }

    const excerpt = tab.fullContent.slice(0, MAX_CONTEXT_CHARS_PER_TAB);
    usedChars += excerpt.length;
    tabContext.push({
      tabId: tab.tabId,
      tabTitle: tab.tabTitle,
      content: excerpt,
    });
  }

  return `You are Tusk AI, an editorial assistant for long-form fiction writing.
Provider selected: ${provider}
Model name hint: ${modelName}

Task:
- Read the user request.
- Use project-wide story context to preserve characterization, tone, timeline continuity, and cross-chapter references.
- Propose substantial edits where needed, not only minor wording tweaks.
- Return edits as complete replacement text for each edited tab.
- Do not invent new tab IDs. Use only provided tab IDs.

User request:
${userMessage}

Project context:
- Project name: ${project.name}
- Project kind: ${project.kind}
- Active tab id: ${project.activeId ?? "none"}

Tabs available for editing:
${JSON.stringify(tabContext, null, 2)}

Output requirements:
- Return strict JSON only.
- Schema:
{
  "edits": [
    {
      "id": "optional-string",
      "tabId": "exact-tab-id",
      "summary": "short summary of change",
      "after": "full revised content for that tab"
    }
  ]
}

Important:
- Include only tabs that should change.
- Preserve existing format style for each tab (HTML stays HTML, markdown stays markdown).
- Avoid any prose outside JSON.`;
}

async function callOpenAi(prompt, apiKey, modelName) {
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

  const payload = await response.json();
  const fromOutputText = payload?.output_text;
  if (typeof fromOutputText === "string" && fromOutputText.trim()) {
    return fromOutputText;
  }

  const chunks = Array.isArray(payload?.output) ? payload.output : [];
  const contentText = chunks
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!contentText) {
    throw new Error("OpenAI response did not include text output");
  }

  return contentText;
}

async function callAnthropic(prompt, apiKey, modelName) {
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
    throw new Error(`Anthropic request failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = (Array.isArray(payload?.content) ? payload.content : [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic response did not include text content");
  }

  return text;
}

async function callXAi(prompt, apiKey, modelName) {
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

  const payload = await response.json();
  const text =
    payload?.choices?.[0]?.message?.content && typeof payload.choices[0].message.content === "string"
      ? payload.choices[0].message.content
      : "";

  if (!text.trim()) {
    throw new Error("xAI response did not include message content");
  }

  return text;
}

async function generateModelEdits({ provider, userMessage, project, selectedTabs }) {
  const availableTabsById = new Map(selectedTabs.map((tab) => [tab.tabId, tab]));

  const openAiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const xAiKey = process.env.XAI_API_KEY;

  const providerConfig =
    provider === "claude"
      ? {
          modelName: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
          hasKey: Boolean(anthropicKey),
          call: () => callAnthropic,
        }
      : provider === "grok"
        ? {
            modelName: process.env.XAI_MODEL ?? "grok-3-beta",
            hasKey: Boolean(xAiKey),
            call: () => callXAi,
          }
        : {
            modelName: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
            hasKey: Boolean(openAiKey),
            call: () => callOpenAi,
          };

  if (!providerConfig.hasKey) {
    return {
      usedFallback: true,
      providerNote: `No API key configured for provider ${provider}.`,
      edits: selectedTabs.slice(0, 2).map((tab) => buildFallbackEdit(tab, userMessage, project.name)),
    };
  }

  const prompt = buildInstructionPrompt({
    provider,
    modelName: providerConfig.modelName,
    userMessage,
    project,
    selectedTabs,
  });

  try {
    let rawText;

    if (provider === "claude") {
      rawText = await callAnthropic(prompt, anthropicKey, providerConfig.modelName);
    } else if (provider === "grok") {
      rawText = await callXAi(prompt, xAiKey, providerConfig.modelName);
    } else {
      rawText = await callOpenAi(prompt, openAiKey, providerConfig.modelName);
    }

    const parsed = parseJsonFromText(rawText);
    const edits = normalizeModelEdits(parsed, availableTabsById);

    if (edits.length === 0) {
      return {
        usedFallback: true,
        providerNote: "Model returned no valid edits; using local fallback revisions.",
        edits: selectedTabs.slice(0, 2).map((tab) => buildFallbackEdit(tab, userMessage, project.name)),
      };
    }

    return {
      usedFallback: false,
      providerNote: null,
      modelName: providerConfig.modelName,
      edits,
    };
  } catch (error) {
    return {
      usedFallback: true,
      providerNote: error instanceof Error ? error.message : "Provider request failed; using fallback edits.",
      edits: selectedTabs.slice(0, 2).map((tab) => buildFallbackEdit(tab, userMessage, project.name)),
    };
  }
}

router.post("/chat", async (req, res) => {
  try {
    if (!req.user?.tuskAiActivated) {
      return res.status(402).json({
        message: "Tusk AI is not active for this account",
        code: "TUSK_AI_NOT_ACTIVE",
      });
    }

    const provider = req.body?.provider;
    const userMessage = req.body?.message;
    const project = req.body?.project;

    if (!["gpt", "claude", "grok"].includes(provider)) {
      return res.status(400).json({ message: "Invalid provider" });
    }

    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    if (!project || typeof project !== "object") {
      return res.status(400).json({ message: "Project context is required" });
    }

    const projectName = typeof project.name === "string" ? project.name : "Untitled Project";
    const projectKind = typeof project.kind === "string" ? project.kind : "Book";
    const projectTabs = Array.isArray(project.tabs) ? project.tabs : [];
    const projectContentById =
      project.contentById && typeof project.contentById === "object" ? project.contentById : {};

    const sanitizedProject = {
      name: projectName,
      kind: projectKind,
      tabs: projectTabs,
      activeId: typeof project.activeId === "string" ? project.activeId : null,
      contentById: projectContentById,
    };

    const selectedTabs = selectRelevantTabs(sanitizedProject, userMessage);
    if (selectedTabs.length === 0) {
      return res.status(200).json({
        provider,
        usedFallback: true,
        contextMatches: [],
        edits: [],
      });
    }

    const generated = await generateModelEdits({
      provider,
      userMessage,
      project: sanitizedProject,
      selectedTabs,
    });

    return res.status(200).json({
      provider,
      model: generated.modelName ?? null,
      usedFallback: generated.usedFallback,
      providerNote: generated.providerNote,
      contextMatches: selectedTabs.map((tab) => ({
        tabId: tab.tabId,
        tabTitle: tab.tabTitle,
        relevanceScore: tab.score,
      })),
      edits: generated.edits,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate Tusk AI edits",
      details: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});

export default router;