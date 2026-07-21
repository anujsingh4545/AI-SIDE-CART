import styles from "./DiscountCodePreview.module.css";

export default function DiscountCodePreview({ data }) {
  if (!data?.enabled) return null;
  const { placeholderTitle, buttonText } = data.props ?? {};
  const btnBg = data.style?.buttonBgColor ?? "#6D28D9";
  const btnColor = data.style?.buttonColor ?? "#FFFFFF";
  return (
    <div className={styles.wrap}>
      <div className={styles.input}>{placeholderTitle}</div>
      <button className={styles.btn} style={{ background: btnBg, color: btnColor }}>{buttonText}</button>
    </div>
  );
}
