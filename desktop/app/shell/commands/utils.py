from datetime import datetime
from dateutil.relativedelta import relativedelta

from typing import Optional
from ...data.worktree import WorkTree
from ...data.worktree.tree import Node

def max_common_prefix(strings: list[str]) -> Optional[str]:
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

def time_parser(s):
    attribute_map = {
        "a": "year",
        "M": "month",
        "d": "day",
        "h": "hour",
        "m": "minute",
        "s": "second"
    }
    time_parts = {
        "a": None,
        "M": None,
        "d": None,
        "h": None,
        "m": None,
        "s": None,
    }

    numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    valid_chars = ['.', '-'] + numbers + list(time_parts.keys())

    last_part_index = -1
    for (i, char) in enumerate(s):
        if not char in valid_chars:
            raise ValueError(f"Invalid character \'{char}\'.")

        if char == '.':
            if i != last_part_index+1:
                raise ValueError(f"Incorrect format of value.")

        if char == '-':
            if i == 0 or s[i-1] != '.':
                raise ValueError(f"Unexpected position of character \'-\'")

        elif char in time_parts:
            if time_parts[char] is not None:
                raise ValueError(f"Identifier \'{char}\' appeared more than once.")
            time_parts[char] = s[last_part_index+1 : i]
            last_part_index = i

    if last_part_index != len(s) - 1:
        raise ValueError("Unexpected end of string.")
    for key in time_parts:
        if time_parts[key] is None:
            time_parts[key] = '.0'
        if time_parts[key] == '' or (not time_parts[key][-1] in numbers):
            raise ValueError(f"Identifier \'{key}\' can't be with an empty value.")

    # not recording relative times first
    # set relative parts to current time by default
    # parse them later
    absolute_dict = {}
    for key in time_parts:
        now = datetime.now()
        if time_parts[key][0] == '.':
            # relative time
            absolute_dict[key] = getattr(now, attribute_map[key])
        else:
            # absolute time
            absolute_dict[key] = int(time_parts[key])

    try:
        absolute = datetime(**{attribute_map[key]: absolute_dict[key] for key in time_parts})
    except ValueError:
        raise ValueError(f"Invalid absolute value.")

    relative_dict = {}
    for key in time_parts:
        if time_parts[key][0] == '.':
            relative_dict[key] = int(time_parts[key][1:])
        else:
            relative_dict[key] = 0

    relative = relativedelta(**{attribute_map[key] + 's': relative_dict[key] for key in time_parts})

    retval = absolute + relative
    for key in time_parts:
        if time_parts[key][0] == '.':
            # relative part, skip check
            continue

        # check conflict
        if getattr(retval, attribute_map[key]) != getattr(absolute, attribute_map[key]):
            raise ValueError(f"Found conflict between relative time promotion and absolute time designation at value of {attribute_map[key]}.")

    return retval