import networkx as nx
import pandas as pd
from collections import defaultdict


def detect_smurfing(G: nx.DiGraph, df: pd.DataFrame):
    """
    Smurfing detection:
    - Fan-in:  10+ senders -> 1 receiver (aggregation)
    - Fan-out: 1 sender -> 10+ receivers (dispersion)
    - Temporal bonus: transactions within 72-hour window are more suspicious
    """
    rings = []
    visited = set()

    # BUG FIX 6: Build timestamp map per account from df (needed for temporal check)
    # but use G.degree for transaction counts to avoid double-counting
    account_timestamps = defaultdict(list)
    for _, row in df.iterrows():
        account_timestamps[row["sender_id"]].append(row["timestamp"])
        account_timestamps[row["receiver_id"]].append(row["timestamp"])

    def has_temporal_cluster(account, window_hours=72):
        timestamps = sorted(account_timestamps[account])
        for i in range(len(timestamps) - 1):
            diff = (timestamps[i + 1] - timestamps[i]).total_seconds() / 3600
            if diff <= window_hours:
                return True
        return False

    for node in G.nodes():
        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)

        # Fan-in: many senders -> one aggregator
        if in_deg >= 10:
            members = list(G.predecessors(node)) + [node]
            key = frozenset(members)
            if key not in visited:
                visited.add(key)
                temporal = has_temporal_cluster(node)
                rings.append({
                    "members": members,
                    "pattern_type": "smurfing_fan_in",
                    "pattern_key": "fan_in" + ("_temporal" if temporal else ""),
                    "temporal": temporal,
                    "hub": node,
                })

        # Fan-out: one disperser -> many receivers
        if out_deg >= 10:
            members = [node] + list(G.successors(node))
            key = frozenset(members)
            if key not in visited:
                visited.add(key)
                temporal = has_temporal_cluster(node)
                rings.append({
                    "members": members,
                    "pattern_type": "smurfing_fan_out",
                    "pattern_key": "fan_out" + ("_temporal" if temporal else ""),
                    "temporal": temporal,
                    "hub": node,
                })

    return rings