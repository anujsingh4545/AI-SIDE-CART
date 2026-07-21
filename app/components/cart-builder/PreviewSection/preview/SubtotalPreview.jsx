import styles from "./SubtotalPreview.module.css";

export default function SubtotalPreview({ data, subtotal }) {
  if (!data?.enabled) return null;
  const { title } = data.props ?? {};
  const titleColor = data.style?.titleColor ?? "#111111";
  const amountColor = data.style?.discountedColor ?? "#111111";
  return (
    <div className={styles.wrap}>
      <span style={{ color: titleColor }}>{title}</span>
      <span style={{ color: amountColor }} className={styles.amount}>
        Rs. {((subtotal ?? 0) / 100).toFixed(2)}
      </span>
    </div>
  );
}
