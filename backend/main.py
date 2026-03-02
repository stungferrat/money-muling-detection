import logging
import os
import io
import time
import json
import random
import concurrent.futures
from collections import defaultdict
from typing import Dict, List

import pandas as pd
import networkx as nx
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from groq import Groq
from dotenv import load_dotenv

from detectors import detect_cycles, detect_smurfing, detect_shell_networks

# ─── Logging (no secrets in logs) ────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("rift")

load_dotenv()

# ─── Startup validation ───────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY not set — AI review will be skipped")
else:
    logger.info("GROQ_API_KEY loaded successfully")

GROQ_MODEL = "llama-3.3-70b-versatile"

# ─── Allowed origins ─────────────────────────────────────────────────────────
# Add your Vercel frontend URL here
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://money-muling-detection.vercel.app",
    os.getenv("FRONTEND_URL", ""),  # set this on Render too
]
ALLOWED_ORIGINS = [o for o in ALLOWED_ORIGINS if o]  # remove empty strings

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="RIFT 2026 — Money Muling Detection Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

# ─── Config ───────────────────────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   # 20MB server-side limit
MAX_ROWS            = 50_000             # prevent resource exhaustion
MAX_ACCOUNT_ID_LEN  = 100

# ─── Scoring tables ───────────────────────────────────────────────────────────
PATTERN_SCORES = {
    "cycle_length_3":        95,
    "cycle_length_4":        90,
    "cycle_length_5":        85,
    "fan_in":                70,
    "fan_in_temporal":       80,
    "fan_in_hub":            85,
    "fan_in_hub_temporal":   95,
    "fan_in_leaf":           70,
    "fan_in_leaf_temporal":  80,
    "fan_out":               70,
    "fan_out_temporal":      80,
    "fan_out_hub":           85,
    "fan_out_hub_temporal":  95,
    "fan_out_leaf":          70,
    "fan_out_leaf_temporal": 80,
    "layered_shell_network": 75,
}

RING_RISK_BASE = {
    "cycle_length_3":        95,
    "cycle_length_4":        92,
    "cycle_length_5":        90,
    "smurfing_fan_in":       85,
    "smurfing_fan_out":      85,
    "layered_shell_network": 75,
}


def compute_suspicion_score(patterns: List[str]) -> float:
    if not patterns:
        return 0.0
    base = max(PATTERN_SCORES.get(p, 50) for p in patterns)
    bonus = min((len(patterns) - 1) * 5, 10)
    return round(min(base + bonus, 100.0), 1)


def build_ring_id(index: int) -> str:
    return f"RING_{str(index + 1).zfill(3)}"


def compute_ring_risk(pattern_type: str, is_temporal: bool) -> float:
    base = RING_RISK_BASE.get(pattern_type, 70)
    if is_temporal:
        base = min(base + 5, 100)
    return round(float(base), 1)


def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()
    for row in df[["sender_id", "receiver_id"]].itertuples(index=False):
        s, r = row[0], row[1]
        if G.has_edge(s, r):
            G[s][r]["weight"] += 1
        else:
            G.add_edge(s, r, weight=1)
    return G


def validate_csv(df: pd.DataFrame) -> None:
    """Strict input validation — raises HTTPException on bad data."""

    # Row limit
    if len(df) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"CSV exceeds maximum row limit of {MAX_ROWS:,}")

    # Required columns
    required_cols = {"transaction_id", "sender_id", "receiver_id", "amount", "timestamp"}
    missing = required_cols - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {sorted(missing)}")

    # Amount must be numeric and positive
    if not pd.api.types.is_numeric_dtype(df["amount"]):
        raise HTTPException(status_code=400, detail="Column 'amount' must be numeric")
    if (df["amount"] <= 0).any():
        raise HTTPException(status_code=400, detail="Column 'amount' must contain positive values only")
    if df["amount"].isna().any():
        raise HTTPException(status_code=400, detail="Column 'amount' contains null values")

    # Timestamp must be parseable
    try:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS")

    # Account IDs must be strings of reasonable length
    for col in ["sender_id", "receiver_id"]:
        df[col] = df[col].astype(str).str.strip()
        if (df[col].str.len() > MAX_ACCOUNT_ID_LEN).any():
            raise HTTPException(status_code=400, detail=f"Account IDs in '{col}' exceed maximum length")
        if df[col].isna().any() or (df[col] == "").any():
            raise HTTPException(status_code=400, detail=f"Column '{col}' contains empty values")

    # No self-transfers
    self_transfers = (df["sender_id"] == df["receiver_id"]).sum()
    if self_transfers > len(df) * 0.5:
        raise HTTPException(status_code=400, detail="More than 50% of transactions are self-transfers — invalid data")


