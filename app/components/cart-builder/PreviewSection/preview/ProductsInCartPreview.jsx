import { Icon } from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import styles from "./ProductsInCartPreview.module.css";

export default function ProductsInCartPreview({ data, cartItems = [], onCartItemsChange }) {
  if (!data?.enabled) return null;
  const { showVariantSelector, showQuantitySelector, showSingleItemPrice, emptyText } = data.props ?? {};
  const imageSize = data.style?.imageSize ?? 64;
  const titleColor = data.style?.titleColor ?? "#111111";

  function changeQty(productId, delta) {
    onCartItemsChange(cartItems.map(item =>
      item.productId === productId ? { ...item, qty: Math.max(1, item.qty + delta) } : item
    ));
  }

  function changeVariant(productId, variantId) {
    onCartItemsChange(cartItems.map(item =>
      item.productId === productId ? { ...item, selectedVariantId: variantId } : item
    ));
  }

  function removeItem(productId) {
    onCartItemsChange(cartItems.filter(item => item.productId !== productId));
  }

  if (!cartItems.length) return <p className={styles.empty}>{emptyText ?? "Your cart is empty."}</p>;

  return (
    <div className={styles.wrap}>
      {cartItems.map((item) => {
        const selectedVariant =
          item.variants.find((v) => v.variantId === item.selectedVariantId) ??
          item.variants[0];
        const priceDollars = parseFloat(selectedVariant?.price ?? "0");
        const total = (priceDollars * item.qty).toFixed(2);


        return (
          <div key={item.productId} className={styles.row}>
            <div className={styles.imageWrap} style={{ width: imageSize, height: imageSize }}>
              {item.image
                ? <img src={item.image} alt={item.title} className={styles.image} />
                : <div className={styles.imagePlaceholder} />
              }
            </div>

            <div className={styles.info}>
              <p className={styles.title} style={{ color: titleColor }}>{item.title}</p>

              <div className={styles.controls}>
                {showVariantSelector && item.variants.length > 1 && (
                  <select
                    className={styles.variantSelect}
                    value={item.selectedVariantId ?? ""}
                    onChange={(e) => changeVariant(item.productId, e.target.value)}
                  >
                    {item.variants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>{v.title}</option>
                    ))}
                  </select>
                )}

                {showQuantitySelector && (
                  <div className={styles.qty}>
                    <button className={styles.qtyBtn} onClick={() => changeQty(item.productId, -1)}>−</button>
                    <span className={styles.qtyNum}>{item.qty}</span>
                    <button className={styles.qtyBtn} onClick={() => changeQty(item.productId, 1)}>+</button>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.right}>
              <span className={styles.price}>
                {showSingleItemPrice
                  ? `$ ${(parseFloat(total) / item.qty).toFixed(2)}`
                  : `$ ${total}`}
              </span>
              <button className={styles.trash} onClick={() => removeItem(item.productId)} aria-label="Remove">
                <Icon source={DeleteIcon} tone="subdued" />
              </button> 
            </div>
          </div>
        );
      })}
    </div>
  );
}
