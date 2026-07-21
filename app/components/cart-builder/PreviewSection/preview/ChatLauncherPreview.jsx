import { Icon } from "@shopify/polaris";
import { ChevronRightIcon } from "@shopify/polaris-icons";
import styles from "./ChatLauncherPreview.module.css";

export default function ChatLauncherPreview({ data }) {
  if (!data?.enabled) return null;
  const { title, subtitle, avatarEmoji } = data.props ?? {};
  const bgColor = data.style?.bgColor ?? "#111111";
  const textColor = data.style?.textColor ?? "#FFFFFF";
  const borderRadius = data.style?.borderRadius ?? 14;

  return (
    <div
      className={styles.wrap}
      style={{ background: bgColor, borderRadius, color: textColor }}
    >
      <div className={styles.avatar}>
        <span>{avatarEmoji ?? "◆"}</span>
      </div>
      <div className={styles.text}>
        <p className={styles.title} style={{ color: textColor }}>{title}</p>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <span className={styles.chevron}>
        <Icon source={ChevronRightIcon} tone="textInverse" />
      </span>
    </div>
  );
}
