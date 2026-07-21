/**
 * Dummy AI-chat SSE endpoint behind the App Proxy (/apps/ai-cart/chat → /proxy/chat).
 * Streams canned responses using the FINAL wire format (shop-chat-agent event
 * vocabulary), so the storefront never changes when Claude/MCP replaces this.
 * Proxy signature verification is intentionally out of scope for the dummy.
 */

const CANNED_REPLIES = [
  "Great pick — the Sand blazer leans relaxed-tailored. I'd pair it with a tonal knit and a clean leather loafer to keep it polished. Here are two that work with what you have:",
  "For sizing, this brand runs slightly roomy — most people take one size down from their usual. If you're between sizes, the smaller one will drape better.",
  "I can help with orders too! Once your order ships you'll get a tracking link by email. Anything else you'd like me to check?",
];

const DEMO_PRODUCTS = [
  { title: "Merino Crew Knit", price: "Rs. 88.00", image: "", url: "/products/skcomill02", variant_id: 47829864775991 },
  { title: "Leather Loafer", price: "Rs. 210.00", image: "", url: "/products/ezra-arthur-medium-nylon-tote-navy", variant_id: 47829864513847 },
];

let replyCursor = 0;

function pickReply(message) {
  if (/size|fit/i.test(message || "")) return CANNED_REPLIES[1];
  if (/order|track|ship/i.test(message || "")) return CANNED_REPLIES[2];
  if (/look|pair|match|shoe|top|style/i.test(message || "")) return CANNED_REPLIES[0];
  const reply = CANNED_REPLIES[replyCursor % CANNED_REPLIES.length];
  replyCursor += 1;
  return reply;
}

function wantsProducts(message) {
  return /look|pair|match|shoe|top|style/i.test(message || "");
}

function sseFrame(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamChat(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body → defaults */ }
  const conversationId = body.conversation_id || crypto.randomUUID();
  const reply = pickReply(body.message);
  const includeProducts = wantsProducts(body.message);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => controller.enqueue(encoder.encode(sseFrame(data)));
      try {
        send({ type: "id", conversation_id: conversationId });
        const words = reply.split(" ");
        for (let i = 0; i < words.length; i++) {
          send({ type: "chunk", chunk: (i === 0 ? "" : " ") + words[i] });
          await delay(40);
        }
        send({ type: "message_complete" });
        if (includeProducts) send({ type: "product_results", products: DEMO_PRODUCTS });
        send({ type: "end_turn" });
      } catch (e) {
        send({ type: "error", error: "stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

export async function action({ request }) {
  return streamChat(request);
}

export async function loader() {
  return new Response(JSON.stringify({ error: "POST only" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}
