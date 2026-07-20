import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function SettingsPage() {
  return (
    <s-page heading="Settings">
      <s-section heading="Cart appearance">
        <s-stack direction="block" gap="base">
          <s-text-field label="Cart title" value="Your Cart" />
          <s-text-field label="Empty cart message" value="Your cart is empty" />
        </s-stack>
      </s-section>

      <s-section heading="AI recommendations">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Recommendations heading"
            value="You might also like"
          />
          <s-text-field
            label="Number of recommendations"
            type="number"
            value="3"
          />
        </s-stack>
      </s-section>

      <s-section heading="Checkout">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Checkout button text"
            value="Proceed to Checkout"
          />
        </s-stack>
      </s-section>

      <s-stack direction="inline" gap="base">
        <s-button variant="primary">Save settings</s-button>
        <s-button variant="tertiary">Reset to defaults</s-button>
      </s-stack>

      <s-section slot="aside" heading="About settings">
        <s-paragraph>
          These settings control the appearance and behavior of the AI Side Cart
          on your storefront. Changes take effect immediately after saving.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
