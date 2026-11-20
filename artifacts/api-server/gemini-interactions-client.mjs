/**
 * Cliente unificado da Google Gemini Interactions API (v1beta • Api-Revision: 2026-05-20)
 *
 * Centraliza:
 * - Chamadas REST nativas para POST /v1beta/interactions (schema steps[])
 * - Normalização de modelos (upgrade automático de modelos 2.5 / 2.0 / 1.5 / lite)
 * - Extração unificada de texto (steps[].model_output → content[].text, com fallback outputs[])
 * - Extração de function_call steps e conversão de ferramentas/JSON Schema (lowercase types)
 * - Conversão de payloads multimodais legados (contents[].parts[] → Content[] / Step[])
 * - Remoção estrita de parâmetros depreciados (temperature, top_p, top_k, thinkingBudget)
 */

export const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_API_REVISION = "2026-05-20";
export const GEMINI_INTERACTIONS_PROTOCOL = "Interactions API (v1beta)";

export const GEMINI_FLASH_MODEL = "gemini-3.8-flash";
export const GEMINI_REASONING_MODEL = "gemini-4-argon";

export const GEMINI_FLASH_FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-4-argon",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite"
];

export const GEMINI_REASONING_FALLBACK_CHAIN = [
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite"
];

/**
 * Identifica modelos descontinuados, restritos a contas antigas (2.5) ou não adequados
 * como modelo principal salvo (lite, 8b, tts, embed, imagen, whisper, etc.).
 */
export function isLegacyOrRestrictedGeminiModel(rawModel) {
  const clean = String(rawModel || "").trim().toLowerCase();
  if (!clean) return true;
  if (/^gemini-(1\.0|1\.5|2\.0|2\.5)-/.test(clean)) return true;
  if (/(^|[-_])(lite|8b|tts|embed|embedding|imagen|whisper|realtime|aqa)([-_]|$)/.test(clean)) return true;
  if (clean.includes("lite") || clean.includes("8b") || clean.includes("tts") || clean.includes("embed")) return true;
  return false;
}

/**
 * Normaliza o nome de modelo salvo em banco ou configuração para a geração atual.
 * @param {string} rawModel
 * @param {"flash"|"reasoning"} [role="flash"]
 */
export function normalizeGeminiModel(rawModel, role = "flash") {
  const defaultModel = role === "reasoning" ? GEMINI_REASONING_MODEL : GEMINI_FLASH_MODEL;
  const clean = String(rawModel || "").trim();
  if (!clean || isLegacyOrRestrictedGeminiModel(clean)) {
    return defaultModel;
  }
  return clean;
}

/**
 * Extrai o texto final de resposta do payload da Interactions API.
 * Prioriza o schema atual `steps[]` (Api-Revision: 2026-05-20) e mantém fallback para `outputs[]`.
 */
export function extractTextFromInteractionResponse(data) {
  if (!data || typeof data !== "object") return "";

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.steps) && data.steps.length > 0) {
    const texts = [];
    for (const step of data.steps) {
      if (step?.type !== "model_output") continue;
      if (Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item?.type === "text" && typeof item.text === "string") {
            texts.push(item.text);
          } else if (!item?.type && typeof item?.text === "string" && !item.thought) {
            texts.push(item.text);
          }
        }
      } else if (typeof step.content === "string") {
        texts.push(step.content);
      }
    }
    const joined = texts.join("").trim();
    if (joined) return joined;
  }

  if (Array.isArray(data.outputs) && data.outputs.length > 0) {
    const texts = data.outputs
      .filter(o => o?.type === "text" && typeof o.text === "string")
      .map(o => o.text);
    const joined = texts.join("").trim();
    if (joined) return joined;
  }

  return "";
}

/**
 * Extrai chamadas de função (`function_call`) retornadas pela Interactions API.
 */
export function extractFunctionCallsFromInteractionResponse(data) {
  if (!data || typeof data !== "object") return [];
  const calls = [];

  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      if (step?.type === "function_call" && step?.name) {
        calls.push({
          id: String(step.id || ""),
          name: String(step.name),
          arguments: (step.arguments && typeof step.arguments === "object")
            ? step.arguments
            : ((step.args && typeof step.args === "object") ? step.args : {}),
          rawStep: step
        });
      }
    }
  }

  if (calls.length === 0 && Array.isArray(data.outputs)) {
    for (const out of data.outputs) {
      if (out?.type === "function_call" && out?.name) {
        calls.push({
          id: String(out.id || ""),
          name: String(out.name),
          arguments: (out.arguments && typeof out.arguments === "object")
            ? out.arguments
            : ((out.args && typeof out.args === "object") ? out.args : {}),
          rawStep: out
        });
      }
    }
  }

  return calls;
}

