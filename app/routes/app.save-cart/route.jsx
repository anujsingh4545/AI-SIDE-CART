import { authenticate } from "../../shopify.server";
import { saveCartSpec } from "../../utils/shop-store.server";

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const spec = await request.json();

    await saveCartSpec(session.shop, spec);

    const shopRes = await admin.graphql(`#graphql
      query { shop { id } }
    `);
    const shopData = await shopRes.json();
    const shopId = shopData.data.shop.id;

    const metaRes = await admin.graphql(
      `#graphql
      mutation SaveCartSpec($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key }
          userErrors  { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId:   shopId,
              namespace: "ai_side_cart",
              key:       "cart_spec",
              type:      "json",
              value:     JSON.stringify(spec),
            },
          ],
        },
      }
    );

    const metaData = await metaRes.json();
    console.log("[save-cart] metaData:", metaData);
    const userErrors = metaData.data?.metafieldsSet?.userErrors ?? [];

    return { ok: userErrors.length === 0, userErrors };
  } catch (err) {
    console.error("[save-cart] ERROR:", err?.message ?? err);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
};

export default function SaveCart() {
  return null;
}
