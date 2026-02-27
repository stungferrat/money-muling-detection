import networkx as nx
import pandas as pd


def detect_shell_networks(G: nx.DiGraph, df: pd.DataFrame):
    """
    Shell network detection.
    Looks for chains: origin -> shell -> shell -> ... -> destination
    where intermediate accounts have very few total transactions (shells).

    Performance fixes vs original:
    - Path stored as tuple (no list copying on stack push)
    - Subchain deduplication uses a proper tuple-prefix set — O(1) lookup
      instead of O(n) string startswith scan per chain
    - Hard cap at 200 rings
    """
    visited = set()
    HIGH_VOLUME_THRESHOLD = 50
    MAX_RINGS = 200

    tx_count = {node: G.in_degree(node) + G.out_degree(node) for node in G.nodes()}

    def is_shell(account):
        return tx_count.get(account, 0) <= 3

    def is_high_volume(account):
        # OR logic: exclude if high volume in either direction (catches merchants)
        return (G.in_degree(account) + G.out_degree(account)) > HIGH_VOLUME_THRESHOLD

    # Only start from true origins: no incoming edges, not high volume
    source_candidates = [
        n for n in G.nodes()
        if G.in_degree(n) == 0 and not is_high_volume(n) and G.out_degree(n) > 0
    ]

    all_chains = []  # list of tuples

    for source in source_candidates:
        if len(all_chains) >= MAX_RINGS:
            break

        # Use tuples for path — avoids list copy on every stack push
        stack = [(source, (source,))]
        while stack:
            current, path = stack.pop()

            for neighbor in G.successors(current):
                if neighbor in path or is_high_volume(neighbor):
                    continue

                new_path = path + (neighbor,)

                if len(new_path) >= 4:
                    intermediates = new_path[1:-1]
                    if all(is_shell(acc) for acc in intermediates):
                        all_chains.append(new_path)

                if len(new_path) < 6 and is_shell(neighbor):
                    stack.append((neighbor, new_path))

    # ── Maximal-chain deduplication in O(total_nodes) ──────────────────────
    # Build a set of ALL prefixes that appear as strict subchains
    # A chain is a subchain if any longer chain starts with it
    all_chain_set = set(all_chains)

    # For each chain, build all strict prefixes and mark them as non-maximal
    non_maximal = set()
    for chain in all_chains:
        for prefix_len in range(4, len(chain)):          # prefixes of length 4..len-1
            prefix = chain[:prefix_len]
            if prefix in all_chain_set:
                non_maximal.add(prefix)

    rings = []
    for chain in all_chains:
        if chain in non_maximal:
            continue
        key = frozenset(chain)
        if key not in visited:
            visited.add(key)
            rings.append({
                "members": list(chain),
                "pattern_type": "layered_shell_network",
                "pattern_key": f"shell_chain_{len(chain) - 1}_hops",
                "chain": list(chain),
                "temporal": False,
            })

    return rings