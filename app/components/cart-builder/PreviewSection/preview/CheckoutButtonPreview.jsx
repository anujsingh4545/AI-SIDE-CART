import styles from "./CheckoutButtonPreview.module.css";

export default function CheckoutButtonPreview({ data, subtotal }) {
  if (!data?.enabled) return null;
  const label = (data.props?.title ?? "Checkout").replace("{{cart_total}}", `Rs. ${((subtotal ?? 0) / 100).toFixed(2)}`);
  return (
    <div className={styles.wrap}>
      <button
        className={styles.btn}
        style={{
          background: data.style?.bgColor ?? "#6D28D9",
          color: data.style?.textColor ?? "#FFFFFF",
          fontSize: data.style?.fontSize ?? 16,
          borderRadius: data.style?.borderRadius ?? 10,
        }}
      >
        {label}
      </button>
    </div>
  );
}
