import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import styles from "./ChatSection.module.css";

export default function ChatSection({ spec, onSpecChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const fetcher = useFetcher();
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const { message, spec: updatedSpec } = fetcher.data;
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
      if (updatedSpec) onSpecChange(updatedSpec);
      setIsTyping(false);
    }
  }, [fetcher.state, fetcher.data]);

  function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    fetcher.submit(
      { messages: newMessages, spec },
      { method: "POST", action: "/app/chat", encType: "application/json" },
    );
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    // Auto-grow textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div className={styles.wrap}>
      <div ref={messagesRef} className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>✦</span>
            <p className={styles.emptyText}>
              Ask me to change colors, text, enable features, or anything about your cart.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.bubble} ${m.role === "user" ? styles.bubbleUser : styles.bubbleAI}`}
            >
              {m.content}
            </div>
          ))
        )}

        {isTyping && (
          <div className={styles.typing}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Ask AI to update your cart…"
          value={input}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
        >
          Send
        </button>
      </div>
    </div>
  );
}
