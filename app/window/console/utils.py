def path_parser(path: str, tree: "WorkTree") -> "Node":
    """
    parse the path and return the node
    :param path: the path to parse
    :param current: the current node, to which the path is relative, while needless for absolute path
    :return: the node; None when failed to find a node
    """
    # print(f"PARSING: {path} at current {current.name}")
    if path == "":
        return tree.current_node

    if not path.endswith('/'):
        path += '/'

    if path.startswith('/'):
        # absolute path
        path = path[1:]
        current = tree.root
    else:
        # relative path, starts at current node
        current = tree.current_node
        
    parts = path.split('/')
    for p in parts:
        if p == '':
            continue
        if p == '..':
            if current.parent is not None:
                current = current.parent
            else:
                return None
        elif p == '.':
            continue
        else:
            # search for node
            for child in current.children:
                if child.name == p:
                    current = child
                    break
            else:
                return None
    return current