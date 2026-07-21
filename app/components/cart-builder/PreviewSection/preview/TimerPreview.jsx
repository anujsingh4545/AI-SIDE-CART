import { useEffect, useRef, useState } from "react";
import styles from "./TimerPreview.module.css";

function fmt(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function TimerPreview({ data, onClearProducts }) {
  if (!data?.enabled) return null;

  const totalSecs = (data.props?.timeLimit ?? 45) * 60;
  const [remaining, setRemaining] = useState(totalSecs);
  const intervalRef = useRef(null);

  useEffect(() => {
    setRemaining(totalSecs);
  }, [totalSecs]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (data.props?.removeCartItemsTimerEnds) onClearProducts?.();
          if (data.props?.resetTimerProductAddedToCart) return totalSecs;
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [totalSecs, data.props?.resetTimerProductAddedToCart, data.props?.removeCartItemsTimerEnds]);

  const text = (data.props?.title ?? "").replace("{{timer}}", fmt(remaining));

  return (
    <div className={styles.wrap} style={{ background: data.style?.bgColor ?? "#EDE4FA" }}>
      <span style={{ color: data.style?.text ?? "#6D28D9" }}>{text}</span>
    </div>
  );
}
