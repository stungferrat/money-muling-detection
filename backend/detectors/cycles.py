import networkx as nx


def detect_cycles(G: nx.DiGraph):
    """
    Detect circular fund routing — cycles of length 3 to 5.
    Example: A -> B -> C -> A
    Returns a list of ring dicts.
    """
    rings = []
    visited = set()

    try:
        for cycle in nx.simple_cycles(G):
            if 3 <= len(cycle) <= 5:
                key = frozenset(cycle)
                if key not in visited:
                    visited.add(key)
                    rings.append({
                        "members": list(cycle),
                        "pattern_type": f"cycle_length_{len(cycle)}",
                        "pattern_key": f"cycle_length_{len(cycle)}",
                    })
    except Exception:
        pass

    return rings