import { authenticate } from "../../shopify.server";
import { saveCartSpec } from "../../utils/shop-store.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const spec = await request.json();           // { general, header, body, footer }

  // 1. Persist to DB
  await saveCartSpec(session.shop, spec);

  // 2. Get shop GID for metafield ownership
  const shopRes  = await admin.graphql(`#graphql query { shop { id } }`);
  const shopData = await shopRes.json();
  const shopId   = shopData.data.shop.id;

  // 3. Write app-level metafield on the Shop resource
  const metaRes  = await admin.graphql(
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
  const userErrors = metaData.data?.metafieldsSet?.userErrors ?? [];

  return { ok: userErrors.length === 0, userErrors };
};

export default function SaveCart() {
  return null;
}