/**
 * Converte parts legados (`{ text }`, `{ inlineData }`, `{ inline_data }`) para Content[] da Interactions API.
 */
export function convertLegacyPartsToInteractionContent(parts = []) {
  if (!Array.isArray(parts)) return [];
  const blocks = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;

    if (typeof part.text === "string") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }

    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      const rawMime = String(inline.mimeType || inline.mime_type || "image/jpeg").trim().toLowerCase();
      const cleanData = String(inline.data).replace(/^data:[^;]+;base64,/, "").trim();
      if (!cleanData) continue;

      if (rawMime.startsWith("image/")) {
        blocks.push({ type: "image", mime_type: rawMime, data: cleanData });
      } else if (rawMime === "application/pdf" || rawMime.startsWith("text/")) {
        blocks.push({ type: "document", mime_type: rawMime, data: cleanData });
      } else if (rawMime.startsWith("audio/")) {
        blocks.push({ type: "audio", mime_type: rawMime, data: cleanData });
      } else if (rawMime.startsWith("video/")) {
        blocks.push({ type: "video", mime_type: rawMime, data: cleanData });
      } else {
        blocks.push({ type: "image", mime_type: "image/jpeg", data: cleanData });
      }
      continue;
    }

    // Já está no formato Interactions Content
    if (typeof part.type === "string") {
      blocks.push(part);
    }
  }

  return blocks;
}

/**
 * Converte o formato legado `contents` (`[{ role?, parts: [...] }]`) para `input` da Interactions API.
 */
export function convertLegacyContentsToInteractionsInput(contents) {
  if (typeof contents === "string") return contents;
  if (!Array.isArray(contents) || contents.length === 0) return "";

  const isSingleUserTurn =
    contents.length === 1 &&
    String(contents[0]?.role || "user").toLowerCase() !== "model";

  if (isSingleUserTurn) {
    const blocks = convertLegacyPartsToInteractionContent(contents[0]?.parts || []);
    return blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
  }

  const steps = [];
  for (const turn of contents) {
    const blocks = convertLegacyPartsToInteractionContent(turn?.parts || []);
    if (blocks.length === 0) continue;
    const role = String(turn?.role || "user").toLowerCase();
    steps.push({
      type: role === "model" ? "model_output" : "user_input",
      content: blocks
    });
  }

  // Gemini 3.6+ e Gemini 4 rejeitam prefill terminando em turno de modelo
  while (steps.length > 1 && steps[steps.length - 1]?.type === "model_output") {
    steps.pop();
  }

  return steps.length > 0 ? steps : [{ type: "text", text: "" }];
}

/**
 * Normaliza tipos de JSON Schema para o padrão lowercase exigido pela Interactions API
 * (ex: "OBJECT" → "object", "STRING" → "string", "ARRAY" → "array").
 */
export function normalizeJsonSchemaForInteractions(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map(item => normalizeJsonSchemaForInteractions(item));
  }

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      out.type = value.toLowerCase();
    } else if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const normProps = {};
      for (const [pKey, pVal] of Object.entries(value)) {
        normProps[pKey] = normalizeJsonSchemaForInteractions(pVal);
      }
      out.properties = normProps;
    } else if (key === "items" && value && typeof value === "object") {
      out.items = normalizeJsonSchemaForInteractions(value);
    } else if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      out[key] = value.map(item => normalizeJsonSchemaForInteractions(item));
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Converte declarações legadas `[{ functionDeclarations: [...] }]` ou ferramentas já no padrão
 * Interactions API para o formato flat `[{ type: "function", name, description, parameters }]`.
 */
export function convertLegacyToolsToInteractionsTools(tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const result = [];
  const seen = new Set();

  const pushFn = (decl) => {
    if (!decl || typeof decl !== "object" || !decl.name) return;
    const name = String(decl.name).trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    const entry = {
      type: "function",
      name,
      ...(decl.description ? { description: String(decl.description) } : {})
    };
    if (decl.parameters && typeof decl.parameters === "object") {
      entry.parameters = normalizeJsonSchemaForInteractions(decl.parameters);
    }
    result.push(entry);
  };

  for (const item of tools) {
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item.functionDeclarations)) {
      for (const decl of item.functionDeclarations) {
        pushFn(decl);
      }
    } else if (item.type === "function" && item.name) {
      pushFn(item);
    } else if (item.type && item.type !== "function") {
      result.push(item);
    }
  }

  return result;
}

/**
 * Constrói `generation_config` compatível com Gemini 3.6+ e Gemini 4
 * (sem `temperature`, `top_p`, `top_k` ou `thinkingBudget`).
 */
