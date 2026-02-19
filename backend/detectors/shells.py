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

    # For each source, find the LONGEST valid shell chain (avoid sub-chain duplicates)
    # We collect all valid chains then keep only maximal ones (not subsets of longer chains)
    all_chains = []

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
                        all_chains.append(new_path)

                # Continue exploring if next node will be a valid intermediate (is a shell)
                if len(new_path) < 6 and is_shell(neighbor):
                    stack.append((neighbor, new_path))

    # Keep only MAXIMAL chains — remove any chain that is a sub-path of a longer chain
    maximal_chains = []
    for chain in all_chains:
        chain_str = "->".join(chain)
        is_subchain = any(
            "->".join(other) != chain_str and chain_str in "->".join(other)
            for other in all_chains
        )
        if not is_subchain:
            key = frozenset(chain)
            if key not in visited:
                visited.add(key)
                maximal_chains.append(chain)

    for chain in maximal_chains:
        rings.append({
            "members": chain,
            "pattern_type": "layered_shell_network",
            "pattern_key": f"shell_chain_{len(chain) - 1}_hops",
            "chain": chain,
            "temporal": False,
        })

    return rings