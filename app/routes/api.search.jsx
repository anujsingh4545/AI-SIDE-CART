import { searchCatalog } from "../lib/ucp/client";

/**
 * GET /api/search?q=hiking — direct catalog search (no LLM).
 * Used by the demo storefront grid and available for any non-conversational UI.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "outdoor";
  const limit = Math.min(Number(url.searchParams.get("limit") || 12), 20);
  try {
    const products = await searchCatalog(q, limit);
    return new Response(JSON.stringify({ products }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ products: [], error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
