# 🔍 RIFT 2026 — Money Muling Detection Engine

RIFT 2026 is a graph-based financial crime detection engine built for the **RIFT 2026 Hackathon**. It ingests a raw CSV of financial transactions and automatically exposes money muling rings, smurfing networks, and layered shell chains — surfacing the accounts behind them with a 0–100 suspicion score.

The engine detects everything in real-time:

- 🔄 Directed transaction cycles (muling rings)
- 🎯 Smurfing fan-in and fan-out clusters
- 🐚 Layered shell account chains
- 📊 Per-account suspicion scoring and ring membership

Built for the RIFT 2026 Hackathon and tested against synthetic transaction datasets modelling real financial crime typologies. **[Live demo →](https://money-muling-detection.vercel.app/)**

---

## 🌟 Why This Exists

As a team working on financial crime, we faced a problem: **How do you catch money mules when they look just like normal customers in isolation?**

Traditional rule-based systems check individual accounts against thresholds. They miss the network. A mule moving £4,999 looks clean. Ten mules funnelling into one aggregator within 48 hours — that's a pattern. But you only see it when you look at the graph.

**RIFT 2026 solves this.** One upload. Graph built automatically. Rings detected in seconds.

---

## ⚡ How It Works During an Analysis

### Pre-Analysis Setup

1. Prepare a CSV export of your transaction data
2. Ensure it contains the five required columns (transaction_id, sender_id, receiver_id, amount, timestamp)
3. Upload via the web UI or POST directly to `/analyze`

### During Analysis

1. The engine builds a directed weighted graph from your transactions
2. Three detectors run simultaneously — cycle detection, smurfing detection, and shell network detection
3. Results are deduplicated, scored, and returned as structured JSON
4. The UI renders an interactive node graph highlighting suspicious accounts

### What You Get Back

1. Every flagged account with its suspicion score and ring membership
2. Every detected fraud ring with its pattern type and risk score
3. A summary: total accounts scanned, flags raised, rings found, time taken
4. A graph-ready node and edge list for visualisation

---

## 🖥️ Real Output Example

The following is taken from a live run against a 501-account synthetic dataset.

**Analysis Results (sidebar)**

| Metric | Value |
|---|---|
| Accounts Analyzed | 501 |
| Suspicious Accounts Flagged | 43 |
| Fraud Rings Detected | 5 |
| Processing Time | 0.03s |
| Pattern Breakdown | Cycles ×3, Smurfing ×2 |

**Fraud Rings Detected**

| Ring ID | Pattern | Members | Risk Score | Accounts |
|---|---|---|---|---|
| RING_001 | Cycle Length 3 | 3 | 95 | ACC_00123, ACC_00456, ACC_00789 |
| RING_002 | Cycle Length 3 | 3 | 95 | ACC_00234, ACC_00567, ACC_00890 |
| RING_003 | Cycle Length 3 | 3 | 95 | ACC_00345, ACC_00678, ACC_00901 |
| RING_004 | Smurfing Fan In | 21 | 90 | ACC_02000–ACC_02020 + hub |
| RING_005 | Smurfing Fan In | 13 | 90 | ACC_01000–ACC_01012 + hub |

**Top Suspicious Accounts**

| Account ID | Risk Score | Primary Ring | Detected Pattern |
|---|---|---|---|
| ACC_00123 | 95 | RING_001 | Cycle ×3 |
| ACC_00456 | 95 | RING_001 | Cycle ×3 |
| ACC_00789 | 95 | RING_001 | Cycle ×3 |
| ACC_00234 | 95 | RING_002 | Cycle ×3 |
| ACC_00567 | 95 | RING_002 | Cycle ×3 |
| ACC_00890 | 95 | RING_002 | Cycle ×3 |
| ACC_00345 | 95 | RING_003 | Cycle ×3 |
| ACC_00678 | 95 | RING_003 | Cycle ×3 |
| ACC_00901 | 95 | RING_003 | Cycle ×3 |
| MERCHANT_01 | 95 | RING_004 | Fan-In Hub (72h) |
| SMURF_01 | 95 | RING_005 | Fan-In Hub (72h) |

The transaction graph rendered 500 nodes and 278 edges (capped from 501 nodes). Critical accounts (score 90+) appear in pink/red, high-risk accounts (75–89) in orange.

---

## 🛠️ Tech Stack

**Backend** — `FastAPI` for the REST API, `NetworkX` for directed graph construction and traversal, `Pandas` for transaction data processing, and `concurrent.futures` for parallel detector execution.

**Frontend** — `Next.js` (App Router) with `Space Mono` and `Syne` fonts. Custom CSS animations including scanlines, pulse rings, and fade-up transitions give the UI its distinctive aesthetic.

---

## 📁 Project Structure

```
rift-2026/
├── backend/
|   ├── main.py          # FastAPI app, /analyze endpoint, graph builder, scoring
|   |── detectors.py     # Re-exports all three detectors
│     ├── cycles.py        # Directed cycle detection (length 3–5)
│     ├── smurfing.py      # Fan-in / fan-out temporal cluster detection
│     ├── shells.py        # Layered shell network chain detection
│   
│
└── frontend/
    ├── app/
    │   ├── layout.js    # Root layout + metadata
    │   ├── page.js      # Main UI — file upload, results, graph
    │   └── globals.css  # Design system, animations, CSS variables
    └── Screenshots/
        ├── Intro Page.jpeg
        ├── Transaction Graph.png
        ├── Fraud Rings.png
        └── Suspension Score.png
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
pip install fastapi uvicorn pandas networkx python-multipart
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and upload a transaction CSV to begin.

---

## 📊 CSV Format

The file must contain exactly these five columns:

| Column | Type | Example |
|---|---|---|
| `transaction_id` | string | `TXN_001` |
| `sender_id` | string | `ACC_A` |
| `receiver_id` | string | `ACC_B` |
| `amount` | float | `4999.99` |
| `timestamp` | datetime | `2024-01-15 14:32:00` |

---

## 📡 API Reference

### `POST /analyze`
Upload a transaction CSV. Returns suspicious accounts, fraud rings, a summary, and graph data for visualisation.

```json
{
  "suspicious_accounts": [
    {
      "account_id": "ACC_00123",
      "suspicion_score": 95,
      "detected_patterns": ["cycle_length_3"],
      "ring_id": "RING_001",
      "all_ring_ids": ["RING_001"]
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "member_accounts": ["ACC_00123", "ACC_00456", "ACC_00789"],
      "pattern_type": "cycle_length_3",
      "risk_score": 95
    }
  ],
  "summary": {
    "total_accounts_analyzed": 501,
    "suspicious_accounts_flagged": 43,
    "fraud_rings_detected": 5,
    "processing_time_seconds": 0.03,
    "shell_detection_skipped": false
  },
  "graph_data": {
    "nodes": [...],
    "edges": [...],
    "capped": true,
    "cap_limit": 500
  }
}
```

### `GET /health`
Returns `{"status": "ok"}`.

---

## ⚙️ Suspicion Score Methodology

Every flagged account receives a **suspicion score from 0–100**. The score is not the output of a trained model — it is a deliberate heuristic built from the strength of each detected pattern. As seen in the live output above, accounts caught in tight 3-node muling cycles score 95, while smurfing hub accounts also reach 95 when their temporal cluster is confirmed within 72 hours.

The UI colour-codes accounts by score tier: **Critical (90+)** in red/pink, **High (75–89)** in orange, **Medium (60–74)** in yellow, **Low (40–59)** in green, **Clean** in grey.

### Pattern Base Scores

Each pattern type carries a fixed base score reflecting how reliable it is as a muling signal:

| Pattern | Base Score | Rationale |
|---|---|---|
| `cycle_length_3` | 95 | Tight 3-node cycle — nearly always intentional |
| `cycle_length_4` | 90 | Slightly larger cycle, still very high confidence |
| `cycle_length_5` | 85 | Longer cycles have more innocent explanations |
| `fan_in_hub_temporal` | 95 | Hub of a temporally confirmed smurfing cluster |
| `fan_out_hub_temporal` | 95 | Originator dispersing funds within 72 hours |
| `fan_in_temporal` / `fan_out_temporal` | 80 | Confirmed temporal cluster (non-hub member) |
| `fan_in_hub` / `fan_out_hub` | 85 | Hub pattern without temporal confirmation |
| `fan_in_leaf` / `fan_out_leaf` | 70 | Peripheral smurf participant |
| `layered_shell_network` | 75 | Intermediate shell account in a chain |

### Role-Aware Scoring

For smurfing rings, the **hub** (the convergence or dispersion point) and the **leaf** accounts (individual smurfs) receive different scores. In the live output, `MERCHANT_01` and `SMURF_01` both scored 95 as confirmed Fan-In Hubs with temporal clustering — the same top score as cycle members, but for a fundamentally different structural reason.

### Multi-Pattern Bonus

If an account appears in rings of more than one pattern type, it receives a bonus of up to +10:

```
bonus = min((number_of_distinct_patterns − 1) × 5, 10)
final_score = min(max_base_score + bonus, 100)
```

An account flagged for both a 3-cycle and a temporal smurfing fan-in would score `max(95, 80) + 5 = 100`. In the live run, no account crossed rings — each account appeared in exactly one ring — so all scores sat at their clean base values.

### Ring-Level Risk Scores

Each fraud ring carries its own risk score, separate from account-level suspicion scores. In the live output, all three Cycle Length 3 rings scored **95** and both Smurfing Fan In rings scored **90**, consistent with the table below. Rings with confirmed temporal clustering receive a +5 bonus:

| Ring Pattern | Base Risk | With Temporal |
|---|---|---|
| `cycle_length_3` | 95 | 100 |
| `cycle_length_4` | 92 | 97 |
| `cycle_length_5` | 90 | 95 |
| `smurfing_fan_in` / `smurfing_fan_out` | 85 | 90 |
| `layered_shell_network` | 75 | 80 |

---

## ⚠️ Known Limitations

We'd rather be transparent than leave you surprised. These are the constraints and edge cases we're aware of.

### Detection Coverage

**Cycle detection only covers lengths 3–5.** Longer muling chains (6+ hops) are not detected. This was a deliberate performance tradeoff — longer DFS paths grow exponentially and the signal-to-noise ratio drops. Real-world muling rings rarely exceed 5 nodes, but this is still a blind spot.

**Smurfing thresholds are hardcoded.** The 10-account and 72-hour thresholds are fixed. A sophisticated actor splitting across 8 accounts over 5 days would be missed. These values should ideally be configurable per institution type.

**Shell detection is skipped for graphs with more than 2,000 nodes.** At that scale the DFS becomes too slow for a synchronous API response. When this happens, the `shell_detection_skipped` flag in the summary response will be `true`.

**Shell chains require a true zero-in-degree origin.** If the original source of funds has any prior incoming transaction in the dataset — even an unrelated one — it won't be treated as an origin and its downstream chain won't be detected.

### Graph Construction

**Duplicate edges are aggregated by weight, not preserved.** Multiple transactions between the same two accounts collapse into a single weighted edge. This means the graph algorithms don't see transaction frequency — a pair transacting 50 times looks structurally identical to a pair transacting twice.

**The graph has no time-ordering.** It's built from all transactions regardless of timestamp. A cycle could theoretically be flagged even if its transactions flow in an impossible temporal order. Temporal ordering of graph edges is not currently enforced at the structural level.

### Scoring

**Scores are heuristic, not probabilistic.** The lookup table values were tuned during development — they are not calibrated probabilities. Use them as a triage signal, not ground truth.

**Transaction amount is not weighted.** A cycle moving £1 and a cycle moving £1,000,000 receive the same score. Amount-based signals — such as structuring just below reporting thresholds — are not currently incorporated.

**The multi-pattern bonus is capped at +10.** An account appearing in 20 different rings gets the same bonus as one appearing in 3. We erred on the side of keeping scores interpretable rather than letting them inflate arbitrarily.

### Deduplication

**Ring deduplication uses member frozensets.** Two rings with the same set of members but different structures (e.g. a cycle and a shell chain over the same accounts) will be treated as duplicates and only one is kept. This can cause under-reporting in dense subgraphs.

### Visualisation

**The graph is capped at 500 nodes.** In the live run, 501 nodes were present and the graph rendered 500 — one clean account was excluded at random. Edges between non-displayed nodes won't appear, which can make the graph look less connected than it really is.

### Concurrency

**Detectors share Python's GIL.** The three detectors run in parallel threads, but the GIL means CPU-bound DFS work doesn't truly parallelise. The speedup comes mainly from overlapping I/O and pandas operations. True parallelism would require multiprocessing.

---

## 🔒 Performance & Safety

- Graph size > 2,000 nodes: shell detection is automatically skipped
- Cycle detection is hard-capped at 500 rings and 300 start nodes
- Shell detection is hard-capped at 200 chains
- Detector timeouts: cycles 10–15s, smurfing and shells 10s each
- Graph visualisation is capped at 500 nodes, with suspicious accounts prioritised
- In the live test run: 501 accounts, 5 rings, 43 flags, **0.03 seconds**

---

## 👥 Team

Built at the **RIFT 2026** Hackathon.

---

## 📄 License

MIT
