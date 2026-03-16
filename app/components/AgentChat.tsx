// app\components\AgentChat.tsx
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
  role: "user" | "agent" | "system" | "tool";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  toolName?: string;
}

interface AgentChatProps {
  sessionId?: string;
  chatId?: string | null;
  onChatCreated?: (chatId: string) => void;
}

export default function AgentChat({ sessionId, chatId: initialChatId, onChatCreated }: AgentChatProps) {
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
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // dataPreview is shown as a sticky banner at the TOP of the chat, not inline in scroll
  const [dataPreview, setDataPreview] = useState<{ columns: string[]; rows: Record<string, any>[]; filename?: string } | null>(null);
  const [dataPreviewOpen, setDataPreviewOpen] = useState(false);
  const [toolDefs, setToolDefs] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId || null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const prevChatIdRef = useRef<string | null | undefined>(initialChatId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const internalChatIdRef = useRef<string | null>(initialChatId || null);
  const conversationRef = useRef<any[]>([]);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handle chatId prop changes ──────────────────────────────────────────────
  useEffect(() => {
    if (initialChatId) {
      if (internalChatIdRef.current === initialChatId) {
        prevChatIdRef.current = initialChatId;
        return;
      }
    } else {
      if (prevChatIdRef.current) {
        setCurrentChatId(null);
        internalChatIdRef.current = null;
        setMessages([{
          id: "welcome",
          role: "agent",
          content: "Welcome to DSAgent! You can chat with me directly about data science, or upload a CSV to analyze your data.",
          timestamp: new Date(),
        }]);
        conversationRef.current = [];
        setCurrentSessionId(null);
        setDatasetMeta("");
        setDataPreview(null);
        setDataPreviewOpen(false);
      }
      prevChatIdRef.current = initialChatId;
      return;
    }

    setCurrentChatId(initialChatId);
    internalChatIdRef.current = initialChatId;
    setMessages([{
      id: "loading-history",
      role: "agent",
      content: "Loading conversation...",
      timestamp: new Date(),
      isLoading: true,
    }]);
    setDataPreview(null);
    setDataPreviewOpen(false);

    loadChat(initialChatId);
    prevChatIdRef.current = initialChatId;
  }, [initialChatId]);

  // ── Load chat from DB and restore dataset context ───────────────────────────
  const loadChat = async (id: string) => {
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error("Failed to fetch chat");

      const data = await res.json();
      const chat = data.chat;

      // Restore messages
      if (chat?.messages?.length) {
        const loaded: Message[] = chat.messages.map((m: any) => ({
          id: m.id,
          role: m.role === "assistant" ? "agent" : m.role,
          content: m.content,
          timestamp: new Date(m.createdAt),
        }));
        // Remove loading placeholder and set real messages
        setMessages(loaded);
        conversationRef.current = chat.messages.map((m: any) => ({
          role: m.role === "agent" ? "assistant" : m.role,
          content: m.content,
        }));
      } else {
        setMessages([{
          id: "welcome",
          role: "agent",
          content: "Welcome to DSAgent! You can chat with me directly about data science, or upload a CSV to analyze your data.",
          timestamp: new Date(),
        }]);
      }

      // Restore dataset session if chat has a sessionId
      if (chat?.sessionId) {
        setCurrentSessionId(chat.sessionId);
        await restoreDatasetContext(chat.sessionId);
      } else {
        // No dataset for this chat
        setMessages((prev) => prev.filter((m) => m.id !== "loading-history"));
      }

    } catch (e) {
      console.warn("Failed to load chat:", e);
      setMessages([{
        id: "welcome",
        role: "agent",
        content: "Welcome to DSAgent! You can chat with me directly about data science, or upload a CSV to analyze your data.",
        timestamp: new Date(),
      }]);
    }
  };

  // ── Restore dataset meta + preview from backend ─────────────────────────────
  const restoreDatasetContext = async (sid: string) => {
    try {
      const metaRes = await fetch(`/api/agent/session/${sid}/metadata`);
      if (!metaRes.ok) {
        showDatasetLostWarning();
        return;
      }

      const metaData = await metaRes.json();

      if (!metaData.found) {
        showDatasetLostWarning();
        return;
      }

      const meta = metaData.metadata;

      // Rebuild LLM system prompt context string
      const metaSummary = [
        `Filename: ${meta.filename}`,
        `Rows: ${(meta.row_count ?? 0).toLocaleString()}, Columns: ${meta.column_count}`,
        `Size: ${meta.memory_usage_mb} MB`,
        `Numeric columns: ${meta.numeric_columns?.join(", ") || "none"}`,
        `Categorical columns: ${meta.categorical_columns?.join(", ") || "none"}`,
      ].join("\n");

      setDatasetMeta(metaSummary);

      // Restore the data preview table
      if (meta.sample_rows?.length > 0) {
        // columns can be array of strings or array of {name: string} objects
        const cols: string[] = (meta.columns ?? []).map((c: any) =>
          typeof c === "string" ? c : c.name
        );
        // Fallback: derive columns from sample row keys
        const finalCols = cols.length > 0 ? cols : Object.keys(meta.sample_rows[0]);
        setDataPreview({
          columns: finalCols,
          rows: meta.sample_rows,
          filename: meta.filename,
        });
        setDataPreviewOpen(true); // auto-open the preview on restore
      }

    } catch (err) {
      console.warn("Could not restore dataset metadata:", err);
      showDatasetLostWarning();
    }
  };

  const showDatasetLostWarning = () => {
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== "loading-history"),
      {
        id: "session-lost",
        role: "system" as const,
        content:
          "⚠️ The dataset for this chat is no longer on the server (it may have been cleared after a restart). " +
          "Please **re-upload your CSV** to continue. Your conversation history is intact.",
        timestamp: new Date(),
      },
    ]);
  };

  // ── Fetch tool definitions ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const res = await fetch("/api/agent/tools");
        if (res.ok) {
          const data = await res.json();
          setToolDefs(data.tool_definitions || []);
        }
      } catch (e) {
        console.warn("Could not fetch tools:", e);
      }
    };
    fetchTools();
  }, []);

  // ── Message helpers ─────────────────────────────────────────────────────────
  const addMessage = (role: Message["role"], content: string) => {
    const safeContent = typeof content === "string" ? content : String(content ?? "");
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

  // ── DB helpers ──────────────────────────────────────────────────────────────
  const saveMessage = async (chatId: string, role: string, content: string) => {
    try {
      await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      });
    } catch (e) {
      console.warn("Failed to save message:", e);
    }
  };

  const ensureChat = async (): Promise<string> => {
    if (currentChatId) return currentChatId;
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      const data = await res.json();
      const id = data.chat?.id;
      if (id) {
        internalChatIdRef.current = id;
        setCurrentChatId(id);
        onChatCreated?.(id);
        return id;
      }
    } catch (e) {
      console.warn("Failed to create chat:", e);
    }
    return "";
  };

  // ── LLM call with tool loop ─────────────────────────────────────────────────
  const callLLM = async (userMessage: string): Promise<string> => {
    let systemPrompt = `You are DSAgent, an expert AI data scientist and data visualization expert. You can analyze charts, plots, and images. If the user uploads an image, describe the visualization and extract insights. You help with data analysis, machine learning, statistics, Python/pandas, and data visualization. Be concise, accurate, and actionable.`;

    if (currentSessionId && datasetMeta) {
      systemPrompt += `\n\nThe user has uploaded a dataset (session_id: ${currentSessionId}). Here is the metadata:\n${datasetMeta}\n\nYou have access to tools that can analyze this data directly. ALWAYS use your tools to create visualizations, run analyses, and answer questions — do NOT give code snippets. When generating plots, always pass session_id="${currentSessionId}" as an argument.`;
    }

    // Add user message to conversation history
    conversationRef.current.push({
      role: "user",
      content: userMessage
    });

    const recentHistory = conversationRef.current.slice(-16);
    const shouldIncludeTools = currentSessionId && toolDefs.length > 0;

    const payload: any = {
      messages: [
        { role: "system", content: systemPrompt },
        ...recentHistory
      ],
      images: uploadedImage ? [uploadedImage] : undefined
    };
    if (uploadedImage) {
      payload.tools = undefined;
    }

    // Send image separately to backend


    if (shouldIncludeTools) {
      payload.tools = toolDefs;
    }


    let finalContent = "";

    for (let iteration = 0; iteration < 4; iteration++) {
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
        console.log("BYTEZ RESPONSE:", data);
      } catch {
        throw new Error(`Failed to parse LLM response: ${responseText.slice(0, 200)}`);
      }

      // Handle Responses API structure for tools
      const output = data?.output || [];

      const toolCalls = output
        .filter((item: any) => item.type === "tool_call" || item.type === "function_call")
        .map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          function: {
            name: item.name,
            arguments: typeof item.arguments === "string"
              ? item.arguments
              : JSON.stringify(item.arguments || {})
          }
        }));

      if (toolCalls && toolCalls.length > 0) {
        // ... (the existing toolCalls execution block will be left alone inside the body)
        conversationRef.current.push({
          role: "assistant",
          content: "",
          tool_calls: toolCalls,
        } as any);

        await Promise.all(toolCalls.map(async (tc: any) => {
          const toolName = tc.function?.name;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            toolArgs = {};
          }

          if (currentSessionId && !toolArgs.session_id) {
            toolArgs.session_id = currentSessionId;
          }

          setToolStatus(`⚙️ Running ${toolName}...`);

          try {
            const toolRes = await fetch("/api/agent/tools", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool_name: toolName, arguments: toolArgs }),
            });
            const toolResult = await toolRes.json();

            // FIX: tools return image_base64, not chart_base64
            const chartBase64 =
              toolResult?.output?.image_base64 ||
              toolResult?.output?.chart_base64 ||
              toolResult?.image_base64 ||
              toolResult?.chart_base64;

            if (chartBase64) {
              const imgSrc = chartBase64.startsWith("data:") ? chartBase64 : `data:image/png;base64,${chartBase64}`;
              removeLoading();
              const msgContent =
                `📊 **${toolName.replace(/_/g, " ")}:**\n\n![chart](${imgSrc})`;

              addMessage("agent", msgContent);

              if (currentChatId) {
                saveMessage(currentChatId, "agent", msgContent);
              }
              addLoadingMessage();
            }

            // Strip image data before adding to conversation context (saves tokens)
            const cleanResult = JSON.parse(JSON.stringify(toolResult));
            if (cleanResult?.output?.image_base64) delete cleanResult.output.image_base64;
            if (cleanResult?.output?.chart_base64) delete cleanResult.output.chart_base64;
            if (cleanResult?.image_base64) delete cleanResult.image_base64;
            if (cleanResult?.chart_base64) delete cleanResult.chart_base64;

            conversationRef.current.push({
              role: "assistant",
              content: JSON.stringify({
                tool: tc.function.name,
                result: cleanResult
              }).slice(0, 3000),
            });
          } catch (toolErr: any) {
            conversationRef.current.push({
              role: "assistant",
              content: JSON.stringify({
                tool: tc.function.name,
                error: toolErr.message
              }),
            });
          }
        }));

        setToolStatus(null);
        payload.messages = [
          { role: "system", content: systemPrompt },
          ...conversationRef.current.slice(-16),
        ];
        continue;
      }

      // Handle Responses API structure for text
      for (const item of output) {
        if (!item?.content) continue;

        for (const block of item.content) {
          if (block.type === "output_text") {
            finalContent += block.text || "";
          }
        }
      }

      if (finalContent) {
        conversationRef.current.push({ role: "assistant", content: finalContent });
      }
      break;
    }

    setToolStatus(null);

    if (!finalContent) {
      finalContent = "⚠️ The model returned no text response.";
    }

    return finalContent;
  };

      // ── File upload ─────────────────────────────────────────────────────────────
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
          conversationRef.current = [];

          // Link session to chat in DB immediately so reloads work
          const chatId = await ensureChat();
          if (chatId) {
            await fetch(`/api/chats/${chatId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: result.session_id }),
            }).catch(() => { });
          }

          const metaSummary = [
            `Filename: ${meta.filename}`,
            `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
            `Size: ${meta.memory_usage_mb} MB`,
            `Numeric columns: ${meta.numeric_columns?.join(", ") || "none"}`,
            `Categorical columns: ${meta.categorical_columns?.join(", ") || "none"}`,
          ].join("\n");

          setDatasetMeta(metaSummary);

          // Set preview data — columns from metadata, rows from sample_rows
          if (meta.sample_rows?.length > 0) {
            const cols: string[] =
              meta.columns?.map((c: any) => (typeof c === "string" ? c : c.name)) ||
              Object.keys(meta.sample_rows[0]);
            setDataPreview({ columns: cols, rows: meta.sample_rows, filename: meta.filename });
            setDataPreviewOpen(true);
          }

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

      // ── Send message ────────────────────────────────────────────────────────────
      const handleSend = async () => {
        const question = input.trim();
        if (!question || isAnalyzing) return;

        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        addMessage("user", question);
        addLoadingMessage();
        setIsAnalyzing(true);

        const chatId = await ensureChat();
        if (chatId) {
          saveMessage(chatId, "user", question);
          if (messages.filter(m => m.role === "user").length === 0) {
            const title = question.length > 60 ? question.slice(0, 57) + "..." : question;
            fetch(`/api/chats/${chatId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            }).catch(() => { });
          }
        }

        try {
          const answer = await callLLM(question);
          removeLoading();
          addMessage("agent", answer);
          if (chatId) saveMessage(chatId, "agent", answer);
          setUploadedImage(null);
        } catch (err: any) {
          removeLoading();
          addMessage("system", `❌ ${err?.message || "Unknown error occurred"}`);
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

      // ── Render markdown-lite + base64 images ───────────────────────────────────
      const renderContent = (text: string) => {
        if (!text || typeof text !== "string") return <span style={{ color: C.textMute }}>—</span>;

        return text.split("\n").map((line, i) => {
          const mdImage = line.match(/!\[.*?\]\((data:image\/[^)]+)\)/);

          if (mdImage) {
            const imgSrc = mdImage[1];
            return (
              <div key={i} style={{ margin: "12px 0" }}>
                <img src={imgSrc} style={{ maxWidth: "100%", borderRadius: 8 }} />
                <button
                  onClick={() => {
                    const w = window.open();
                    if (w) {
                      w.document.write(`<img src="${imgSrc}" style="width:100%">`);
                      w.document.title = "Chart";
                    }
                  }}
                  style={{
                    fontSize: 10,
                    padding: "4px 8px",
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer"
                  }}
                >
                  View Full Size
                </button>
              </div>
            );
          }
          const b64Match = line.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);

          if (b64Match) {
            const imgSrc = b64Match[1];
            return (
              <div key={i} style={{
                margin: "12px 0", borderRadius: 10, overflow: "hidden",
                border: `1px solid ${C.border}`, background: "#1A1A1A",
                position: "relative", minHeight: 160,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <img
                  src={imgSrc}
                  alt="Generated Chart"
                  loading="lazy"
                  style={{ maxWidth: "100%", maxHeight: 500, height: "auto", display: "block" }}
                  onLoad={(e) => {
                    (e.target as any).parentElement.style.background = "transparent";
                    (e.target as any).parentElement.style.minHeight = "auto";
                  }}
                  onError={(e) => {
                    (e.target as any).style.display = "none";
                    (e.target as any).parentElement.innerHTML = `<div style="padding:20px;color:${C.red};font-size:11px">⚠️ Image failed to load</div>`;
                  }}
                />
                <div style={{ position: "absolute", bottom: 8, right: 8 }}>
                  <a href={imgSrc} target="_blank" rel="noreferrer" style={{
                    fontSize: 10, padding: "4px 8px", background: "rgba(0,0,0,0.6)",
                    color: "#fff", borderRadius: 4, textDecoration: "none",
                    backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.1)",
                  }}>View Full Size</a>
                </div>
              </div>
            );
          }

          const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const sizes: Record<number, number> = { 1: 16, 2: 14, 3: 12.5 };
            return (
              <div key={i} style={{ fontSize: sizes[level] || 12.5, fontWeight: 700, color: C.text, marginTop: 8, marginBottom: 4, fontFamily: C.head }}>
                {headingMatch[2]}
              </div>
            );
          }

          const listMatch = line.match(/^(\s*)[•\-\*]\s+(.+)/);
          if (listMatch) {
            const indent = Math.min(Math.floor(listMatch[1].length / 2), 3) * 14;
            const html = listMatch[2]
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/`(.*?)`/g, `<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:${C.mono};font-size:11px">$1</code>`);
            return (
              <div key={i} style={{ display: "flex", gap: 6, paddingLeft: indent, alignItems: "flex-start" }}>
                <span style={{ color: C.cyan, flexShrink: 0, marginTop: 2, fontSize: 8 }}>●</span>
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          }

          if (/^---+$/.test(line.trim())) {
            return <hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "8px 0" }} />;
          }

          const html = line
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/`(.*?)`/g, `<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:${C.mono};font-size:11px">$1</code>`);
          return (
            <div key={i} style={{ minHeight: line === "" ? "0.6em" : undefined }} dangerouslySetInnerHTML={{ __html: html }} />
          );
        });
      };

      // ── Render single message ───────────────────────────────────────────────────
      const renderMessage = (msg: Message) => {
        const isUser = msg.role === "user";
        const isSystem = msg.role === "system";

        if (msg.isLoading) {
          return (
            <div key={msg.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: `linear-gradient(135deg, ${C.cyan}22, ${C.violet}22)`,
                border: `1px solid ${C.cyan}33`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
              }}>🤖</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                {toolStatus && (
                  <div style={{ fontSize: 11, color: C.cyan, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 5 }}>
                    ⚙️ {toolStatus}
                  </div>
                )}
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
            style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}
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
              maxWidth: "80%", padding: "10px 14px",
              borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: isUser ? `linear-gradient(135deg, ${C.cyan}18, ${C.violet}18)` : isSystem ? `${C.red}10` : C.card,
              border: `1px solid ${isUser ? C.cyan + "33" : isSystem ? C.red + "33" : C.border}`,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", marginBottom: 6,
                color: isUser ? C.cyan : isSystem ? C.red : C.violet, fontFamily: C.mono,
              }}>
                {isUser ? "You" : isSystem ? "System" : "DSAgent"}
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.75, fontFamily: C.sans, wordBreak: "break-word" }}>
                {renderContent(msg.content)}
              </div>
              <div style={{ fontSize: 9, color: C.textMute, marginTop: 6, fontFamily: C.mono, textAlign: isUser ? "right" : "left" }}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </motion.div>
        );
      };

      // ── Main render ─────────────────────────────────────────────────────────────
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
          {/* ── Header ── */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Dataset preview toggle button — only shown when a dataset is loaded */}
              {dataPreview && (
                <button
                  onClick={() => setDataPreviewOpen((o) => !o)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                    background: dataPreviewOpen ? `${C.cyan}28` : `${C.cyan}10`,
                    color: C.cyan, border: `1px solid ${C.cyan}${dataPreviewOpen ? "55" : "33"}`,
                    cursor: "pointer", fontFamily: C.sans, transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  📋 {dataPreview.filename ? dataPreview.filename.replace(".csv", "") : "Data Preview"}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{dataPreviewOpen ? "▲" : "▼"}</span>
                </button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {/* CSV upload */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    background: `${C.cyan}18`,
                    color: C.cyan,
                    border: `1px solid ${C.cyan}33`,
                    cursor: isAnalyzing ? "not-allowed" : "pointer",
                    fontFamily: C.sans,
                    opacity: isAnalyzing ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  + Upload CSV
                </button>

              </div>
            </div>
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

          {/* ── Dataset Preview Panel (collapsible, ABOVE messages) ── */}
          <AnimatePresence>
            {dataPreview && dataPreviewOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  background: C.card,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <div style={{
                  padding: "8px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: C.head }}>
                    📋 Data Preview
                    <span style={{ color: C.textMute, fontWeight: 400, marginLeft: 6 }}>
                      ({dataPreview.rows.length} sample rows · {dataPreview.columns.length} columns)
                    </span>
                  </span>
                  <button
                    onClick={() => setDataPreviewOpen(false)}
                    style={{ fontSize: 10, color: C.textMute, background: "none", border: "none", cursor: "pointer", fontFamily: C.mono }}
                  >
                    ✕ Close
                  </button>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 200 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: C.mono }}>
                    <thead>
                      <tr>
                        {dataPreview.columns.map((col) => (
                          <th key={col} style={{
                            padding: "6px 10px", textAlign: "left", color: C.cyan,
                            fontWeight: 600, borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap", position: "sticky", top: 0, background: C.card,
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataPreview.rows.map((row, ri) => (
                        <tr key={ri} style={{ background: ri % 2 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                          {dataPreview.columns.map((col) => (
                            <td key={col} style={{
                              padding: "5px 10px", color: C.textSub,
                              borderBottom: `1px solid ${C.border}`,
                              whiteSpace: "nowrap", maxWidth: 180,
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {row[col] != null ? String(row[col]) : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Drag overlay ── */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                  position: "absolute", inset: 0, zIndex: 10,
                  background: `${C.cyan}10`, border: `2px dashed ${C.cyan}`,
                  borderRadius: 12, display: "flex", alignItems: "center",
                  justifyContent: "center", pointerEvents: "none",
                }}
              >
                <div style={{ fontFamily: C.head, fontSize: 16, color: C.cyan, fontWeight: 600 }}>
                  Drop CSV to upload
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Messages ── */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px",
            display: "flex", flexDirection: "column", gap: 14,
            scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
          }}>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick prompts — only at start ── */}
          {messages.length <= 2 && (
            <div style={{ padding: "0 16px 10px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
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

          {/* ── Input ── */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: "#111111", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.input, borderRadius: 10,
              border: `1px solid ${isAnalyzing ? C.cyan + "44" : C.border}`,
              padding: "8px 12px", transition: "border-color 0.2s",
            }}>

              {/* IMAGE UPLOAD BUTTON */}
              <input
                type="file"
                accept="image/*"
                id="imageUpload"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  const reader = new FileReader();

                  reader.onload = () => {
                    setUploadedImage(reader.result as string);
                    addMessage("user", `![image](${reader.result})`);
                  };

                  reader.readAsDataURL(file);
                }}
              />

              <button
                onClick={() => document.getElementById("imageUpload")?.click()}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "6px",
                  cursor: "pointer",
                  color: C.textSub
                }}
              >
                📎
              </button>

              {uploadedImage && (
                <img
                  src={uploadedImage}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    objectFit: "cover"
                  }}
                />
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={isAnalyzing ? "Thinking…" : currentSessionId ? "Ask anything about your data…" : "Ask me anything about data science…"}
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
                disabled={isAnalyzing || (!input.trim() && !uploadedImage)}
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: (!isAnalyzing && (input.trim() || uploadedImage)) ? `linear-gradient(135deg, ${C.cyan}, #0099CC)` : C.border,
                  border: "none", cursor: (isAnalyzing || (!input.trim() && !uploadedImage)) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                }}
              >
                {isAnalyzing ? (
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `2px solid ${C.textSub}`, borderTopColor: C.cyan,
                    animation: "spin 0.8s linear infinite",
                  }} />
                ) : (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                    stroke={(input.trim() || uploadedImage) ? "#030712" : C.textMute}
                    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22,2 15,22 11,13 2,9" />
                  </svg>
                )}
              </button>
            </div>
            <div style={{ fontSize: 10, color: C.textMute, marginTop: 6, fontFamily: C.mono, textAlign: "center" }}>
              {isAnalyzing ? "Calling GPT-4o via Bytez API…" : "Enter to send · Shift+Enter for newline · Drag & drop CSV to upload"}
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