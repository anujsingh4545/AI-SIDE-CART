/* Hackathon default chat spec. Deleted once the admin editor publishes to the
   cart.published_chat_spec metafield (#sc-chat-spec wins whenever present). */
window.__SC_CHAT_SPEC__ = {
  general: {
    // same theme tokens as the side cart (cart-spec.js general)
    bgColor: "#FFFFFF",
    textColor: "#111111",
    accentColor: "#6D28D9",
    accentTextColor: "#FFFFFF",
    radius: 12,
  },
  header: {
    title: "AI Stylist",
    statusText: "Online · replies instantly",
    avatarEmoji: "◆",
  },
  conversation: {
    welcomeMessage: "Hi! I'm your personal stylist. I can pull looks together, help with sizing, or check on an order. What can I help with?",
    quickReplies: ["Complete this look", "What's my size?", "Track my order"],
    inputPlaceholder: "Ask anything…",
    errorText: "Sorry, I couldn't process your request. Please try again later.",
  },
};
