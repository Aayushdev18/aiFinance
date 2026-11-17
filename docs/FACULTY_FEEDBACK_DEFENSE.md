# Faculty Review & Architectural Defense: aiFinance Backend

**Project Name:** aiFinance – Intelligent Autonomous Financial Backend  
**Author:** Aayushdev18  
**Repository:** [https://github.com/Aayushdev18/aiFinance](https://github.com/Aayushdev18/aiFinance)  
**Version:** 1.0.0  
**Date:** November 2026  

---

## Executive Summary

Faculty feedback correctly identified that typical "AI expense trackers" are often superficial wrappers around LLMs that fail to address messy real-world data, perform unreliable arithmetic inside the language model, leak multi-tenant data, lack autonomous background capabilities, and lack rigorous evaluation metrics.

`aiFinance` is architected as an **auditable, deterministic, multi-tenant financial intelligence system**. The core design philosophy is:
> **The LLM is a reasoning, routing, and narrative engine, NEVER an arithmetic calculator or database engine.**

All calculations, trend analyses, aggregations, and anomaly metrics run natively in **PostgreSQL and deterministic TypeScript routines**, with strict tenant context injection and database-level Row Level Security (RLS).

Below is the exhaustive, point-by-point technical defense addressing each item raised by the faculty.

---

## 1. Data Source: Ingestion, Normalization, and Deduplication Pipeline

> **Faculty Query:** *"Will users enter transactions manually, upload bank statements, or will you parse UPI/SMS data? Handling real, messy data is where much of the backend work lies."*

### Architectural Solution
Financial data is fragmented across banks, SMS alerts, UPI apps, and cash. `aiFinance` implements a **hybrid, 3-tier ingestion pipeline** equipped with deterministic normalization, entity resolution, and cryptographic deduplication.

```
                              ┌───────────────────────────────────┐
                              │     Raw Ingestion Channels        │
                              └─────────────────┬─────────────────┘
                                                │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│  UPI / SMS Hook  │           │ Bank Statement   │           │ Manual / Quick   │
│  (Android / Web) │           │ (CSV / PDF)      │           │ Entry REST API   │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
         │                              │                              │
         ▼                              ▼                              ▼
┌──────────────────┐           ┌──────────────────┐                    │
│ Regex NER Engine │           │ Multi-Bank Column│                    │
│ (Fast Extractor) │           │ & Date Normalizer│                    │
└────────┬─────────┘           └────────┬─────────┘                    │
         │                              │                              │
         │ (If Confidence < 0.85)       │                              │
         ▼                              │                              │
┌──────────────────┐                    │                              │
│ Fallback LLM     │                    │                              │
│ Structured Parser│                    │                              │
└────────┬─────────┘                    │                              │
         │                              │                              │
         └──────────────────────┬───────┘                              │
                                │                                      │
                                ▼                                      ▼
                   ┌───────────────────────────────┐
                   │  Merchant Canonical Resolver  │
                   │  (Trie Match + Fuzzy Alias)   │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │  Cryptographic Deduplication  │
                   │  SHA-256(Fingerprint Window)  │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ PostgreSQL Master Transaction │
                   │ Store (RLS Isolated)          │
                   └───────────────────────────────┘
```

### 1.1 Ingestion Channels
1. **SMS & UPI Notification Parser (Real-time Streaming)**:
   - Captures automated transactional SMS formats from Indian and global banking institutions (e.g., HDFC, SBI, ICICI, Axis, Paytm, PhonePe, Google Pay, Chase, Citi).
   - **Deterministic Regex Named Entity Recognition (NER)** extracts:
     - **Amount:** `(?:Rs\.?|INR|USD|\$)\s*([\d,]+\.?\d*)`
     - **Transaction Type:** `(?:debited|credited|spent|sent to|received from|withdrawn)`
     - **Merchant/VPA:** `(?:to|at|VPA|info)\s+([A-Za-z0-9.\-_@]+)`
     - **Account Identifiers:** `(?:A\/c|account|card)\s*(?:no\.?)?\s*[*Xx]+(\d{4})`
     - **Transaction Reference/UTR:** `(?:UPI Ref|Ref no|UTR|txn ID)\s*([0-9a-zA-Z]+)`
     - **Available Balance:** `(?:Avl Bal|Balance|Bal)\s*(?:is)?\s*(?:Rs\.?|INR|\$)\s*([\d,]+\.?\d*)`
   - **Confidence Scoring & LLM Fallback**:
     - If the regex match confidence score is $\ge 0.85$, extraction is completed in sub-millisecond deterministic code.
     - If unstructured or multilingual/transliterated SMS fails regex parsing (confidence $< 0.85$), the payload is routed to a structured LLM parser bounded by a strict **Zod JSON Schema**.

2. **Bank Statement Batch Importer (CSV / PDF)**:
   - **CSV Pipeline:** Handles dialect discrepancies (delimiters, localized date formats like `DD/MM/YYYY` vs `MM/DD/YYYY`, inverted negative credit/debit representations, and thousand separators like `1,00,000.00`).
   - **PDF Pipeline:** Tabular parsing via stream coordinates extracting dates, descriptions, cheque/ref numbers, withdrawal, deposit, and balance.
   - **Audit Check:** Verifies statement mathematical balance continuity:
     $$\text{Balance}_{t} = \text{Balance}_{t-1} + \text{Deposit}_{t} - \text{Withdrawal}_{t}$$

3. **Manual Entry API**:
   - High-speed REST endpoint with auto-complete for split transactions, cash payments, and ad-hoc tagging.

### 1.2 Data Normalization & Entity Resolution
- **Merchant String Sanitization**: Raw bank feeds contain noisy merchant strings like `UPI/4123019481/SWIGGY-BANGALORE/swiggy@icici/PAYMENT`.
- A 2-tier resolution engine maps raw strings to clean merchant entities:
  - **Tier 1 (Trie-based Prefix & Keyword Lookup):** Matches against 1,000+ known merchant signatures (`swiggy*` $\to$ `Swiggy`, `uber*` $\to$ `Uber`, `amzn*` $\to$ `Amazon`).
  - **Tier 2 (Vector Embedding Similarity / Zero-Shot Classifier):** Matches novel merchant strings to standard Plaid/ISO category taxonomies.

### 1.3 Deduplication Engine (Cross-Channel Protection)
When a user receives an SMS transaction alert at 14:02 and later uploads a monthly bank statement CSV covering the same transaction at 20:00, standard systems double-count the expense. `aiFinance` implements **Cryptographic Fingerprinting**:
$$\text{Fingerprint} = \text{SHA-256}\Big(\text{userId} \parallel \text{TruncateDate}(\text{timestamp}, \text{day}) \parallel \text{Round}(\text{amount}, 2) \parallel \text{type} \parallel \text{NormalizedMerchant}\Big)$$
- A sliding $\pm 48$-hour window query matches potential pending-vs-cleared duplicates using the reference/UTR number or fuzzy fingerprint. If matched, the record is updated from `pending_sms` to `cleared_statement` rather than duplicated.

---

## 2. Agent Design: Deterministic Tools & Multi-Step Workflow

> **Faculty Query:** *"List the tools the agent can call and describe the multi-step workflow. Calculations like totals, trends and anomalies should be done in SQL or code, not by the LLM."*

### Architectural Solution
We strictly decouple **Reasoning (LLM)** from **Computation (SQL/TypeScript Engine)**. LLMs are notorious for arithmetic hallucinations and token-context truncation when summing hundreds of records.

### 2.1 The Deterministic Tool Catalog
The agent interacts with user finances exclusively through registered deterministic tools:

| Tool Name | Parameters | Execution Layer | Description |
| :--- | :--- | :--- | :--- |
| `get_financial_summary` | `startDate`, `endDate`, `groupBy`, `categoryId` | PostgreSQL Aggregate Query | Computes `SUM(amount)`, `AVG(amount)`, `COUNT(*)`, net cash flow, income vs expenses over specified temporal windows. |
| `get_spending_trends` | `metric`, `lookbackMonths`, `categoryId` | PostgreSQL Window Functions (`LAG()`, `OVER()`) | Computes Month-over-Month (MoM) growth rates, spending velocity, and category percentage shares. |
| `query_transactions` | `startDate`, `endDate`, `merchant`, `categoryId`, `minAmount`, `maxAmount`, `limit`, `offset` | Parameterized SQL Index Scan | Retrieves paginated transactions with bounded limits (max 50 per call) to prevent context exhaustion. |
| `detect_spending_anomalies` | `windowDays`, `sensitivitySigma`, `categoryId` | Node.js Math Engine + SQL | Computes Modified Z-score and Interquartile Range (IQR) on log-transformed spend to flag true statistical outliers. |
| `get_budget_status` | `month`, `year` | PostgreSQL Join Query | Evaluates budgeted allocations vs real-time consumed amounts, computing remaining runway and daily burn capacity. |
| `project_savings_trajectory` | `targetAmount`, `targetDate`, `monthlyContribution` | Financial Math Engine | Runs deterministic amortization and compound interest formulas to evaluate goal feasibility. |
| `update_transaction_category`| `transactionId`, `newCategoryId` | PostgreSQL Update | Re-categorizes a transaction and updates the user's personal classification alias map. |

### 2.2 Multi-Step Decision-Making Workflow (Plan $\to$ Execute $\to$ Synthesize $\to$ Guardrail)

```
User Query: "Can I afford to spend $800 on a vacation next month without falling behind on my savings goal?"
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ STEP 1: Query Deconstruction & Sub-Task Planning (LLM)          │
 │ - Deconstruct into required data points:                        │
 │   1. Current savings goal balance and monthly target            │
 │   2. 90-day average net cash flow (Income - Expenses)           │
 │   3. Fixed recurring commitments for next month                 │
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ STEP 2: Deterministic Tool Calling DAG                          │
 │ Call A: get_budget_status(month="current")                      │
 │ Call B: get_financial_summary(lookback=90 days, groupBy="month")│
 │ Call C: project_savings_trajectory(goalId="vacation", delta=800)│
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ STEP 3: Deterministic Execution Layer (TypeScript + PostgreSQL) │
 │ - System injects session userId                                 │
 │ - PostgreSQL runs optimized aggregations                        │
 │ - Math routines compute exact feasibility numbers               │
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ STEP 4: Context Synthesis & Advisory Narrative (LLM)            │
 │ - Receives verified JSON data payload                           │
 │ - Formulates actionable advice grounded in user's real numbers   │
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ STEP 5: Arithmetic Consistency Guardrail                        │
 │ - Regex verification checks every currency figure in LLM output │
 │   against the tool execution result JSON                        │
 │ - Zero hallucination tolerance                                  │
 └────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
                    Verified Agent Response to User
```

---

## 3. Security: Multi-Tenant Isolation & Zero-Trust Tool Execution

> **Faculty Query:** *"Make sure every agent tool can only access the current user’s data."*

### Architectural Solution
In typical insecure implementations, the LLM generates a tool parameter like `{"userId": "123", "action": "get_transactions"}`. This creates an immediate **Indirect Prompt Injection** and **Privilege Escalation** vulnerability: an attacker could trick the LLM via prompt injection into querying another user's financial records.

`aiFinance` implements a 3-layer security defense:

```
   ┌────────────────────────────────────────────────────────────┐
   │ 1. Express JWT Middleware: Authenticates Session           │
   │    Extracts verified User ID from signed JWT token         │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │ 2. Context Injection Pattern in Tool Dispatcher            │
   │    tool.execute(context: { userId: session.userId }, args) │
   │    * LLM Schema completely hides `userId` argument         │
   │    * Any hallucinated `userId` in tool arguments is ignored│
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │ 3. PostgreSQL Database Row Level Security (RLS)            │
   │    Connection checkout runs:                               │
   │    SET LOCAL app.current_user_id = '<authenticated_uuid>'; │
   │    DB policy: USING (user_id = current_setting(...)::uuid) │
   └────────────────────────────────────────────────────────────┘
```

### 3.1 Defense-in-Depth Implementation Details
1. **Context-Injected Tool Signatures**:
   The tool signature exposed to the LLM does **not** contain a `userId` parameter. The tool executor wraps the handler:
   ```typescript
   export interface ToolExecutionContext {
     userId: string; // Injected exclusively by Express auth middleware
     userTimezone: string;
   }
   // Tool runner signature:
   async execute(ctx: ToolExecutionContext, args: ToolInputParams): Promise<ToolResult>;
   ```
2. **PostgreSQL Row Level Security (RLS)**:
   Even if an application-level bug or SQL vulnerability occurred, the PostgreSQL engine itself prevents cross-tenant leaks:
   ```sql
   ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

   CREATE POLICY tenant_isolation_policy ON transactions
     FOR ALL
     USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
   ```
   Every transaction query executes inside a transaction where `SET LOCAL app.current_user_id` is set to the authenticated user ID.
3. **Indirect Prompt Injection Guardrails**:
   Transaction notes, merchant strings, and external statements are wrapped within strict data boundaries (`<untrusted_transaction_data>...</untrusted_transaction_data>`) with system instructions forbidding instruction overrides.
4. **Human-In-The-Loop (HITL) for State Mutations**:
   Read tools execute immediately. State-altering tools (e.g., bulk reclassification, budget limit updates, transaction deletions) return a `staged_action` response with an action token requiring explicit user confirmation before commitment.

---

## 4. Proactive Features: Background Jobs & Intelligent Alerts

> **Faculty Query:** *"Explain which background jobs will run and what alerts they trigger."*

### Architectural Solution
`aiFinance` operates as an active, proactive financial guardian rather than a passive request-response chatbot. Background workers (scheduled via `BullMQ` with Redis or lightweight persistent cron jobs) run continuous surveillance over spending patterns.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    aiFinance Proactive Worker Scheduler                      │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│  Midnight Spike  │           │ Mid-Month Budget │           │ Ghost Sub &      │
│  & Anomaly Audit │           │ Pacing Monitor   │           │ Price-Creep Audit│
│  (Daily 23:30)   │           │ (Every 3 Days)   │           │ (Weekly Sunday)  │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
         │                              │                              │
         ▼                              ▼                              ▼
  Threshold:                     Burn Rate Formula:              Autocorrelation:
  Amount > μ + 2.5σ              P = (Spend / Days) * Total      Interval = 28-31d
  or New High Merchant           P > Budget * 1.05?              Price_now > Price_prev
         │                              │                              │
         └──────────────────────┬───────┘                              │
                                │                                      │
                                ▼                                      ▼
                   ┌──────────────────────────────┐
                   │ Dispatch Proactive Alert     │
                   │ (In-App, SSE, Email Notification)│
                   └──────────────────────────────┘
```

### 4.1 Background Worker Matrix

| Job Name | Frequency | Deterministic Logic / Heuristic | Alert Trigger Criteria | Sample Notification |
| :--- | :--- | :--- | :--- | :--- |
| **Daily Anomaly Sweeper** | Daily at 23:30 | Evaluates last 24h transactions against user's 90-day category distribution using Modified Z-score. Checks for duplicate merchant charges within 15 minutes. | $Z > 2.5$ or identical amount charged twice at same merchant within 15m. | *"⚠️ Unusual Spend Alert: You spent $185 at 'TechMart' today. Your 90-day average for Electronics is $42. Was this you?"* |
| **Budget Pacing Monitor** | Every 3 days at 08:00 | Calculates projected month-end burn rate: $\text{Projected} = \left(\frac{\text{CurrentSpend}}{\text{DayNumber}}\right) \times \text{DaysInMonth}$. | $\text{Projected} > \text{Budget} \times 1.05$ before Day 20 of the month. | *"📉 Pacing Warning: At your current burn rate ($28/day), Dining Out will reach $840 by month-end, exceeding your $600 budget by 40%."* |
| **Subscription & Price-Creep Auditor** | Weekly (Sunday 03:00) | Identifies recurring merchant cadences ($T \approx 30 \pm 2\text{ days}$) using date clustering. Compares $Amount_{t}$ vs $Amount_{t-1}$. | Recurring charge detected with $>0\%$ price increase, or active charge with zero user activity. | *"🔔 Subscription Price Hike: Your Netflix subscription increased from $15.49 to $17.99 this month (+$2.50/mo)."* |
| **Weekly Financial Health Digest** | Weekly (Monday 07:00) | Summarizes weekly net savings, compares to weekly target, highlights single biggest spending reduction opportunity. | Generated every Monday for active users. | *"📊 Weekly Digest: You saved $140 this week (Goal: $150). Tip: Eliminating 2 food deliveries this weekend would hit your goal."* |

---

## 5. Evaluation: Rigorous Benchmarking & Accuracy Metrics

> **Faculty Query:** *"Describe how you’ll measure categorisation and anomaly-detection accuracy."*

### Architectural Solution
To graduate beyond subjective testing, `aiFinance` incorporates an **automated evaluation harness** (`src/eval/`) running on a curated golden dataset of real-world noisy transactions and synthetically injected anomalies.

### 5.1 Categorization Accuracy Evaluation
- **Benchmark Dataset**: 2,500 labeled transactions encompassing:
  - Clean bank descriptions (`"STARBUCKS STORE #10423 SEATTLE WA"`)
  - Noisy SMS snippets (`"Acct XX9812 debited Rs 450.00 at SWIGGY-BLR on 12-Nov-26"`)
  - Ambiguous / Multipurpose merchants (`"Amazon Retail"`, `"Walmart Supercenter"`, `"Target"`)
- **Evaluation Metrics**:
  - **Precision, Recall, and Macro-F1 Score** across 12 standard financial categories:
    $$\text{Precision}_c = \frac{TP_c}{TP_c + FP_c}, \quad \text{Recall}_c = \frac{TP_c}{TP_c + FN_c}, \quad F1_c = 2 \times \frac{\text{Precision}_c \times \text{Recall}_c}{\text{Precision}_c + \text{Recall}_c}$$
  - **Macro-F1 (Target $\ge 0.90$):** Prevents dominant categories (e.g., Groceries) from hiding poor performance on rare categories (e.g., Healthcare, Investments).
  - **Fallback / OOD Detection Rate:** Measures the system's ability to classify genuinely ambiguous transactions as `"Uncategorized / Review Required"` rather than making a high-confidence false positive error.
  - **Confusion Matrix Analysis:** Identifies systematic category leakage (e.g., Dining Out vs Groceries).

### 5.2 Anomaly Detection Evaluation
- **Dataset Construction**: Historical spending baseline with injected ground-truth anomalies:
  - *Type A (Statistical Spikes):* $3\times$ to $10\times$ normal category spend.
  - *Type B (Duplicate Charges):* Same merchant, same amount within 10 minutes.
  - *Type C (Silent Recurring Increases):* Recurring service price jumps ($+15\%$).
  - *Type D (Micro-charges / Card Testing):* Unusual tiny charges from unknown foreign entities.
- **Evaluation Metrics**:
  - **Receiver Operating Characteristic – Area Under Curve (ROC-AUC):** Target $\ge 0.92$.
  - **Precision@K (Target $\ge 0.88$ at $K=5$):** Evaluates whether the top $K$ alerts presented to a user are genuine anomalies, directly minimizing user notification fatigue.
  - **False Positive Rate (FPR):** Target $\le 2\%$. An alert system that constantly cries wolf is abandoned by users.

### 5.3 Agent Decision-Making & Tool-Calling Faithfulness
- **Evaluation Harness**: 150 diverse multi-turn financial reasoning test scenarios with verified SQL ground-truth answers.
- **Metrics**:
  - **Tool Selection Accuracy (Target $\ge 95\%$):** Did the agent select the correct tool and pass valid temporal/category arguments?
  - **Numeric Faithfulness Score (Target $100\%$):** Automated regex extraction verifies that every single currency and quantitative figure present in the agent's natural language response exists verbatim in the tool execution JSON result. Zero hallucinated figures permitted.

---

## Summary: Architectural Comparison

| Dimension | Typical Generic Expense Tracker | Naive LLM Wrapper | aiFinance Autonomous System |
| :--- | :--- | :--- | :--- |
| **Data Ingestion** | Manual form entry only | Copy-paste prompt | Multi-channel: SMS/UPI Regex NER + CSV/PDF Statement Parser + Deduplication Fingerprinting |
| **Calculation Engine** | Client-side JavaScript | LLM hallucinated arithmetic | Deterministic PostgreSQL aggregates + Window functions + TypeScript math |
| **Multi-Tenancy** | Simple `WHERE user_id = ?` | Vulnerable: LLM passes `userId` | Injected Execution Context + Database Row-Level Security (RLS) |
| **Proactivity** | None (Static dashboard) | None (Requires user prompt) | Scheduled Background Jobs (Daily Anomaly Sweeper, Budget Pacing, Ghost Subscriptions) |
| **Evaluation** | Unit tests on CRUD | Subjective "vibes" testing | Automated benchmark suite: Precision/Recall/F1, ROC-AUC, Tool Selection Accuracy, Numeric Faithfulness |
