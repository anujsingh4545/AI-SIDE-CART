/**
 * Server-only env access. Never import from client/browser code.
 * Fails loudly at the boundary rather than sending empty creds downstream.
 */
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const env = {
  // LLM
  get llmProvider(): "gemini" | "anthropic" {
    const p = optional("LLM_PROVIDER", "gemini").toLowerCase();
    return p === "anthropic" ? "anthropic" : "gemini";
  },
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get geminiModel() {
    return optional("GEMINI_MODEL", "gemini-2.5-flash");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get anthropicModel() {
    return optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001");
  },

  // Shopify storefront (UCP)
  get storeDomain() {
    return required("SHOPIFY_STORE_DOMAIN");
  },
  get ucpMcpPath() {
    return optional("UCP_MCP_PATH", "/api/mcp");
  },
  get storefrontCountry() {
    return optional("STOREFRONT_COUNTRY", "IN");
  },
  get ucpEndpoint() {
    return `https://${this.storeDomain}${this.ucpMcpPath}`;
  },
};
