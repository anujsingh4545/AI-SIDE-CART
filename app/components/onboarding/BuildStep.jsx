import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { SaveBar } from "@shopify/app-bridge-react";
import defaultCartSpec from "../../constants/cart-spec.js";
import ChatSection from "../cart-builder/ChatSection/ChatSection.jsx";
import PreviewSection from "../cart-builder/PreviewSection/PreviewSection.jsx";
import ManualSettingsSection from "../cart-builder/ManualSettingsSection/ManualSettingsSection.jsx";
import styles from "./BuildStep.module.css";

const SAVE_BAR_ID = "cart-builder-save-bar";

export default function BuildStep({ spec }) {
  const [cartSpec, setCartSpec] = useState(spec ?? defaultCartSpec);
  const [initialState, setInitialState] = useState(spec ?? defaultCartSpec);
  const [selectedProducts, setSelectedProducts] = useState([
    {
      productId: "gid://shopify/Product/8714215429437",
      title: "14k Bloom Earrings",
      image: "https://cdn.shopify.com/s/files/1/0684/1735/6027/files/18k-rose-diamond-earrings_5e7739a0-261d-4788-96c9-ef77214aa70e.jpg?v=1719906852",
      variants: [
        { variantId: "gid://shopify/ProductVariant/46231170285819", title: "Rose Gold", price: "579.00" },
        { variantId: "gid://shopify/ProductVariant/46231170285820", title: "Yellow Gold", price: "599.00" },
        { variantId: "gid://shopify/ProductVariant/46231170285821", title: "White Gold", price: "619.00" },
      ],
      selectedVariantId: "gid://shopify/ProductVariant/46231170285819",
      quantity: 1,
    },
    {
      productId: "gid://shopify/Product/8714715566657",
      title: "14k Dangling Obsidian Earrings",
      image: "https://cdn.shopify.com/s/files/1/0684/1735/6027/files/18k-white-gold-limelight-sequin-motif-earrings_021987b9-2eaf-4a5d-9a23-d65ce13220d8.jpg?v=1719906849",
      variants: [
        { variantId: "gid://shopify/ProductVariant/46231170121979", title: "Small", price: "829.00" },
        { variantId: "gid://shopify/ProductVariant/46231170121980", title: "Medium", price: "899.00" },
        { variantId: "gid://shopify/ProductVariant/46231170121981", title: "Large", price: "949.00" },
      ],
      selectedVariantId: "gid://shopify/ProductVariant/46231170121979",
      quantity: 1,
    },
  ]);
  const [detectChange, setDetectChange] = useState(false);
  const fetcher = useFetcher();
  const savedSpecRef = useRef(null);
  const savingRef = useRef(false);

  // Derive loading purely from fetcher state — avoids the race where
  // loadingSave state goes true before fetcher has left "idle"
  const loadingSave = fetcher.state !== "idle";

  useEffect(() => {
    // eslint-disable-next-line no-undef
    if (detectChange) shopify.saveBar.show(SAVE_BAR_ID);
    // eslint-disable-next-line no-undef
    else shopify.saveBar.hide(SAVE_BAR_ID);
  }, [detectChange]);

  useEffect(() => {
    // Guard with ref so this only fires after WE triggered a save,
    // not on every idle→idle render cycle
    if (!savingRef.current || fetcher.state !== "idle") return;
    savingRef.current = false;
    const result = fetcher.data;
    if (result?.ok) {
      setInitialState(savedSpecRef.current ?? cartSpec);
      setDetectChange(false);
    }
    savedSpecRef.current = null;
  }, [fetcher.state]);

  function handleSpecChange(section, value) {
    setCartSpec((prev) => ({ ...prev, [section]: value }));
    setDetectChange(true);
  }

  function handleFullSpecChange(newSpec) {
    setCartSpec(newSpec);
    setDetectChange(true);
  }

  function handleDiscard() {
    setCartSpec(initialState);
    setDetectChange(false);
  }

  function handleSave() {
    savingRef.current = true;
    savedSpecRef.current = cartSpec;
    fetcher.submit(cartSpec, {
      method: "POST",
      action: "/app/save-cart",
      encType: "application/json",
    });
  }

  return (
    <div className={styles.page}>
      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={handleSave}
          loading={loadingSave ? "" : undefined}
        >
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <div className={styles.columns}>
        <ChatSection spec={cartSpec} onSpecChange={handleFullSpecChange} />
        <PreviewSection spec={cartSpec} products={selectedProducts} onProductsChange={setSelectedProducts} />
        <ManualSettingsSection
          spec={cartSpec}
          onChange={handleSpecChange}
          products={selectedProducts}
          onProductsChange={(val) => {
            setSelectedProducts(val);
          }}
        />
      </div>
    </div>
  );
}
