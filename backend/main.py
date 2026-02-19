from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import networkx as nx
import io
import time
import random
import concurrent.futures
from collections import defaultdict
from typing import Dict, List

from detectors import detect_cycles, detect_smurfing, detect_shell_networks

app = FastAPI(title="RIFT 2026 — Money Muling Detection Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """
    Build a weighted directed graph from the dataframe.
    Aggregates duplicate sender->receiver edges into a single edge with
    weight = transaction count. Smaller graph = faster algorithm runtime.
    """
    G = nx.DiGraph()
    # Use itertuples (much faster than iterrows) to add weighted edges
    for row in df[["sender_id", "receiver_id"]].itertuples(index=False):
        s, r = row[0], row[1]
        if G.has_edge(s, r):
            G[s][r]["weight"] += 1
        else:
            G.add_edge(s, r, weight=1)
    return G


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    start = time.time()

    content = await file.read()
    try:
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")

    required_cols = {"transaction_id", "sender_id", "receiver_id", "amount", "timestamp"}
    if not required_cols.issubset(df.columns):
        missing = required_cols - set(df.columns)
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")

    try:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid timestamp format. Expected YYYY-MM-DD HH:MM:SS")

    df["sender_id"]   = df["sender_id"].astype(str)
    df["receiver_id"] = df["receiver_id"].astype(str)

    # Build weighted graph (faster than raw edge list for large datasets)
    G = build_graph(df)
    total_accounts = G.number_of_nodes()

    # Decide which detectors to run based on graph size
    graph_size = total_accounts
    shell_skipped = graph_size > 2000
    cycle_timeout = 15 if graph_size <= 1000 else 10

    # ── Timing diagnostics (printed to server logs) ───────────────────────
    def run_cycles():
        t = time.time()
        result = detect_cycles(G)
        print(f"[TIMING] cycles: {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    def run_smurfs():
        t = time.time()
        result = detect_smurfing(G, df)
        print(f"[TIMING] smurfing: {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    def run_shells():
        t = time.time()
        result = detect_shell_networks(G, df)
        print(f"[TIMING] shells: {time.time()-t:.2f}s  ({len(result)} rings)")
        return result

    # ── Run detectors concurrently ────────────────────────────────────────
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_cycles = executor.submit(run_cycles)
        f_smurfs = executor.submit(run_smurfs)
        f_shells = executor.submit(run_shells) if not shell_skipped else None

        try:    cycle_rings = f_cycles.result(timeout=cycle_timeout)
        except Exception as e:
            print(f"[WARN] cycles timed out or failed: {e}")
            cycle_rings = []

        try:    smurf_rings = f_smurfs.result(timeout=10)
        except Exception as e:
            print(f"[WARN] smurfing timed out or failed: {e}")
            smurf_rings = []

        try:    shell_rings = f_shells.result(timeout=10) if f_shells else []
        except Exception as e:
            print(f"[WARN] shells timed out or failed: {e}")
            shell_rings = []

    # ── Deduplicate rings by member frozenset ─────────────────────────────
    all_rings_raw = cycle_rings + smurf_rings + shell_rings
    seen_keys = set()
    deduped_rings = []
    for ring in all_rings_raw:
        key = frozenset(ring["members"])
        if key not in seen_keys:
            seen_keys.add(key)
            deduped_rings.append(ring)

    # ── Build account → patterns and ring membership ──────────────────────
    account_patterns: Dict[str, List[str]] = defaultdict(list)
    account_rings:    Dict[str, List[str]] = defaultdict(list)
    fraud_rings = []

    for idx, ring in enumerate(deduped_rings):
        ring_id = build_ring_id(idx)
        pt = ring["pattern_type"]
        pk = ring.get("pattern_key", pt)
        is_temporal = ring.get("temporal", False)
        risk = compute_ring_risk(pt, is_temporal)

        fraud_rings.append({
            "ring_id":         ring_id,
            "member_accounts": ring["members"],
            "pattern_type":    pt,
            "risk_score":      risk,
        })

        hub = ring.get("hub")
        is_smurf = pt in ("smurfing_fan_in", "smurfing_fan_out")
        t_suffix = "_temporal" if is_temporal else ""
        base_pk = "fan_in" if "fan_in" in pk else ("fan_out" if "fan_out" in pk else pk)

        for acc in ring["members"]:
            if is_smurf:
                role = "hub" if acc == hub else "leaf"
                acc_pk = f"{base_pk}_{role}{t_suffix}"
            else:
                acc_pk = pk

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
    suspicious_set = {a["account_id"] for a in suspicious_accounts}

    # ── Graph visualization — cap at 500 nodes ────────────────────────────
    MAX_NODES = 500
    graph_capped = G.number_of_nodes() > MAX_NODES
    if graph_capped:
        safe_nodes = list(suspicious_set)
        others = [n for n in G.nodes() if n not in suspicious_set]
        random.shuffle(others)
        keep = set(safe_nodes + others[:MAX_NODES - len(safe_nodes)])
        sub = G.subgraph(keep)
    else:
        sub = G

    score_map = {a["account_id"]: a["suspicion_score"] for a in suspicious_accounts}
    graph_nodes = [
        {
            "id": n,
            "suspicious": n in suspicious_set,
            "suspicion_score": score_map.get(n, 0),
        }
        for n in sub.nodes()
    ]
    graph_edges = [{"source": u, "target": v} for u, v in sub.edges()]

    elapsed = round(time.time() - start, 2)
    print(f"[TIMING] total: {elapsed}s")

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
            "nodes":     graph_nodes,
            "edges":     graph_edges,
            "capped":    graph_capped,
            "cap_limit": MAX_NODES,
        },
    })


@app.get("/health")
def health():
    return {"status": "ok"}