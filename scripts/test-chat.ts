/* Headless end-to-end test of the chat brain against the live store + Gemini.
   Run: npx tsx scripts/test-chat.ts   (from project root, .env present) */
import { runChat } from "../app/lib/llm/loop";

type Turn = { role: "user" | "assistant"; content: string };

async function main() {
  const history: Turn[] = [];
  let cartId: string | null = null;

  const userSays = async (text: string) => {
    history.push({ role: "user", content: text });
    console.log(`\n🧑 ${text}`);
    const r = await runChat({ history, cartId });
    cartId = r.cartId;
    history.push({ role: "assistant", content: r.reply });
    console.log(`🤖 ${r.reply}`);
    if (r.products.length)
      console.log(
        `   🛍  products: ${r.products.map((p) => `${p.title} (₹${p.price?.amount})`).join(" | ")}`,
      );
    if (r.cart)
      console.log(
        `   🛒 cart: qty=${r.cart.totalQuantity} subtotal=₹${r.cart.subtotal?.amount} total=₹${r.cart.total?.amount} codes=${JSON.stringify(
          r.cart.discountCodes,
        )}`,
      );
    if (r.checkoutUrl) console.log(`   💳 checkout: ${r.checkoutUrl.slice(0, 70)}...`);
    return r;
  };

  await userSays("I need something for hiking, budget under 2000");
  await userSays("add the backpack");
  await userSays("are there any discounts I can use?");
  await userSays("apply welcome10");
  console.log("\n✅ done");
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
