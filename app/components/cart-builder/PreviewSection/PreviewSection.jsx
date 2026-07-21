import { useState, useEffect } from "react";
import styles from "./PreviewSection.module.css";
import TopBarPreview from "./preview/TopBarPreview.jsx";
import TimerPreview from "./preview/TimerPreview.jsx";
import ProgressBarPreview from "./preview/ProgressBarPreview.jsx";
import ProductsInCartPreview from "./preview/ProductsInCartPreview.jsx";
import DiscountCodePreview from "./preview/DiscountCodePreview.jsx";
import OrderNotesPreview from "./preview/OrderNotesPreview.jsx";
import SubtotalPreview from "./preview/SubtotalPreview.jsx";
import CheckoutButtonPreview from "./preview/CheckoutButtonPreview.jsx";
import TrustBadgesPreview from "./preview/TrustBadgesPreview.jsx";
import PaymentMethodsPreview from "./preview/PaymentMethodsPreview.jsx";
import ChatLauncherPreview from "./preview/ChatLauncherPreview.jsx";

const BODY_MAP ={ TIMER: TimerPreview, PROGRESS_BAR: ProgressBarPreview, PRODUCTS_IN_CART: ProductsInCartPreview };
const SCROLLABLE_BODY_KEYS = new Set(["PRODUCTS_IN_CART"]);
const FOOTER_MAP = {
  DISCOUNT_CODE: DiscountCodePreview,
  ORDER_NOTES: OrderNotesPreview,
  SUBTOTAL: SubtotalPreview,
  CHECKOUT_BUTTON: CheckoutButtonPreview,
  TRUST_BADGES: TrustBadgesPreview,
  PAYMENT_METHODS: PaymentMethodsPreview,
  CHAT_LAUNCHER: ChatLauncherPreview,
};

function computeCart(products) {
  let total = 0;
  let qty = 0;
  for (const p of products) {
    const variant = p.variants?.find(v => v.variantId === p.selectedVariantId) ?? p.variants?.[0];
    const price = parseFloat(variant?.price ?? "0");
    const q = p.qty ?? p.quantity ?? 1;
    total += price * q;
    qty += q;
  }
  return { cartTotal: parseFloat(total.toFixed(2)), cartQty: qty };
}

export default function PreviewSection({ spec, products = [], onProductsChange }) {
  const [cartItems, setCartItems] = useState(() =>
    products.map(p => ({ ...p, qty: p.quantity ?? 1 }))
  );

  useEffect(() => {
    setCartItems(products.map(p => ({ ...p, qty: p.quantity ?? 1 })));
  }, [products]);

  if (!spec) return <div className={styles.wrap}><p>No spec</p></div>;

  const itemCount = cartItems.length;
  const { cartTotal, cartQty } = computeCart(cartItems);
  const subtotalCents = Math.round(cartTotal * 100);

  const bodyOrder = spec.body?.order ?? [];
  const footerOrder = spec.footer?.order ?? [];

  function renderBlocks(map, section, order, extraProps = {}) {
    return order.map(key => {
      const Comp = map[key];
      const data = section?.[key];
      if (!Comp || !data?.enabled) return null;
      return <Comp key={key} data={data} general={spec.general} subtotal={subtotalCents} itemCount={itemCount} {...extraProps[key]} />;
    });
  }

  const radius = spec.general?.radius ?? 10;
  const bgColor = spec.general?.bgColor ?? "#fff";

  return (
    <div className={styles.wrap}>
      <div
        className={styles.phone}
        style={{ borderRadius: `${radius}px 0 0 ${radius}px` }}
      >
        {spec.header?.TOP_BAR?.enabled && (
          <div className={styles.cartHeader} style={{ background: bgColor }}>
            <TopBarPreview data={spec.header.TOP_BAR} general={spec.general} itemCount={itemCount} />
          </div>
        )}
        <div className={styles.cartBodyFixed} style={{ background: bgColor }}>
          {renderBlocks(BODY_MAP, spec.body, bodyOrder.filter(k => !SCROLLABLE_BODY_KEYS.has(k)), {
            TIMER: { onClearProducts: () => onProductsChange?.([]) },
            PROGRESS_BAR: { cartTotal, cartQty },
          })}
        </div>
        <div className={styles.cartBody} style={{ background: bgColor }}>
          {renderBlocks(BODY_MAP, spec.body, bodyOrder.filter(k => SCROLLABLE_BODY_KEYS.has(k)), {
            PRODUCTS_IN_CART: {
              cartItems,
              onCartItemsChange: (newItems) => {
                setCartItems(newItems);
                onProductsChange?.(newItems.map(item => ({ ...item, quantity: item.qty })));
              },
            },
          })}
        </div>
        <div
          className={styles.cartFooter}
          style={{
            background: spec.footer?.style?.bgColor ?? "#fff",
            gap: `${spec.footer?.style?.verticalSpacing ?? 0}px`,
            paddingTop: `${spec.footer?.style?.verticalSpacing ?? 0}px`,
            paddingBottom: `${spec.footer?.style?.verticalSpacing ?? 0}px`,
          }}
        >
          {renderBlocks(FOOTER_MAP, spec.footer, footerOrder)}
        </div>
      </div>
    </div>
  );
}
