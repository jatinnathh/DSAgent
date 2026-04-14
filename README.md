<div align="center">

# DSAgent

**Your Autonomous Data Scientist — Upload a CSV, get cleaning, analysis, visualizations, and trained ML models automatically.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.prisma.io/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk)](https://clerk.com/)

</div>

<h3 align="center">Under work  view at <a href="https://jatin-dsagent.vercel.app/">jatin-dsagent.vercel.app</a></h3>
<p align="center">
  <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3c0b2pibW51cHk5cHhtZjlsYnJ4eDdxb2M3ZWE3bG00Z3U4ZjI0cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oKIPnAiaMCws8nOsE/giphy.gif" width="600"/>


</p>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Implemented Features](#implemented-features)
  - [AI Analyst Chat](#ai-analyst-chat)
  - [Pipeline Builder](#pipeline-builder)
  - [Landing Page](#landing-page)
  - [Dashboard](#dashboard)
- [Backend — Tools & ML](#backend--tools--ml)
  - [Data Cleaning Tools](#data-cleaning-tools)
  - [EDA Tools](#eda-tools)
  - [Visualization Tools](#visualization-tools)
  - [ML Modeling Tools](#ml-modeling-tools)
  - [Preprocessing & Feature Engineering](#preprocessing--feature-engineering)
  - [AI Agent (ReAct Pattern)](#ai-agent-react-pattern)
- [Tech Stack](#tech-stack)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)

---

## Overview

DSAgent is an **AI-powered data science platform** that automates the full ML workflow — from raw CSV upload to trained, compared models. It combines a **Next.js 16 frontend** with a **FastAPI + Python ML backend**, connected through an LLM-powered **ReAct agent** that reasons about your data and calls real tools (not hallucinated code).

**Key differentiators:**
- **Real tool execution** — The AI doesn't generate code snippets; it calls registered Python tools with actual pandas/sklearn operations.
- **ReAct loop** — Reasoning + Acting pattern: the agent thinks, acts, observes results, and iterates.
- **Dark-themed visualizations** — All charts are generated server-side with matplotlib in a consistent dark aesthetic.
- **Visual pipeline builder** — Drag-and-drop data science workflows with AI-suggested steps.
- **Full persistence** — Every chat, pipeline, and run is stored in PostgreSQL via Prisma.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 16)               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Landing  │  │  Dashboard   │  │   Auth (Clerk)    │  │
│  │ (3D/R3F) │  │  Overview    │  │   Sign In/Up      │  │
│  └──────────┘  ├──────────────┤  └───────────────────┘  │
│                │  Agent Chat  │                          │
│                │  Pipeline    │   API Routes:            │
│                │  Builder     │   /api/llm/run           │
│                └──────────────┘   /api/chats             │
│                                   /api/pipelines         │
│                                   /api/pipelines/suggest │
├─────────────────────────────────────────────────────────┤
│                 BACKEND (FastAPI / Python)               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Tool Registry (30+ registered tools)             │  │
│  │  ┌──────────┐ ┌─────┐ ┌──────┐ ┌──────────────┐  │  │
│  │  │ Cleaning │ │ EDA │ │ Viz  │ │   Modeling   │  │  │
│  │  └──────────┘ └─────┘ └──────┘ └──────────────┘  │  │
│  │  ┌───────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Preprocessing │  │  Agent (ReAct + LLM)    │  │  │
│  │  └───────────────┘  └──────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  DATABASE: PostgreSQL (Prisma ORM)                      │
│  Models: User, Chat, Message, Pipeline, PipelineRun     │
└─────────────────────────────────────────────────────────┘
```

---

## Implemented Features

### AI Analyst Chat

A fully functional conversational AI data analyst. Upload a CSV and have a back-and-forth conversation with DSAgent about your data.

**How it works:**
1. **Upload CSV** — Auto-extracts metadata (row/column counts, types, nulls, sample rows).
2. **Ask questions** — e.g. "What are the key correlations?" or "Train a model to predict price."
3. **Agent executes real tools** — Calls `correlation_analysis`, `create_histogram`, `auto_ml_pipeline`, etc.
4. **Results inline** — Charts rendered as base64 PNGs directly in the chat, alongside statistical summaries.

**Capabilities:**
- Dataset upload with drag-and-drop or file picker
- LLM-powered responses via Anthropic Claude (proxied through `/api/llm/run`)
- Tool calling — the LLM sees all 30+ registered tools and can invoke them
- Inline chart rendering — histograms, scatter plots, heatmaps displayed in chat
- Persistent chat history — all chats stored in PostgreSQL with per-user isolation (Clerk auth)
- Session resume — reload a chat and the dataset context is restored from disk
- Modified CSV download — download the dataset after cleaning/transform steps have been applied

---

### Pipeline Builder

A visual drag-and-drop interface for composing reusable data science workflows.

**How it works:**
1. **Upload a dataset** — Metadata extracted and displayed.
2. **Add steps** from the tool catalog, organized by category: Cleaning, EDA, Visualization, Modeling.
3. **AI suggests steps** — Click "AI Suggest" and the LLM analyzes your dataset metadata to recommend a pipeline.
4. **Configure each step** — Set parameters (column names, strategies, thresholds).
5. **Run the pipeline** — Executes all steps sequentially against the FastAPI backend.
6. **Save & re-run** — Pipelines are persisted to PostgreSQL; re-run on new datasets.

**Capabilities:**
- Category-coded steps — color-coded by type (Cleaning, EDA, Visualization, Modeling)
- AI-suggested pipelines — LLM reads dataset metadata and proposes an optimal sequence
- Sequential execution — runs each step via `/execute-tool`, displays pass/fail per step
- Run history — every pipeline run is recorded with per-step results and timing
- Edit existing pipelines — open, modify, re-save, re-run
- Delete pipelines — clean up with confirmation dialog
- Step result preview — see tool output and charts inline after each run

---

### Landing Page

A premium, immersive landing page built with **React Three Fiber** and **Framer Motion**.

**Visual elements:**
- **3D Data Robot** — A fully modeled robot character with animated visor, orbital rings, glowing core, mouse-tracking head movement, scroll-driven rotation, and dissolving fragment particles.
- **Particle field + Stars** — Deep-space ambient background.
- **Custom cursor** — Dual-ring cursor with hover expansion.
- **Holographic scanlines** — Subtle CRT-style overlay with film grain texture.

**Content sections:**
- Hero with animated headline, status pill, and floating glass cards
- Horizontal scroll pipeline explorer (5 steps: Upload, Clean, Analyse, Model, Deploy)
- Terminal demo with typewriter animation showing a real analysis flow
- Feature grid (6 cards: AI Analyst, Pipeline Builder, AutoML, Explainability, Session Memory, Dark Charts)
- Tech stack showcase grid
- CTA section with animated gradient glow

---

### Dashboard

A full-featured dashboard with sidebar navigation, real-time data, and 3D banner.

**Views:**
- **Overview** — Stats cards (total chats, pipelines, messages, pipeline runs), category donut chart, recent pipelines table, recent chats list.
- **AI Analyst** — Chat sidebar with conversation list + main chat panel (AgentChat component).
- **Pipelines** — Pipeline list with status badges, step counts, run counts, category breakdown; opens into Pipeline Builder.

**Design details:**
- Collapsible sidebar with section groups (Workspace, Intelligence, Deploy)
- 3D banner with wireframe icosahedron, orbital torus rings, and star particles
- Real-time data fetched from `/api/chats` and `/api/pipelines`
- Skeleton loading states during data fetch
- Dark theme with JetBrains Mono monospace throughout

---

## Backend — Tools & ML

The backend is a **FastAPI** application with a **modular tool registry** pattern. Every data operation is a registered tool that the LLM agent can invoke by name.

### Data Cleaning Tools

| Tool | Description |
|------|-------------|
| `detect_missing_values` | Scans all columns, reports null counts and percentages |
| `fill_missing_values` | Imputes nulls using mean, median, mode, forward fill, or drop strategies |
| `remove_duplicates` | Removes duplicate rows with configurable subset and keep strategy (`first` / `last`) |
| `detect_outliers` | Detects outliers via IQR or Z-score method with configurable thresholds |
| `remove_outliers` | Removes outlier rows using IQR or Z-score bounds |

### EDA Tools

| Tool | Description |
|------|-------------|
| `dataset_overview` | Comprehensive overview: shape, memory, column types, missing data summary, numeric/categorical stats |
| `column_statistics` | Per-column deep-dive: mean, median, std, quartiles, skewness, kurtosis (numeric) or value counts (categorical) |
| `correlation_analysis` | Pairwise correlations with Pearson, Spearman, or Kendall methods; reports strength and direction |
| `value_counts` | Top-N frequency counts for categorical columns with percentages |
| `data_quality_report` | Full quality assessment: missing data, duplicates, constant columns, high-cardinality detection |

### Visualization Tools

All charts are styled with a **dark theme** (`#0E0E0E` background, `#00D4FF` / `#8B5CF6` accents) and rendered as **base64 PNG** via matplotlib.

| Tool | Description |
|------|-------------|
| `create_histogram` | Distribution histogram with mean/std/N annotation overlay |
| `create_bar_chart` | Top-N value counts bar chart with count labels |
| `create_scatter_plot` | Scatter plot with optional color grouping; correlation coefficient displayed |
| `create_correlation_heatmap` | Lower-triangle heatmap using `imshow` (Windows-safe); annotated cells with adaptive text color |
| `create_box_plot` | Box plot with outlier highlighting; optional `group_by` for categorical splits |

### ML Modeling Tools

| Tool | Description |
|------|-------------|
| `auto_ml_pipeline` | Full AutoML — auto-detects classification vs regression, trains Random Forest, XGBoost, and Logistic/Linear Regression side-by-side, reports best model |
| `train_specific_model` | Train a single model type (`random_forest`, `xgboost`, `linear`, `logistic`) with custom parameters |
| `feature_importance` | Extract and plot feature importances from tree-based or linear models |
| `model_evaluation` | Detailed evaluation with confusion matrix (classification) or Actual vs Predicted plot (regression) |
| `model_comparison` | Side-by-side metric comparison chart across all trained models |
| `make_predictions` | Predict on new data using any trained model; includes prediction probabilities for classification |

**Classification metrics:** Accuracy, Precision, Recall, F1 Score, Confusion Matrix  
**Regression metrics:** R-squared, RMSE, MAE, MSE

**ML libraries used:**
- `scikit-learn` — Random Forest, Logistic/Linear Regression, StandardScaler, LabelEncoder, train\_test\_split, cross\_val\_score, GridSearchCV
- `xgboost` — XGBClassifier, XGBRegressor
- `lightgbm` — LGBMClassifier, LGBMRegressor
- `matplotlib` / `seaborn` — All visualizations

### Preprocessing & Feature Engineering

| Tool | Description |
|------|-------------|
| `standard_scaler` | Z-score standardization (mean=0, std=1) |
| `min_max_scaler` | Rescale to [0, 1] or custom range |
| `robust_scaler` | Median/IQR scaling (outlier-robust) |
| `log_transform` | `log1p` transform to reduce right skew; reports skewness before/after |
| `one_hot_encode` | `pd.get_dummies` encoding with optional `drop_first` |
| `label_encode` | `LabelEncoder` for ordinal / tree models |
| `pca_transform` | PCA dimensionality reduction with scree plot |
| `polynomial_features` | Polynomial and interaction terms (x-squared, x*y) |
| `drop_columns` | Remove columns to reduce noise or data leakage |
| `train_test_split` | Preview split statistics and class balance |
| `cross_validate_model` | k-fold cross-validation (supports RF, XGBoost, LightGBM, Logistic Regression, SVM) with per-fold bar chart |
| `hyperparameter_tune` | GridSearchCV with predefined parameter grids; returns best params and top-5 combinations |

### AI Agent (ReAct Pattern)

The core agent (`DSAgent`) implements a **ReAct (Reasoning + Acting)** loop:

```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌───────────┐
│  User   │ ──> │   LLM   │ ──> │   Tool    │ ──> │  Observe  │
│ Question│     │ Thinking │     │ Execution │     │  Result   │
└─────────┘     └────┬────┘     └───────────┘     └─────┬─────┘
                     │                                    │
                     └────────────── loop <───────────────┘
```

1. **System prompt** includes dataset metadata and the list of all available tools.
2. **LLM decides** which tool to call (via OpenAI-compatible function calling format).
3. **Tool registry** executes the actual Python function.
4. **Result fed back** to the LLM for the next reasoning step.
5. **Loop continues** up to `max_iterations` (default: 10) or until the LLM provides a final answer.

**Key design decisions:**
- Session management: DataFrames persisted both in-memory and on disk (`sessions/` directory).
- Base64 images stripped from tool results fed back to LLM to save token budget.
- Tool call IDs properly threaded for multi-tool conversations.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| Next.js 16 | React framework with App Router, API routes, server components |
| React 19 | UI library |
| TypeScript | Type safety across the entire frontend |
| React Three Fiber | 3D rendering for landing page robot and dashboard banner |
| Three.js | 3D engine |
| Framer Motion | Animations, scroll-linked transforms, AnimatePresence |
| Clerk | Authentication (sign-in, sign-up, user management, middleware) |
| Prisma | PostgreSQL ORM for chats, messages, pipelines, pipeline runs |
| Tailwind CSS 4 | Utility CSS |

### Backend

| Technology | Purpose |
|-----------|---------|
| FastAPI | REST API framework with automatic OpenAPI docs |
| Uvicorn | ASGI server |
| Pandas | DataFrame operations, CSV handling |
| NumPy | Numerical computations |
| scikit-learn | ML models, preprocessing, evaluation metrics, cross-validation, GridSearchCV |
| XGBoost | Gradient boosting (classification + regression) |
| LightGBM | Gradient boosting (classification + regression) |
| Matplotlib | Server-side chart generation (dark-themed) |
| Seaborn | Statistical visualizations (confusion matrix heatmaps) |
| httpx | Async HTTP client for LLM API calls |
| python-dotenv | Environment variable management |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| PostgreSQL | Primary database |
| Prisma ORM | Schema management, migrations, type-safe queries |
| Clerk | Auth provider with Next.js middleware integration |
| Vercel | Frontend deployment |
| Anthropic Claude | LLM backend (proxied via Next.js API route) |

---

## API Endpoints

### FastAPI Backend (`localhost:8000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check and tool count |
| `GET` | `/health` | Service health status |
| `GET` | `/tools` | List all registered tools with definitions |
| `POST` | `/upload` | Upload CSV, extract metadata, create session |
| `POST` | `/analyze` | Run full AI agent analysis on a session |
| `POST` | `/execute-tool` | Execute a specific tool by name with arguments |
| `GET` | `/session/{id}/overview` | Dataset overview for a session |
| `GET` | `/session/{id}/metadata` | Metadata for restoring chat context |
| `GET` | `/session/{id}/download` | Download current (modified) CSV |
| `GET` | `/session/{id}/quality` | Data quality report |
| `POST` | `/session/{id}/visualize` | Create visualization (histogram, bar, scatter, heatmap, box) |
| `POST` | `/session/{id}/model` | Train ML model on session data |

### Next.js API Routes (`localhost:3000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/llm/run` | Proxy to Anthropic Claude with tool definitions |
| `GET / POST` | `/api/chats` | List or create chats for authenticated user |
| `GET / PUT / DELETE` | `/api/chats/[chatId]` | Manage a specific chat |
| `GET / POST` | `/api/pipelines` | List or create pipelines |
| `GET / PUT / DELETE` | `/api/pipelines/[pipelineId]` | Manage a specific pipeline |
| `POST` | `/api/pipelines/[pipelineId]/run` | Execute a pipeline run |
| `GET` | `/api/pipelines/[pipelineId]/run` | Get run history |
| `POST` | `/api/pipelines/suggest` | AI-powered pipeline step suggestions |

---

## Database Schema

```prisma
model User {
  id        String     @id
  clerkId   String     @unique
  email     String     @unique
  chats     Chat[]
  pipelines Pipeline[]
}

model Chat {
  id        String    @id
  title     String
  userId    String
  sessionId String?        // Links to backend CSV session
  messages  Message[]
}

model Message {
  id      String @id
  chatId  String
  role    String              // "user" | "assistant" | "tool"
  content String
}

model Pipeline {
  id       String        @id
  userId   String
  name     String
  status   String             // "draft" | "running" | "completed" | "failed"
  steps    Json               // Array of {tool, args, category}
  runs     PipelineRun[]
}

model PipelineRun {
  id          String @id
  pipelineId  String
  status      String
  stepResults Json          // Array of {tool, success, output, executionMs}
}
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL database
- Clerk account (for authentication)
- Anthropic API key (for LLM)

### Installation

```bash
# Clone the repository
git clone https://github.com/jatinnathh/DSAgent.git
cd DSAgent

# Install frontend dependencies
npm install

# Set up Python backend
cd backend
python -m venv venv
venv\Scripts\activate         # Windows
pip install -r requirements.txt
cd ..

# Configure environment variables
# Create .env with:
#   DATABASE_URL=postgresql://...
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
#   CLERK_SECRET_KEY=...
#   ANTHROPIC_API_KEY=...

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Run both servers concurrently
npm run dev
# Starts:
#   Next.js frontend on localhost:3000
#   FastAPI backend on localhost:8000
```

---

## Project Structure

```
dsagent/
├── app/
│   ├── page.tsx                    # Landing page (3D robot, animations)
│   ├── layout.tsx                  # Root layout with Clerk provider
│   ├── globals.css                 # Global styles
│   ├── dashboard/
│   │   ├── page.tsx                # Dashboard server component
│   │   └── DashboardClient.tsx     # Dashboard client (overview, agent, pipelines)
│   ├── components/
│   │   ├── AgentChat.tsx           # Chat UI with upload, messages, tool results
│   │   ├── PipelineBuilder.tsx     # Visual pipeline builder with AI suggestions
│   │   ├── DatasetUpload.tsx       # CSV upload component
│   │   ├── AgentAnalysis.tsx       # Analysis display component
│   │   └── BackButton.tsx          # Navigation back button
│   ├── api/
│   │   ├── llm/run/route.ts       # LLM proxy to Anthropic
│   │   ├── chats/route.ts         # Chat CRUD
│   │   ├── chats/[chatId]/route.ts
│   │   ├── pipelines/route.ts     # Pipeline CRUD
│   │   ├── pipelines/[pipelineId]/route.ts
│   │   ├── pipelines/[pipelineId]/run/route.ts
│   │   └── pipelines/suggest/route.ts
│   ├── sign-in/                    # Clerk sign-in page
│   └── sign-up/                    # Clerk sign-up page
├── backend/
│   ├── main.py                     # FastAPI app and all endpoints
│   ├── core/
│   │   ├── agent.py                # DSAgent ReAct loop
│   │   ├── metadata.py             # CSV metadata extraction
│   │   └── schema.py               # Pydantic models
│   ├── tools/
│   │   ├── registry.py             # Central tool registry
│   │   ├── cleaning.py             # Data cleaning tools (5)
│   │   ├── eda.py                  # Exploratory data analysis tools (5)
│   │   ├── visualization.py        # Chart generation tools (5)
│   │   ├── modeling.py             # ML modeling tools (6)
│   │   ├── preprocessing.py        # Preprocessing and feature engineering (12)
│   │   └── agent_tools.py          # Agent orchestration tool
│   ├── sessions/                   # Persisted CSV sessions on disk
│   ├── models/                     # Saved ML model artifacts
│   ├── charts/                     # Generated chart images
│   └── requirements.txt            # Python dependencies
├── prisma/
│   └── schema.prisma               # Database schema
├── lib/
│   └── prisma.ts                   # Prisma client singleton
├── middleware.ts                    # Clerk auth middleware
├── package.json
└── tsconfig.json
```

---

## Roadmap

| Feature | Status |
|---------|--------|
| AI Analyst Chat | Implemented |
| Pipeline Builder | Implemented |
| Dashboard Overview | Implemented |
| Landing Page (3D) | Implemented |
| Authentication (Clerk) | Implemented |
| Datasets Manager | Planned |
| Models Registry | Planned |
| Explainability Dashboard | Planned |
| Reports Export (PDF) | Planned |
| API Endpoints (serve predictions) | Planned |
| Monitoring | Planned |

---



<p align="center">

  <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYThmc25sejdrcHR4dnZlbTcxd3A1enh0OTV6anM5bXNweWloNm11YyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/LMNsgeBFskg4sd7bWk/giphy.gif" width="600"/>

</p>