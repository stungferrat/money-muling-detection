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

    HIGH_VOLUME_THRESHOLD = 50
    total_degree = {node: G.in_degree(node) + G.out_degree(node) for node in G.nodes()}

    def is_high_volume(node):
        return total_degree[node] > HIGH_VOLUME_THRESHOLD

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
        # Skip high-volume merchants / payroll accounts
        if is_high_volume(node):
            continue

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
        # Exclude legit merchants: real mules rarely receive money back from their targets
        # Legit merchants have customers paying them back; mules have in_degree ~0
        if out_deg >= 10 and in_deg == 0:
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