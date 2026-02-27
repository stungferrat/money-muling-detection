import networkx as nx
import pandas as pd
from collections import defaultdict


def detect_smurfing(G: nx.DiGraph, df: pd.DataFrame):
    """
    Smurfing detection.
    - Fan-in:  10+ unique senders -> 1 receiver within 72 hours
    - Fan-out: 1 sender -> 10+ unique receivers within 72 hours (pure originator)

    Key fix: temporal window is now a HARD REQUIREMENT not just a bonus.
    Normal accounts may have 10+ connections spread over weeks/months —
    real smurfing has them concentrated within 72 hours.
    """
    rings = []
    visited = set()

    HIGH_VOLUME_THRESHOLD = 50
    MIN_FAN_IN  = 10
    MIN_FAN_OUT = 10
    WINDOW_HOURS = 72

    def is_high_volume(node):
        """
        Merchants/payroll: either direction is high volume.
        Uses OR (not AND) — a merchant that only receives payments has
        high in-degree but near-zero out-degree and should still be excluded.
        
        Key insight: Legitimate merchants have VERY LOW out-degree (~0-2 transactions)
        even when receiving from many sources. Real money mule hubs actively REDISTRIBUTE.
        """
        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)

        # High volume in either direction → likely a merchant or payroll
        if in_deg > HIGH_VOLUME_THRESHOLD or out_deg > HIGH_VOLUME_THRESHOLD:
            return True

        # Merchant filter: if a node receives from 10+ senders but sends almost nothing,
        # it's a merchant/payment receiver, not a mule hub.
        # Real mule hubs pump money out. Merchants rarely send (maybe refunds/chargebacks).
        if in_deg >= MIN_FAN_IN and out_deg <= 2:
            return True
        
        # More aggressive merchant detection: any node with in_deg >= 15 
        # but out_deg < in_deg / 15 is likely a merchant (receives vastly more than sends)
        if in_deg >= 15 and out_deg > 0:
            ratio = in_deg / out_deg
            if ratio >= 15:
                return True

        return False

    # ── Vectorized timestamp building ──────────────────────────────────────
    # Only process hub candidates to save memory
    hub_candidates = {
        n for n in G.nodes()
        if not is_high_volume(n) and (
            G.in_degree(n) >= MIN_FAN_IN or
            (G.out_degree(n) >= MIN_FAN_OUT and G.in_degree(n) == 0)
        )
    }

    def has_fan_in_cluster(account):
        """
        Returns True if 'account' received money from MIN_FAN_IN+ UNIQUE
        senders within any 72-hour window.
        This is the real smurfing signal — not just high degree.
        """
        incoming = df[df["receiver_id"] == account].copy()
        if incoming["sender_id"].nunique() < MIN_FAN_IN:
            return False
        incoming = incoming.sort_values("timestamp")
        timestamps = incoming["timestamp"].tolist()
        window = pd.Timedelta(hours=WINDOW_HOURS)
        for i in range(len(timestamps)):
            mask = (
                (incoming["timestamp"] >= timestamps[i]) &
                (incoming["timestamp"] <= timestamps[i] + window)
            )
            if incoming[mask]["sender_id"].nunique() >= MIN_FAN_IN:
                return True
        return False

    def has_fan_out_cluster(account):
        """
        Returns True if 'account' sent money to MIN_FAN_OUT+ UNIQUE
        receivers within any 72-hour window.
        """
        outgoing = df[df["sender_id"] == account].copy()
        if outgoing["receiver_id"].nunique() < MIN_FAN_OUT:
            return False
        outgoing = outgoing.sort_values("timestamp")
        timestamps = outgoing["timestamp"].tolist()
        window = pd.Timedelta(hours=WINDOW_HOURS)
        for i in range(len(timestamps)):
            mask = (
                (outgoing["timestamp"] >= timestamps[i]) &
                (outgoing["timestamp"] <= timestamps[i] + window)
            )
            if outgoing[mask]["receiver_id"].nunique() >= MIN_FAN_OUT:
                return True
        return False

    for node in hub_candidates:
        if is_high_volume(node):
            continue

        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)

        # Fan-in: multiple senders → one receiver
        if in_deg >= MIN_FAN_IN:
            # HARD REQUIREMENT: must have temporal cluster
            if not has_fan_in_cluster(node):
                continue
            predecessors = list(G.predecessors(node))
            members = predecessors + [node]
            key = frozenset(members)
            if key not in visited:
                visited.add(key)
                rings.append({
                    "members": members,
                    "hub": node,
                    "pattern_type": "smurfing_fan_in",
                    "pattern_key": "fan_in_temporal",
                    "temporal": True,
                })

        # Fan-out: one sender → many receivers (pure originator only)
        if out_deg >= MIN_FAN_OUT and in_deg == 0:
            # HARD REQUIREMENT: must have temporal cluster
            if not has_fan_out_cluster(node):
                continue
            successors = list(G.successors(node))
            members = [node] + successors
            key = frozenset(members)
            if key not in visited:
                visited.add(key)
                rings.append({
                    "members": members,
                    "hub": node,
                    "pattern_type": "smurfing_fan_out",
                    "pattern_key": "fan_out_temporal",
                    "temporal": True,
                })

    return rings