import { Button, InlineStack, Badge } from "@shopify/polaris";
import styles from "./ManualSettingsSection.module.css";
import GeneralSection from "./GeneralSection/GeneralSection.jsx";
import HeaderSection from "./HeaderSection/HeaderSection.jsx";
import BodySection from "./BodySection/BodySection.jsx";
import FooterSection from "./FooterSection/FooterSection.jsx";

export default function ManualSettingsSection({ spec, onChange, products, onProductsChange }) {
  const isActive = spec.status === "active";

  async function handleAddProducts() {
    try {
      // eslint-disable-next-line no-undef
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        initialSelectionIds: products.map((p) => ({ id: p.productId })),
      });
      if (!selected) return;
      onProductsChange(
        selected.map((p) => {
          const variants = (p.variants ?? []).map((v) => ({ variantId: v.id, title: v.title, price: v.price }));
          return {
            productId: p.id,
            title: p.title,
            image: p.images?.[0]?.originalSrc ?? p.images?.[0]?.src ?? "",
            variants,
            selectedVariantId: variants[0]?.variantId ?? null,
            quantity: 1,
          };
        })
      );
    } catch {
      // dismissed
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Fixed top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <InlineStack gap="200" align="center" blockAlign="center">
            <Button size="slim" onClick={handleAddProducts}>+ Add product</Button>
            {products.length > 0 && (
              <InlineStack gap="100" align="center" blockAlign="center">
                <Badge tone="info">{products.length} product{products.length !== 1 ? "s" : ""}</Badge>
              </InlineStack>
            )}
          </InlineStack>
        </div>

        <div className={styles.statusWrap}>
          <span className={styles.statusLabel}>{isActive ? "Active" : "Draft"}</span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => onChange("status", e.target.checked ? "active" : "draft")}
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>
      </div>

      {/* Scrollable settings body */}
      <div className={styles.scrollBody}>
        <GeneralSection
          general={spec.general}
          onChange={(val) => onChange("general", val)}
        />
        <HeaderSection
          header={spec.header}
          onChange={(val) => onChange("header", val)}
        />
        <BodySection
          body={spec.body}
          onChange={(val) => onChange("body", val)}
        />
        <FooterSection
          footer={spec.footer}
          onChange={(val) => onChange("footer", val)}
        />
      </div>
    </div>
  );
}