export function buildInteractionsGenerationConfig(model, { thinkingLevel = "low", maxOutputTokens = null } = {}) {
  const cfg = {};
  const cleanModel = String(model || "").toLowerCase();

  if (thinkingLevel) {
    let effLevel = String(thinkingLevel).toLowerCase();
    // gemini-3.8-flash, gemini-3.6-flash e gemini-4-argon rejeitam "minimal" com erro 400
    if (effLevel === "minimal" && !cleanModel.includes("flash-lite")) {
      effLevel = "low";
    }
    if (["minimal", "low", "medium", "high"].includes(effLevel)) {
      cfg.thinking_level = effLevel;
    }
  }

  if (Number.isFinite(Number(maxOutputTokens)) && Number(maxOutputTokens) > 0) {
    cfg.max_output_tokens = Math.round(Number(maxOutputTokens));
  }

  return Object.keys(cfg).length > 0 ? cfg : undefined;
}

/**
 * Executa uma chamada nativa à Google Gemini Interactions API (POST /v1beta/interactions).
 */
export async function createGeminiInteraction({
  apiKey,
  model = GEMINI_FLASH_MODEL,
  input,
  systemInstruction = null,
  tools = null,
  responseFormat = null,
  thinkingLevel = "low",
  maxOutputTokens = null,
  store = false,
  timeoutMs = 25000
} = {}) {
  if (!apiKey) {
    return {
      ok: false,
      status: null,
      latencyMs: 0,
      data: null,
      rawText: "",
      text: "",
      functionCalls: [],
      steps: [],
      error: "Chave de API Gemini não configurada.",
      model,
      protocol: GEMINI_INTERACTIONS_PROTOCOL
    };
  }

  const normalizedTools = Array.isArray(tools) && tools.length > 0
    ? convertLegacyToolsToInteractionsTools(tools)
    : [];

  const generationConfig = buildInteractionsGenerationConfig(model, {
    thinkingLevel,
    maxOutputTokens
  });

  const buildPayload = (includeThinking = true) => {
    const payload = {
      model,
      store: Boolean(store),
      input
    };
    if (systemInstruction && String(systemInstruction).trim()) {
      payload.system_instruction = String(systemInstruction);
    }
    if (normalizedTools.length > 0) {
      payload.tools = normalizedTools;
    }
    if (responseFormat && typeof responseFormat === "object") {
      payload.response_format = responseFormat;
    }
    if (generationConfig) {
      const gc = { ...generationConfig };
      if (!includeThinking) delete gc.thinking_level;
      if (Object.keys(gc).length > 0) {
        payload.generation_config = gc;
      }
    }
    return payload;
  };

  const startedAt = Date.now();
  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
    "Api-Revision": GEMINI_API_REVISION
  };

  try {
    let resp = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPayload(true)),
      signal: AbortSignal.timeout(timeoutMs)
    });

    let rawText = await resp.text();

    // Retry automático sem thinking_level se o modelo específico rejeitar o campo com HTTP 400
    if (resp.status === 400 && generationConfig?.thinking_level && /thinking/i.test(rawText)) {
      resp = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(buildPayload(false)),
        signal: AbortSignal.timeout(timeoutMs)
      });
      rawText = await resp.text();
    }

    const latencyMs = Date.now() - startedAt;
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {}

    if (!resp.ok) {
      const apiErrMsg = parsed?.error?.message || rawText.replace(/\s+/g, " ").trim().slice(0, 400) || `HTTP ${resp.status}`;
      return {
        ok: false,
        status: resp.status,
        latencyMs,
        data: parsed,
        rawText,
        text: "",
        functionCalls: [],
        steps: [],
        error: apiErrMsg,
        model,
        protocol: GEMINI_INTERACTIONS_PROTOCOL
      };
    }

    const text = extractTextFromInteractionResponse(parsed);
    const functionCalls = extractFunctionCallsFromInteractionResponse(parsed);
    const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];

    return {
      ok: true,
      status: resp.status,
      latencyMs,
      data: parsed,
      rawText,
      text,
      functionCalls,
      steps,
      error: null,
      model,
      protocol: GEMINI_INTERACTIONS_PROTOCOL
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return {
      ok: false,
      status: null,
      latencyMs,
      data: null,
      rawText: "",
      text: "",
      functionCalls: [],
      steps: [],
      error: err?.message || "Erro de rede ao contatar Interactions API",
      model,
      protocol: GEMINI_INTERACTIONS_PROTOCOL
    };
  }
}

/**
 * Monta envelope de compatibilidade preservando `candidates[0].content.parts[0].text`
 * junto aos campos nativos da Interactions API (`steps`, `output_text`).
 */
export function buildCompatGenerateContentData(interactionData, extractedText) {
  const safeText = String(extractedText || "");
  return {
    ...(interactionData && typeof interactionData === "object" ? interactionData : {}),
    output_text: safeText,
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: safeText }]
        }
      }
    ]
  };
}
