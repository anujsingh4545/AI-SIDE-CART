import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import defaultCartSpec from "../../constants/cart-spec.js";

export default function BuildStep({ spec }) {
  const modalRef = useRef(null);
  const fetcher  = useFetcher();

  const cartSpec = spec ?? defaultCartSpec;
  const saving   = fetcher.state !== "idle";
  const saved    = fetcher.data?.ok === true;

  useEffect(() => {
    modalRef.current?.show();
  }, []);

  function handleSave() {
    fetcher.submit(cartSpec, {
      method:  "POST",
      action:  "/app/save-cart",
      encType: "application/json",
    });
  }

  return (
    <ui-modal id="cart-builder-modal" ref={modalRef} variant="max">
      <ui-title-bar title="Build your cart" />

      <div style={{ padding: 32 }}>
        <p style={{ fontFamily: "sans-serif", color: "#444", marginBottom: 16 }}>
          Your AI-generated cart spec is ready. Editor coming soon.
        </p>

        <pre style={{
          fontSize: 11,
          background: "#f5f5f5",
          padding: 16,
          borderRadius: 8,
          overflow: "auto",
          marginBottom: 24,
        }}>
          {JSON.stringify(cartSpec, null, 2)}
        </pre>

        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            padding:      "10px 24px",
            background:   saved ? "#2E7D32" : "#6D28D9",
            color:        "#fff",
            border:       "none",
            borderRadius: 8,
            fontSize:     14,
            cursor:       saving || saved ? "default" : "pointer",
            opacity:      saving ? 0.7 : 1,
          }}
        >
          {saved ? "✓ Saved & published" : saving ? "Saving…" : "Save & publish"}
        </button>

        {fetcher.data?.userErrors?.length > 0 && (
          <p style={{ color: "red", marginTop: 8, fontSize: 12 }}>
            {fetcher.data.userErrors.map((e) => e.message).join(", ")}
          </p>
        )}
      </div>
    </ui-modal>
  );
}
