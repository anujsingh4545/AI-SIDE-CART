import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { fetchScanData } from "../../utils/shopify-scan.server";
import { generateScanSummary } from "../../utils/ai-summary.server";
import { getThemeData } from "../../utils/shopify-theme.server";
import { upsertShop } from "../../utils/shop-store.server";
import Onboarding from "../../components/onboarding/index";
import { useLoaderData } from "react-router";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const shopDomain = session.shop;

  // Fetch scan data, theme, and shop name in parallel
  const [scanData, themeData, shopInfoRes] = await Promise.all([
    fetchScanData(admin, 90),
    getThemeData(admin),
    admin.graphql(`#graphql
      query { shop { name } }
    `),
  ]);

  const shopInfo = await shopInfoRes.json();
  const shopName = shopInfo?.data?.shop?.name ?? shopDomain;

  await upsertShop(shopDomain, shopName);

  const aiSummary = await generateScanSummary(scanData);

  return { scanData, themeData, aiSummary };
};

export default function Index() {
  const { scanData, themeData, aiSummary } = useLoaderData();
  return <Onboarding scanData={scanData} themeData={themeData} aiSummary={aiSummary} />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
