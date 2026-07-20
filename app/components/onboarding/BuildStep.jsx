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
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [detectChange, setDetectChange] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const fetcher = useFetcher();
  const savedSpecRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line no-undef
    if (detectChange) shopify.saveBar.show(SAVE_BAR_ID);
    // eslint-disable-next-line no-undef
    else shopify.saveBar.hide(SAVE_BAR_ID);
  }, [detectChange]);

  useEffect(() => {
    if (fetcher.state === "idle" && loadingSave) {
      setLoadingSave(false);
      setInitialState(savedSpecRef.current ?? cartSpec);
      savedSpecRef.current = null;
      setDetectChange(false);
    }
  }, [fetcher.state, loadingSave]);

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
    setLoadingSave(true);
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
        <PreviewSection />
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
