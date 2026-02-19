import networkx as nx

def detect_cycles(G: nx.DiGraph):
    """
    Production-safe cycle detection for money muling rings.
    Detects directed cycles of length 3-5 only.

    Performance fixes:
    - Uses tuples instead of lists for path (avoids repeated list copying)
    - frozenset membership check is O(1)
    - Degree filter removes high-traffic hub nodes before DFS
    - Hard caps on start nodes and total cycles
    """

    rings = []
    visited_keys = set()

    MAX_CYCLES = 500
    MAX_CYCLE_DEGREE = 8
    MAX_START_NODES = 300

    if G.number_of_nodes() == 0:
        return []

    # Step 1: Filter candidate nodes — only low-degree nodes can be in muling cycles
    filtered_candidates = {
        n for n in G.nodes()
        if (
            G.in_degree(n) > 0
            and G.out_degree(n) > 0
            and G.in_degree(n) <= MAX_CYCLE_DEGREE
            and G.out_degree(n) <= MAX_CYCLE_DEGREE
        )
    }

    # Step 2: Deterministic slicing of start nodes
    candidates = sorted(filtered_candidates)[:MAX_START_NODES]
    candidate_set = set(candidates)  # O(1) lookup

    # Canonical rotation to dedupe directed cycles
    def canonical_key(path_tuple):
        lst = list(path_tuple)
        min_idx = lst.index(min(lst))
        rotated = lst[min_idx:] + lst[:min_idx]
        return tuple(rotated)

    # Step 3: Bounded DFS — using TUPLES for path (no list copying overhead)
    for start in candidates:
        if len(rings) >= MAX_CYCLES:
            break

        # Stack stores (current_node, path_as_tuple)
        stack = [(start, (start,))]

        while stack and len(rings) < MAX_CYCLES:
            node, path = stack.pop()

            for neighbor in G.successors(node):

                # Skip nodes outside filtered candidate set
                if neighbor not in candidate_set:
                    continue

                # Found a valid cycle back to start
                if neighbor == start and 3 <= len(path) <= 5:
                    key = canonical_key(path)
                    if key not in visited_keys:
                        visited_keys.add(key)
                        rings.append({
                            "members": list(path),
                            "pattern_type": f"cycle_length_{len(path)}",
                            "pattern_key": f"cycle_length_{len(path)}",
                        })
                    continue

                # Continue DFS: neighbor not in path, depth < 5
                # Using 'in' on a tuple is O(n) but n<=5 so it's effectively O(1)
                if neighbor not in path and len(path) < 5:
                    stack.append((neighbor, path + (neighbor,)))

    return rings