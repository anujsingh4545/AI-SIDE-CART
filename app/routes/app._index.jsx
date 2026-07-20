import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="AI Side Cart">
      <s-section heading="Welcome to AI Side Cart">
        <s-paragraph>
          AI Side Cart enhances your store's shopping experience with an
          intelligent side cart powered by AI. Boost conversions with smart
          product recommendations and a seamless checkout flow.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/settings">Configure settings</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Getting started">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base">
              <s-text>1. Configure your cart appearance in</s-text>
              <s-link href="/app/settings">Settings</s-link>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              2. Add the AI Side Cart block to your theme via the Theme Editor
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              3. Preview your store to see the AI Side Cart in action
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">App Settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/build/online-store/theme-app-extensions"
              target="_blank"
            >
              Theme App Extensions
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/api/admin-graphql"
              target="_blank"
            >
              Shopify Admin API
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
