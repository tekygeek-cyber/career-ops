// Fixed endpoints only. No user-controlled URL, host, port or arbitrary plugin path.
const entries = [
  ["openai", "OpenAI", "https://api.openai.com/v1", "gpt-4.1-mini"],
  [
    "openrouter",
    "OpenRouter",
    "https://openrouter.ai/api/v1",
    "openai/gpt-4.1-mini",
  ],
  ["groq", "Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"],
  [
    "together",
    "Together",
    "https://api.together.ai/v1",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  ],
  ["cerebras", "Cerebras", "https://api.cerebras.ai/v1", "gpt-oss-120b"],
  ["deepseek", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"],
  ["mistral", "Mistral", "https://api.mistral.ai/v1", "mistral-small-latest"],
  ["xai", "xAI", "https://api.x.ai/v1", "grok-3-mini"],
  [
    "fireworks",
    "Fireworks",
    "https://api.fireworks.ai/inference/v1",
    "accounts/fireworks/models/llama-v3p3-70b-instruct",
  ],
  ["ollama", "Ollama (local)", "http://127.0.0.1:11434/v1", "llama3.2"],
  ["lmstudio", "LM Studio (local)", "http://127.0.0.1:1234/v1", "local-model"],
  [
    "anthropic",
    "Anthropic",
    "https://api.anthropic.com/v1",
    "claude-sonnet-4-5",
    "anthropic",
  ],
  [
    "gemini",
    "Gemini",
    "https://generativelanguage.googleapis.com/v1beta",
    "gemini-2.5-flash",
    "gemini",
  ],
];
export const providers = entries.map(
  ([id, name, base, model, kind = "openai"]) => ({
    id,
    name,
    base,
    model,
    kind,
    local: base.startsWith("http:"),
    env: `WORKSPACE_${id.toUpperCase()}_API_KEY`,
    pluginId: `workspace-ai-${id}`,
  }),
);
export function provider(id) {
  const p = providers.find((p) => p.id === id);
  if (!p) throw new Error("Unknown provider.");
  return p;
}
export function validateKey(key) {
  if (
    typeof key !== "string" ||
    key.length < 16 ||
    key.length > 4096 ||
    /\s|[\x00-\x1f\x7f]/.test(key)
  )
    throw new Error("Enter a key of 16–4096 characters without whitespace.");
  return key;
}
export function validateModel(model) {
  if (
    typeof model !== "string" ||
    !model ||
    model.length > 150 ||
    !/^[a-zA-Z0-9._:/-]+$/.test(model) ||
    model.includes("..")
  )
    throw new Error("Invalid model identifier.");
  return model;
}
