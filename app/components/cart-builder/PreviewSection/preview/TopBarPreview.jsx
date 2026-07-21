import styles from "./TopBarPreview.module.css";

export default function TopBarPreview({ data, general, itemCount }) {
  if (!data?.enabled) return null;
  const { title, showItemCount } = data.props;
  const label = showItemCount ? `${title} • ${itemCount}` : title;
  const textColor = general?.textColor ?? "#111111";
  return (
    <div className={styles.wrap}>
      <span className={styles.title} style={{ color: textColor }}>{label}</span>
      <button className={styles.close} style={{ color: textColor }} aria-label="Close">✕</button>
    </div>
  );
}