# ─── Groq AI review ───────────────────────────────────────────────────────────

def build_account_profile(acc: dict, G: nx.DiGraph, df: pd.DataFrame) -> dict:
    account_id = acc["account_id"]
    in_deg     = G.in_degree(account_id)
    out_deg    = G.out_degree(account_id)

    incoming = df[df["receiver_id"] == account_id].sort_values("timestamp")

    timing_cv = 0.0
    avg_gap_hrs = 0.0
    total_span_hrs = 0.0
    if len(incoming) > 1:
        gaps = incoming["timestamp"].diff().dropna().dt.total_seconds()
        avg_gap_hrs    = round(float(gaps.mean()) / 3600, 2)
        total_span_hrs = round(float((incoming["timestamp"].max() - incoming["timestamp"].min()).total_seconds()) / 3600, 2)
        timing_cv      = round(float(gaps.std() / gaps.mean()), 4) if gaps.mean() > 0 else 0.0

    amounts  = incoming["amount"].tolist()
    amt_mean = round(float(sum(amounts) / len(amounts)), 2) if amounts else 0
    amt_std  = round(float(pd.Series(amounts).std()), 2) if len(amounts) > 1 else 0

    one_time_senders = sum(
        1 for s in incoming["sender_id"]
        if len(df[df["sender_id"] == s]) == 1
    )

    return {
        "account_id":                   account_id,
        "detected_patterns":            acc["detected_patterns"],
        "suspicion_score":              acc["suspicion_score"],
        "in_degree":                    in_deg,
        "out_degree":                   out_deg,
        "avg_gap_between_incoming_hrs": avg_gap_hrs,
        "timing_regularity_cv":         timing_cv,
        "total_incoming_timespan_hrs":  total_span_hrs,
        "amount_mean":                  amt_mean,
        "amount_std":                   amt_std,
        "one_time_senders_pct":         round(one_time_senders / max(in_deg, 1) * 100, 1),
    }


def validate_groq_response(verdicts) -> bool:
    """Validate Groq JSON response has the expected schema."""
    if not isinstance(verdicts, list):
        return False
    for v in verdicts:
        if not isinstance(v, dict):
            return False
        if "account_id" not in v or "verdict" not in v:
            return False
        if v["verdict"] not in ("KEEP", "REMOVE", "REDUCE"):
            return False
    return True


async def groq_review(flagged: List[dict], G: nx.DiGraph, df: pd.DataFrame) -> List[dict]:
    """
    Second-stage AI filter using Groq (Llama 3.3 70B).
    Reviews only fan-in/fan-out hub accounts — cycles and leaves are skipped.
    Cascade-removes leaf accounts when their hub is identified as a merchant.
    """
    if not GROQ_API_KEY:
        logger.warning("[GROQ] No API key — skipping AI review")
        return flagged

    cycles    = [a for a in flagged if any("cycle" in p for p in a["detected_patterns"])]
    leaves    = [a for a in flagged if not any("cycle" in p for p in a["detected_patterns"]) and any("leaf" in p for p in a["detected_patterns"])]
    to_review = [a for a in flagged if not any("cycle" in p for p in a["detected_patterns"]) and not any("leaf" in p for p in a["detected_patterns"])]

    if not to_review:
        return flagged

    profiles = [build_account_profile(a, G, df) for a in to_review]

    prompt = """You are a financial crime analyst reviewing accounts flagged by an automated money muling detection system.

For each account below decide:
- KEEP   -> genuine money mule or high-risk account
- REMOVE -> false positive (merchant, utility, payroll, automated payment processor)
- REDUCE -> uncertain, keep but lower the risk score

CRITICAL RULES:
- Accounts with pattern fan_in_leaf_temporal or fan_out_leaf_temporal are PART OF A CONFIRMED SMURFING RING. Always verdict KEEP for these.
- Only consider REMOVE for hub accounts (fan_in_hub_temporal, fan_out_hub_temporal).
- When in doubt always KEEP. Missing a mule is worse than a false positive.

Merchant signals (only apply to hub accounts):
- timing_regularity_cv near 0.0 = perfectly regular automated payments = likely merchant
- amount_mean under 500 combined with regular timing = retail merchant
- amount_mean over 500 with irregular timing and 100% one-time senders = real smurfing hub

Respond with a JSON array only. Accounts to review:
""" + json.dumps(profiles, indent=2)

    try:
        client   = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw    = response.choices[0].message.content
        parsed = json.loads(raw)

        # Unwrap if Groq wraps in a dict key
        if isinstance(parsed, dict):
            verdicts = next(iter(parsed.values())) if len(parsed) == 1 else list(parsed.values())[0]
        else:
            verdicts = parsed

        # Validate schema before using
        if not validate_groq_response(verdicts):
            logger.error("[GROQ] Invalid response schema — keeping all flagged accounts")
            return flagged

        v_map = {v["account_id"]: v for v in verdicts}

    except Exception as e:
        logger.error(f"[GROQ] Review failed — keeping all flagged accounts")
        return flagged

    removed_hubs = set()
    reviewed     = []

    for acc in to_review:
        v = v_map.get(acc["account_id"])
        if not v or v["verdict"] == "KEEP":
            reviewed.append(acc)
        elif v["verdict"] == "REMOVE":
            logger.info(f"[GROQ] Removed  {acc['account_id']}: {v.get('reason', '')}")
            removed_hubs.add(acc["account_id"])
        elif v["verdict"] == "REDUCE":
            adj = v.get("score_adjustment", -20)
            if not isinstance(adj, (int, float)):
                adj = -20
            acc = dict(acc)
            acc["suspicion_score"] = max(round(acc["suspicion_score"] + adj, 1), 10)
            acc["ai_note"]         = str(v.get("reason", ""))[:200]  # cap length
            reviewed.append(acc)
            logger.info(f"[GROQ] Reduced  {acc['account_id']} by {adj}")
        else:
            reviewed.append(acc)

    # Cascade: if a hub was removed as merchant, drop all leaves in the same ring
    if removed_hubs:
        removed_ring_ids = {
            a["ring_id"]
            for a in flagged
            if a["account_id"] in removed_hubs
        }
        before   = len(reviewed) + len(leaves)
        reviewed = [a for a in reviewed if a["ring_id"] not in removed_ring_ids]
        leaves   = [a for a in leaves   if a["ring_id"] not in removed_ring_ids]
        cascaded = before - len(reviewed) - len(leaves)
        if cascaded:
            logger.info(f"[GROQ] Cascade removed {cascaded} leaf accounts from merchant rings")

    logger.info(f"[GROQ] Review done — kept {len(reviewed) + len(leaves)}/{len(flagged)} accounts")
    return cycles + leaves + reviewed


