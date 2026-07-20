import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { fetchScanData } from "../../utils/shopify-scan.server";
import { generateScanSummary } from "../../utils/ai-summary.server";
import { getThemeData } from "../../utils/shopify-theme.server";
import { upsertShop, getCartSpec } from "../../utils/shop-store.server";
import Onboarding from "../../components/onboarding/index";
import { useLoaderData } from "react-router";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const [scanData, themeData, shopInfoRes] = await Promise.all([
    fetchScanData(admin, 90),
    getThemeData(admin),
    admin.graphql(`#graphql
      query { shop { name } }
    `),
  ]);

  const shopInfo = await shopInfoRes.json();
  const shopName = shopInfo?.data?.shop?.name ?? shopDomain;

  const shop = await upsertShop(shopDomain, shopName);
  const onboardingCompleted = shop.onboardingCompleted;

  const [aiSummary, savedSpec] = await Promise.all([
    generateScanSummary(scanData),
    onboardingCompleted ? getCartSpec(shopDomain) : Promise.resolve(null),
  ]);

  return { scanData, themeData, aiSummary, onboardingCompleted, savedSpec };
};

export default function Index() {
  const { scanData, themeData, aiSummary, onboardingCompleted, savedSpec } = useLoaderData();
  return (
    <Onboarding
      scanData={scanData}
      themeData={themeData}
      aiSummary={aiSummary}
      onboardingCompleted={onboardingCompleted}
      savedSpec={savedSpec}
    />
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
