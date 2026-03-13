"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const C = {
  bg: "#0E0E0E",
  card: "#141414",
  cardHover: "#181818",
  input: "#1A1A1A",
  border: "rgba(255,255,255,0.06)",
  borderMd: "rgba(255,255,255,0.10)",
  text: "#F2F2F2",
  textSub: "#8C8C8C",
  textMute: "#4A4A4A",
  cyan: "#00D4FF",
  violet: "#8B5CF6",
  green: "#3FB950",
  red: "#F85149",
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', system-ui, sans-serif",
  head: "'Sora', 'Inter', sans-serif",
};

interface Message {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface AgentChatProps {
  sessionId?: string;
}

export default function AgentChat({ sessionId }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      content: "Welcome to DSAgent! You can chat with me directly about data science, or upload a CSV to analyze your data.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [datasetMeta, setDatasetMeta] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Conversation history for multi-turn chat
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      conversationRef.current = [];
    }
  }, [sessionId]);

  // ── Message helpers ────────────────────────────────────────────────────────
  const addMessage = (role: Message["role"], content: string) => {
    const safeContent = (content != null && typeof content === "string") ? content : String(content ?? "");
    setMessages((prev) =>
      prev.filter((m) => m.id !== "loading").concat({
        id: `msg-${Date.now()}-${Math.random()}`,
        role,
        content: safeContent,
        timestamp: new Date(),
      })
    );
  };

  const addLoadingMessage = () => {
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== "loading"),
      { id: "loading", role: "agent" as const, content: "", timestamp: new Date(), isLoading: true },
    ]);
  };

  const removeLoading = () => {
    setMessages((prev) => prev.filter((m) => m.id !== "loading"));
  };

  // ── LLM call via /api/llm/run (Bytez → GPT-4o) ────────────────────────────
  const callLLM = async (userMessage: string): Promise<string> => {
    // Build system prompt — include dataset context if available
    let systemPrompt = `You are DSAgent, an expert AI data scientist. You help with data analysis, machine learning, statistics, Python/pandas, and data visualization. Be concise, accurate, and actionable.`;

    if (currentSessionId && datasetMeta) {
      systemPrompt += `\n\nThe user has uploaded a dataset. Here is the metadata:\n${datasetMeta}\n\nAnswer questions about this dataset directly. Suggest analyses, interpret results, and guide the user.`;
    }

    // Push user message into history
    conversationRef.current.push({ role: "user", content: userMessage });

    // Keep last 12 messages to avoid token overflow
    const recentHistory = conversationRef.current.slice(-12);

    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        ...recentHistory,
      ],
    };

    const response = await fetch("/api/llm/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`LLM API error (${response.status}): ${responseText.slice(0, 300)}`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Failed to parse LLM response: ${responseText.slice(0, 200)}`);
    }

    // Try every known response shape from Bytez/OpenAI
    const content =
      data?.output?.choices?.[0]?.message?.content ||
      data?.output?.content ||
      data?.choices?.[0]?.message?.content ||
      (typeof data?.output === "string" ? data.output : null) ||
      (typeof data?.content === "string" ? data.content : null);

    if (!content || typeof content !== "string" || !content.trim()) {
      console.error("Full LLM response:", JSON.stringify(data).slice(0, 800));
      throw new Error("LLM returned empty or unrecognized response. Check browser console for details.");
    }

    // Push assistant reply into history
    conversationRef.current.push({ role: "assistant", content });

    return content;
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      addMessage("system", "⚠️ Only CSV files are supported right now.");
      return;
    }

    addMessage("user", `📂 Uploading: ${file.name}`);
    addLoadingMessage();
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/agent/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || "Upload failed");
      }

      const result = await response.json();
      const meta = result.metadata;

      setCurrentSessionId(result.session_id);
      conversationRef.current = []; // fresh conversation for new dataset

      // Build a text summary of the dataset for the LLM system prompt
      const metaSummary = [
        `Filename: ${meta.filename}`,
        `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
        `Size: ${meta.memory_usage_mb} MB`,
        `Numeric columns: ${meta.numeric_columns?.join(", ") || "none"}`,
        `Categorical columns: ${meta.categorical_columns?.join(", ") || "none"}`,
      ].join("\n");

      setDatasetMeta(metaSummary);

      removeLoading();
      addMessage(
        "agent",
        `✅ **${file.name}** uploaded successfully!\n\n📊 **Dataset Overview:**\n• ${meta.row_count?.toLocaleString()} rows × ${meta.column_count} columns\n• Size: ${meta.memory_usage_mb} MB\n• Numeric: ${meta.numeric_columns?.join(", ") || "none"}\n• Categorical: ${meta.categorical_columns?.join(", ") || "none"}\n\nWhat would you like to analyze? I can find patterns, detect outliers, build ML models, or answer any questions about the data.`
      );
    } catch (err: any) {
      removeLoading();
      addMessage("system", `❌ Upload failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const question = input.trim();
    if (!question || isAnalyzing) return;

    setInput("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    addMessage("user", question);
    addLoadingMessage();
    setIsAnalyzing(true);

    try {
      const answer = await callLLM(question);
      removeLoading();
      addMessage("agent", answer);
    } catch (err: any) {
      removeLoading();
      const msg = err?.message || "Unknown error occurred";
      addMessage("system", `❌ ${msg}`);
      console.error("Chat error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = currentSessionId
    ? ["Summarize this dataset", "Find patterns and correlations", "Detect outliers and missing values", "Which column should I use as target?"]
    : ["Explain linear regression", "How do I handle missing data?", "What is a confusion matrix?", "Write pandas code to clean data"];

  // ── Render content (markdown-lite) ────────────────────────────────────────
  const renderContent = (text: string) => {
    if (!text || typeof text !== "string") return <span style={{ color: C.textMute }}>—</span>;

    return text.split("\n").map((line, i) => {
      const html = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.*?)`/g, `<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:${C.mono};font-size:11px">$1</code>`);
      return (
        <div
          key={i}
          style={{ minHeight: line === "" ? "0.6em" : undefined }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });
  };

  // ── Render single message ──────────────────────────────────────────────────
  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    const isSystem = msg.role === "system";

    if (msg.isLoading) {
      return (
        <div key="loading" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.cyan}22, ${C.violet}22)`,
            border: `1px solid ${C.cyan}33`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
          }}>🤖</div>
          <div style={{
            padding: "10px 14px", borderRadius: "12px 12px 12px 4px",
            background: C.card, border: `1px solid ${C.border}`,
            display: "flex", gap: 5, alignItems: "center",
          }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%", background: C.cyan,
                animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        {!isUser && (
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: isSystem ? `${C.red}22` : `linear-gradient(135deg, ${C.cyan}22, ${C.violet}22)`,
            border: `1px solid ${isSystem ? C.red + "44" : C.cyan + "33"}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
          }}>
            {isSystem ? "⚠️" : "🤖"}
          </div>
        )}

        <div style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: isUser
            ? `linear-gradient(135deg, ${C.cyan}18, ${C.violet}18)`
            : isSystem ? `${C.red}10` : C.card,
          border: `1px solid ${
            isUser ? C.cyan + "33" : isSystem ? C.red + "33" : C.border
          }`,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", marginBottom: 6,
            color: isUser ? C.cyan : isSystem ? C.red : C.violet,
            fontFamily: C.mono,
          }}>
            {isUser ? "You" : isSystem ? "System" : "DSAgent"}
          </div>

          <div style={{
            fontSize: 12.5, color: C.text, lineHeight: 1.75,
            fontFamily: C.sans, wordBreak: "break-word",
          }}>
            {renderContent(msg.content)}
          </div>

          <div style={{
            fontSize: 9, color: C.textMute, marginTop: 6,
            fontFamily: C.mono, textAlign: isUser ? "right" : "left",
          }}>
            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </motion.div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        background: C.bg, borderRadius: 12, overflow: "hidden",
        border: `1px solid ${C.border}`, position: "relative",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
      }}
    >
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#111111", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isAnalyzing ? C.cyan : C.green,
            boxShadow: `0 0 8px ${isAnalyzing ? C.cyan : C.green}`,
            animation: "statusPulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontFamily: C.head, fontSize: 13, fontWeight: 600, color: C.text }}>
            DSAgent Terminal
          </span>
          {currentSessionId && (
            <span style={{
              fontSize: 9, padding: "2px 7px", borderRadius: 4,
              background: `${C.cyan}15`, color: C.cyan,
              border: `1px solid ${C.cyan}30`, fontFamily: C.mono,
            }}>
              Dataset loaded
            </span>
          )}
          {isAnalyzing && (
            <span style={{
              fontSize: 9, padding: "2px 7px", borderRadius: 4,
              background: `${C.violet}15`, color: C.violet,
              border: `1px solid ${C.violet}30`, fontFamily: C.mono,
            }}>
              thinking…
            </span>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
            background: `${C.cyan}18`, color: C.cyan,
            border: `1px solid ${C.cyan}33`,
            cursor: isAnalyzing ? "not-allowed" : "pointer",
            fontFamily: C.sans, opacity: isAnalyzing ? 0.5 : 1,
            transition: "all 0.15s",
          }}
        >
          + Upload CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: `${C.cyan}10`,
              border: `2px dashed ${C.cyan}`, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontFamily: C.head, fontSize: 16, color: C.cyan, fontWeight: 600 }}>
              Drop CSV to upload
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px",
        display: "flex", flexDirection: "column", gap: 14,
        scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
      }}>
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts — show only at start */}
      {messages.length <= 2 && (
        <div style={{
          padding: "0 16px 10px",
          display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0,
        }}>
          {quickPrompts.map((p) => (
            <button
              key={p}
              onClick={() => { setInput(p); textareaRef.current?.focus(); }}
              style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11,
                background: C.card, color: C.textSub,
                border: `1px solid ${C.border}`, cursor: "pointer",
                fontFamily: C.sans, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = C.text;
                (e.currentTarget as HTMLElement).style.borderColor = C.borderMd;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = C.textSub;
                (e.currentTarget as HTMLElement).style.borderColor = C.border;
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "12px 16px",
        borderTop: `1px solid ${C.border}`,
        background: "#111111", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-end",
          background: C.input, borderRadius: 10,
          border: `1px solid ${isAnalyzing ? C.cyan + "44" : C.border}`,
          padding: "8px 12px", transition: "border-color 0.2s",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isAnalyzing ? "Thinking…" :
              currentSessionId ? "Ask anything about your data…" :
              "Ask me anything about data science…"
            }
            disabled={isAnalyzing}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.text, fontSize: 12, fontFamily: C.sans,
              resize: "none", lineHeight: 1.6, maxHeight: 120, overflowY: "auto",
            }}
          />
          <button
            onClick={handleSend}
            disabled={isAnalyzing || !input.trim()}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: (!isAnalyzing && input.trim())
                ? `linear-gradient(135deg, ${C.cyan}, #0099CC)`
                : C.border,
              border: "none",
              cursor: (isAnalyzing || !input.trim()) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
          >
            {isAnalyzing ? (
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: `2px solid ${C.textSub}`,
                borderTopColor: C.cyan,
                animation: "spin 0.8s linear infinite",
              }} />
            ) : (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke={input.trim() ? "#030712" : C.textMute}
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22,2 15,22 11,13 2,9" />
              </svg>
            )}
          </button>
        </div>
        <div style={{
          fontSize: 10, color: C.textMute, marginTop: 6,
          fontFamily: C.mono, textAlign: "center",
        }}>
          {isAnalyzing
            ? "Calling GPT-4o via Bytez API…"
            : "Enter to send · Shift+Enter for newline · Drag & drop CSV to upload"}
        </div>
      </div>

      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}