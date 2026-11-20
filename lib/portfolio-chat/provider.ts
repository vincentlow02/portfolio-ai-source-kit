import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type Environment = Record<string, string | undefined>;

export function configureModel(env: Environment, customFetch?: typeof fetch) {
  const provider = env.PORTFOLIO_AI_PROVIDER?.trim() || "qwen";
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY?.trim()) return null;
    const modelId = env.PORTFOLIO_AI_MODEL?.trim() || "gpt-4o-mini";
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY.trim(), fetch: customFetch });
    return { provider, modelId, model: openai(modelId), providerOptions: { openai: { store: false } } };
  }
  if (provider === "gateway") {
    if (!env.AI_GATEWAY_API_KEY?.trim()) return null;
    const modelId = env.PORTFOLIO_AI_MODEL?.trim() || "openai/gpt-4o-mini";
    return { provider, modelId, model: modelId, providerOptions: undefined };
  }
  if (provider !== "qwen" || !env.QWEN_API_KEY?.trim() || !env.QWEN_BASE_URL?.trim()) return null;
  const key = env.QWEN_API_KEY.trim();
  let url: URL;
  try { url = new URL(env.QWEN_BASE_URL.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      /(?:^|[.-])(?:coding|token-plan)(?:[.-]|$)/iu.test(url.hostname) ||
      key.startsWith("sk-sp-") || /\/chat\/completions\/?$/iu.test(url.pathname)) return null;
  const modelId = env.QWEN_MODEL?.trim() || "qwen3.7-flash";
  const jsonMode = env.QWEN_JSON_MODE?.trim() || "schema";
  if (jsonMode !== "schema" && jsonMode !== "object") return null;
  const option = env.QWEN_ENABLE_THINKING?.trim();
  if (option && option !== "true" && option !== "false") return null;
  const thinking = option ? option === "true"
    : /^qwen3\.7-flash(?:-\d{4}-\d{2}-\d{2})?$/u.test(modelId) ? false : undefined;
  const qwen = createOpenAICompatible({
    name: "qwen",
    apiKey: key,
    baseURL: url.href.replace(/\/+$/u, ""),
    supportsStructuredOutputs: jsonMode === "schema",
    fetch: customFetch,
    transformRequestBody: (body) => thinking === undefined ? body : { ...body, enable_thinking: thinking },
  });
  return { provider, modelId, model: qwen.chatModel(modelId), providerOptions: undefined };
}