# ─── Main endpoint ────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(request: Request, file: UploadFile = File(...)):
    start = time.time()

    # ── Server-side file size check ───────────────────────────────────────
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 20MB.")

    # ── Parse CSV ─────────────────────────────────────────────────────────
    try:
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV file. Please check the format.")

    # ── Validate input ────────────────────────────────────────────────────
    validate_csv(df)

    df["sender_id"]   = df["sender_id"].astype(str)
    df["receiver_id"] = df["receiver_id"].astype(str)

    G              = build_graph(df)
    total_accounts = G.number_of_nodes()
    shell_skipped  = total_accounts > 2000
    cycle_timeout  = 15 if total_accounts <= 1000 else 10

    # ── Run detectors concurrently ────────────────────────────────────────
    def run_cycles():
        t = time.time(); result = detect_cycles(G)
        logger.info(f"[TIMING] cycles:   {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    def run_smurfs():
        t = time.time(); result = detect_smurfing(G, df)
        logger.info(f"[TIMING] smurfing: {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    def run_shells():
        t = time.time(); result = detect_shell_networks(G, df)
        logger.info(f"[TIMING] shells:   {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_cycles = executor.submit(run_cycles)
        f_smurfs = executor.submit(run_smurfs)
        f_shells = executor.submit(run_shells) if not shell_skipped else None

        try:    cycle_rings = f_cycles.result(timeout=cycle_timeout)
        except Exception as e:
            logger.warning(f"[WARN] cycles failed: {e}"); cycle_rings = []

        try:    smurf_rings = f_smurfs.result(timeout=15)
        except Exception as e:
            logger.warning(f"[WARN] smurfing failed: {e}"); smurf_rings = []

        try:    shell_rings = f_shells.result(timeout=10) if f_shells else []
        except Exception as e:
            logger.warning(f"[WARN] shells failed: {e}"); shell_rings = []

    # ── Deduplicate rings ─────────────────────────────────────────────────
    seen_keys     = set()
    deduped_rings = []
    for ring in cycle_rings + smurf_rings + shell_rings:
        key = frozenset(ring["members"])
        if key not in seen_keys:
            seen_keys.add(key); deduped_rings.append(ring)

    # ── Build account → patterns and ring membership ──────────────────────
    account_patterns: Dict[str, List[str]] = defaultdict(list)
    account_rings:    Dict[str, List[str]] = defaultdict(list)
    fraud_rings = []

    for idx, ring in enumerate(deduped_rings):
        ring_id     = build_ring_id(idx)
        pt          = ring["pattern_type"]
        pk          = ring.get("pattern_key", pt)
        is_temporal = ring.get("temporal", False)
        risk        = compute_ring_risk(pt, is_temporal)

        fraud_rings.append({
            "ring_id":         ring_id,
            "member_accounts": ring["members"],
            "pattern_type":    pt,
            "risk_score":      risk,
        })

        hub      = ring.get("hub")
        is_smurf = pt in ("smurfing_fan_in", "smurfing_fan_out")
        t_suffix = "_temporal" if is_temporal else ""
        base_pk  = "fan_in" if "fan_in" in pk else ("fan_out" if "fan_out" in pk else pk)

        for acc in ring["members"]:
            acc_pk = f"{base_pk}_{'hub' if acc == hub else 'leaf'}{t_suffix}" if is_smurf else pk
            if acc_pk not in account_patterns[acc]:
                account_patterns[acc].append(acc_pk)
            account_rings[acc].append(ring_id)

    suspicious_accounts = []
    for acc, patterns in account_patterns.items():
        score = compute_suspicion_score(patterns)
        suspicious_accounts.append({
            "account_id":        acc,
            "suspicion_score":   score,
            "detected_patterns": patterns,
            "ring_id":           account_rings[acc][0],
            "all_ring_ids":      account_rings[acc],
        })

    suspicious_accounts.sort(key=lambda x: x["suspicion_score"], reverse=True)

    # ── Groq second-stage review ──────────────────────────────────────────
    t_ai = time.time()
    suspicious_accounts = await groq_review(suspicious_accounts, G, df)
    suspicious_accounts.sort(key=lambda x: x["suspicion_score"], reverse=True)
    logger.info(f"[TIMING] groq:     {time.time()-t_ai:.2f}s")

    suspicious_set = {a["account_id"] for a in suspicious_accounts}

    # ── Graph visualization ───────────────────────────────────────────────
    # Two node sets are sent to the frontend:
    # - "focused" view: suspicious nodes + 1-hop neighbors (default)
    # - "full" view: all nodes capped at MAX_NODES (toggled by user)
    MAX_NODES = 500
    score_map = {a["account_id"]: a["suspicion_score"] for a in suspicious_accounts}

    # Focused: suspicious + 1-hop neighbors
    focused_keep = set(suspicious_set)
    for n in suspicious_set:
        for nb in list(G.predecessors(n)) + list(G.successors(n)):
            focused_keep.add(nb)
    if len(focused_keep) > MAX_NODES:
        neighbors = list(focused_keep - suspicious_set)
        random.shuffle(neighbors)
        focused_keep = suspicious_set | set(neighbors[:MAX_NODES - len(suspicious_set)])

    # Full: all nodes capped at MAX_NODES (suspicious first, then random sample)
    if G.number_of_nodes() <= MAX_NODES:
        full_keep = set(G.nodes())
    else:
        others = [n for n in G.nodes() if n not in suspicious_set]
        random.shuffle(others)
        full_keep = suspicious_set | set(others[:MAX_NODES - len(suspicious_set)])

    graph_capped = G.number_of_nodes() > MAX_NODES

    def build_graph_data(keep_set, edges_filter_suspicious=False):
        sub = G.subgraph(keep_set)
        nodes = [
            {"id": n, "suspicious": n in suspicious_set, "suspicion_score": score_map.get(n, 0)}
            for n in sub.nodes()
        ]
        if edges_filter_suspicious:
            edges = [
                {"source": u, "target": v}
                for u, v in sub.edges()
                if u in suspicious_set or v in suspicious_set
            ]
        else:
            edges = [{"source": u, "target": v} for u, v in sub.edges()]
        return nodes, edges

    focused_nodes, focused_edges = build_graph_data(focused_keep, edges_filter_suspicious=True)
    full_nodes,    full_edges    = build_graph_data(full_keep,    edges_filter_suspicious=False)

    graph_nodes = focused_nodes
    graph_edges = focused_edges

    elapsed = round(time.time() - start, 2)
    logger.info(f"[TIMING] total:    {elapsed}s")

    return JSONResponse({
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings":         fraud_rings,
        "summary": {
            "total_accounts_analyzed":     total_accounts,
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected":        len(fraud_rings),
            "processing_time_seconds":     elapsed,
            "shell_detection_skipped":     shell_skipped,
        },
        "graph_data": {
            "nodes":         focused_nodes,
            "edges":         focused_edges,
            "full_nodes":    full_nodes,
            "full_edges":    full_edges,
            "capped":        graph_capped,
            "cap_limit":     MAX_NODES,
        },
    })


@app.get("/health")
def health():
    return {"status": "ok"}