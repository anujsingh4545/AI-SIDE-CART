import styles from "./TrustBadgesPreview.module.css";

export default function TrustBadgesPreview({ data }) {
  if (!data?.enabled) return null;
  const badges = data.props?.badges ?? [];
  const textColor = data.style?.textColor ?? "#666666";
  const textSize = data.style?.textSize ?? 11;
  return (
    <div className={styles.wrap}>
      {badges.map((b, i) => (
        <span key={i} style={{ color: textColor, fontSize: textSize }}>{b.title}</span>
      ))}
    </div>
  );
}
