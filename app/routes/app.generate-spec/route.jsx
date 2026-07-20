import { authenticate } from "../../shopify.server";
import { generateCartSpec } from "../../utils/ai-cart-spec.server";
import { saveCartSpec } from "../../utils/shop-store.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { scanData, themeData, aiSummary } = await request.json();
  const cartSpec = await generateCartSpec(scanData, themeData, aiSummary);
  await saveCartSpec(session.shop, cartSpec);
  return { cartSpec };
};

export default function GenerateSpec() {
  return null;
}
