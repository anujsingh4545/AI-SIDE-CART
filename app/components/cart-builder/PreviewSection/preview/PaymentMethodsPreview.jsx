import styles from "./PaymentMethodsPreview.module.css";

export default function PaymentMethodsPreview({ data }) {
  if (!data?.enabled) return null;
  const icons = data.props?.icons ?? [];
  const s = data.style ?? {};
  return (
    <div className={styles.wrap}>
      {icons.map(icon => (
        <span
          key={icon}
          className={styles.badge}
          style={{
            color: s.textColor ?? "#666666",
            background: s.bgColor ?? "#FFFFFF",
            fontSize: s.fontSize ?? 9,
            borderRadius: s.borderRadius ?? 5,
            borderColor: s.borderColor ?? "#DDDDDD",
          }}
        >
          {icon}
        </span>
      ))}
    </div>
  );
}
