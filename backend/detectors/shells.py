import networkx as nx
import pandas as pd
from collections import defaultdict


def detect_shell_networks(G: nx.DiGraph, df: pd.DataFrame):
    """
    Layered shell network detection:
    - Chains of 3+ hops where INTERMEDIATE accounts have only 2-3 total transactions
    - Source and destination do NOT need to be shells
    - Skips high-volume merchants/payroll accounts (false positive protection)
    """
    rings = []
    visited = set()

    # BUG FIX 6: Use G.degree() for transaction count instead of double-counting
    # via df.iterrows(). Each edge in G = one transaction, degree = total involvement.
    tx_count = defaultdict(int)
    for node in G.nodes():
        tx_count[node] = G.in_degree(node) + G.out_degree(node)

    HIGH_VOLUME_THRESHOLD = 50

    def is_shell(account):
        # A shell: low total transaction involvement AND low degree
        return tx_count[account] <= 3 and G.in_degree(account) + G.out_degree(account) <= 4

    def is_high_volume(account):
        return tx_count[account] > HIGH_VOLUME_THRESHOLD

    for source in G.nodes():
        if is_high_volume(source):
            continue

        # DFS to find shell chains of length 3+ hops (4+ nodes)
        stack = [(source, [source])]
        while stack:
            current, path = stack.pop()

            for neighbor in G.successors(current):
                if neighbor in path:
                    continue
                if is_high_volume(neighbor):
                    continue

                new_path = path + [neighbor]

                # Chain of 3+ hops: check that ALL intermediates (not endpoints) are shells
                if len(new_path) >= 4:
                    intermediates = new_path[1:-1]
                    if all(is_shell(acc) for acc in intermediates):
                        key = frozenset(new_path)
                        if key not in visited:
                            visited.add(key)
                            rings.append({
                                "members": new_path,
                                "pattern_type": "layered_shell_network",
                                "pattern_key": f"shell_chain_{len(new_path) - 1}_hops",
                                "chain": new_path,
                                "temporal": False,
                            })

                # BUG FIX 4: Continue exploring as long as the NEIGHBOR (which will
                # become an intermediate in a longer chain) is a shell OR path is still
                # short enough. Do NOT require the current endpoint to be a shell.
                if len(new_path) < 6:
                    next_intermediates = new_path[1:]  # everything after source becomes intermediate
                    if all(is_shell(acc) for acc in next_intermediates):
                        stack.append((neighbor, new_path))

    return rings