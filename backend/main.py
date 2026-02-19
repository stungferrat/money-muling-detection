from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import networkx as nx
import io
import time
import random
from collections import defaultdict
from typing import Dict, List

from detectors import detect_cycles, detect_smurfing, detect_shell_networks

app = FastAPI(title="RIFT 2026 – Money Muling Detection Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PATTERN_SCORES = {
    "cycle_length_3": 90,
    "cycle_length_4": 85,
    "cycle_length_5": 80,
    "fan_in": 70,
    "fan_in_temporal": 85,
    "fan_out": 70,
    "fan_out_temporal": 85,
    "layered_shell_network": 75,
}

RING_RISK_BASE = {
    "cycle_length_3": 95,
    "cycle_length_4": 92,
    "cycle_length_5": 90,
    "smurfing_fan_in": 80,
    "smurfing_fan_out": 80,
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

    G = nx.MultiDiGraph()
    for _, row in df.iterrows():
        G.add_edge(
            row["sender_id"], row["receiver_id"],
            amount=float(row["amount"]),
            timestamp=row["timestamp"],
            tx_id=str(row["transaction_id"]),
        )

    G_simple = nx.DiGraph(G)
    total_accounts = len(G_simple.nodes())

    cycle_rings = detect_cycles(G_simple)
    smurf_rings = detect_smurfing(G_simple, df)
    shell_rings = detect_shell_networks(G_simple, df)

    all_rings_raw = cycle_rings + smurf_rings + shell_rings

    seen_keys = set()
    deduped_rings = []
    for ring in all_rings_raw:
        key = frozenset(ring["members"])
        if key not in seen_keys:
            seen_keys.add(key)
            deduped_rings.append(ring)

    account_patterns: Dict[str, List[str]] = defaultdict(list)
    account_ring_map: Dict[str, str] = {}
    fraud_rings = []

    for idx, ring in enumerate(deduped_rings):
        ring_id = build_ring_id(idx)
        pt = ring["pattern_type"]
        pk = ring.get("pattern_key", pt)
        is_temporal = ring.get("temporal", False)
        risk = compute_ring_risk(pt, is_temporal)

        fraud_rings.append({
            "ring_id": ring_id,
            "member_accounts": ring["members"],
            "pattern_type": pt,
            "risk_score": risk,
        })

        for acc in ring["members"]:
            if pk not in account_patterns[acc]:
                account_patterns[acc].append(pk)
            if acc not in account_ring_map:
                account_ring_map[acc] = ring_id

    suspicious_accounts = []
    for acc, patterns in account_patterns.items():
        score = compute_suspicion_score(patterns)
        suspicious_accounts.append({
            "account_id": acc,
            "suspicion_score": score,
            "detected_patterns": patterns,
            "ring_id": account_ring_map.get(acc, ""),
        })

    suspicious_accounts.sort(key=lambda x: x["suspicion_score"], reverse=True)
    suspicious_set = {a["account_id"] for a in suspicious_accounts}

    MAX_NODES = 500
    if len(G_simple.nodes()) > MAX_NODES:
        safe_nodes = list(suspicious_set)
        others = [n for n in G_simple.nodes() if n not in suspicious_set]
        random.shuffle(others)
        keep = set(safe_nodes + others[:MAX_NODES - len(safe_nodes)])
        sub = G_simple.subgraph(keep)
    else:
        sub = G_simple

    score_map = {a["account_id"]: a["suspicion_score"] for a in suspicious_accounts}

    graph_nodes = [{"id": n, "suspicious": n in suspicious_set, "suspicion_score": score_map.get(n, 0)} for n in sub.nodes()]
    graph_edges = [{"source": u, "target": v} for u, v in sub.edges()]

    elapsed = round(time.time() - start, 2)

    return JSONResponse({
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings": fraud_rings,
        "summary": {
            "total_accounts_analyzed": total_accounts,
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected": len(fraud_rings),
            "processing_time_seconds": elapsed,
        },
        "graph_data": {"nodes": graph_nodes, "edges": graph_edges},
    })


@app.get("/health")
def health():
    return {"status": "ok"}