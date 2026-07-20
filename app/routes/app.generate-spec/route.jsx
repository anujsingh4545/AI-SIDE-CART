import { authenticate } from "../../shopify.server";
import { generateCartSpec } from "../../utils/ai-cart-spec.server";
import { saveCartSpec, completeOnboarding } from "../../utils/shop-store.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { scanData, themeData, aiSummary } = await request.json();

  const cartSpec = await generateCartSpec(scanData, themeData, aiSummary);
  const draftSpec = { ...cartSpec, status: "draft" };

  await saveCartSpec(session.shop, draftSpec);
  await completeOnboarding(session.shop);

  return { cartSpec: draftSpec };
};

export default function GenerateSpec() {
  return null;
}
