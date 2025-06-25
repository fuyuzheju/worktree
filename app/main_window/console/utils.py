def path_parser(path: str, tree: "WorkTree", path_separator: str = '/') -> "Node":
    """
    parse the path and return the node
    :param path: the path to parse
    :param current: the current node, to which the path is relative, while needless for absolute path
    :return: the node; None when failed to find a node
    """
    if path == "":
        return tree.current_node

    if not path.endswith(path_separator):
        path += path_separator

    if path.startswith(path_separator):
        # absolute path
        path = path[1:]
        current = tree.root
    else:
        # relative path, starts at current node
        current = tree.current_node
        
    parts = path.split(path_separator)
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