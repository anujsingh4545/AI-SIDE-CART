import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import styles from "./ChatSection.module.css";

const QUICK_CHIPS = [
  "🚚 Unlock free shipping",
  "⏱️ Create urgency",
  "🎁 Surprise free gift",
  "🛡️ Build trust",
  "💳 Show payment icons",
  "📝 Collect order notes",
];

export default function ChatSection({ spec, onSpecChange, initialSummary, onSave, onDiscard, isSaving }) {
  const [messages, setMessages] = useState(() => {
    if (initialSummary) {
      return [
        { role: "user", content: "Build my cart" },
        { role: "assistant", content: initialSummary },
      ];
    }
    return [{ role: "assistant", content: "Hey, how can I help you today?" }];
  });
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [aiMadeChange, setAiMadeChange] = useState(false);
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
      if (updatedSpec) {
        onSpecChange(updatedSpec);
        setAiMadeChange(true);
      }
      setIsTyping(false);
    }
  }, [fetcher.state, fetcher.data]);

  function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const newMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsTyping(true);

    fetcher.submit(
      { messages: newMessages, spec },
      { method: "POST", action: "/app/chat", encType: "application/json" },
    );
  }

  function handleSend() {
    sendMessage(input);
  }

  function handleChip(chip) {
    sendMessage(chip);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div className={styles.container}>
      <div className={styles.wrap}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>✦</div>
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>Build with AI</span>
            <span className={styles.headerSub}>Describe a change — I'll set it up on the left and update the cart.</span>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesRef} className={styles.messages}>
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className={styles.aiRow}>
                <div className={styles.aiAvatar}>✦</div>
                <div className={styles.bubbleAI}>{m.content}</div>
              </div>
            ) : (
              <div key={i} className={styles.bubbleUser}>{m.content}</div>
            )
          )}

          {isTyping && (
            <div className={styles.aiRow}>
              <div className={styles.aiAvatar}>✦</div>
              <div className={styles.typing}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Bottom */}
        <div className={styles.bottom}>
          {aiMadeChange && (
            <div className={styles.actionRow}>
              <span className={styles.actionLabel}>Changes applied to preview</span>
              <div className={styles.actionBtns}>
                <button
                  className={styles.discardBtn}
                  onClick={() => { onDiscard(); setAiMadeChange(false); }}
                  disabled={isSaving}
                >
                  Discard
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={() => { onSave(); setAiMadeChange(false); }}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
          <div className={styles.chips}>
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                className={styles.chip}
                onClick={() => handleChip(chip)}
                disabled={isTyping}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className={styles.inputRow}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder="Tell me what to change..."
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
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
