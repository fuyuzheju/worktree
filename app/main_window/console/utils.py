def path_parser(path: str, tree: "WorkTree", path_separator: str = '/') -> "Node":
    """
    parse the path and return the node
    :param path: the path to parse
    :param current: the current node, to which the path is relative, while needless for absolute path
    :return: the node; None when failed to find a node
    """
    if path == "":
        return tree.tree.current_node

    if not path.endswith(path_separator):
        path += path_separator

    if path.startswith(path_separator):
        # absolute path
        path = path[1:]
        current = tree.tree.root
    else:
        # relative path, starts at current node
        current = tree.tree.current_node
        
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

def path_completor(incomplete_path: str, tree: "WorkTree") -> tuple[str | None, list[str]]:
    idx = incomplete_path.rfind('/')
    prefix = incomplete_path[:idx+1]
    suffix = incomplete_path[idx+1:]
    parent_node = path_parser(prefix, tree)
    if parent_node is None:
        return None, []
    possible_completion_list = [prefix + child.name + '/'
            for child in parent_node.children if child.name.startswith(suffix)]
    mcp = max_common_prefix(possible_completion_list)
    return mcp, possible_completion_list

def max_common_prefix(strings: list[str]) -> str | None:
    """
    find the max common prefix of a list of strings, where the target is the prefix
    :param target: the target string
    :param strings: the list of strings
    :return: the max common prefix
    e.g.
        target: "ab"
        strings: ["abc", "abce", "abcd"]
        return: "abc"
    """
    if not strings:
        return None

    mcp = strings[0]
    for s in strings:
        i = 0
        while i < min(len(mcp), len(s)):
            if mcp[i] != s[i]:
                break
            i += 1
        mcp = mcp[:i]
    return mcp

