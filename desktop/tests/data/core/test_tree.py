# from app.data.core.tree import Tree, Node, Status
# import hashlib

# data = {
#     'identity': 'abc',
#     'name': 'WorkRoot',
#     'status': 'Waiting',
#     'children': [{
#         'identity': 'bcd',
#         'name': '1',
#         'status': 'Completed',
#         'children': [],
#     }, {
#         'identity': 'cde',
#         'name': '2',
#         'status': 'Waiting',
#         'children': [],
#     }, {
#         'identity': 'def',
#         'name': '3',
#         'status': 'Waiting',
#         'children': [{
#             'identity': 'efg',
#             'name': '4',
#             'status': 'Completed',
#             'children': [],
#         }],
#     }],
# }

# def test_node_creation():
#     node = Node.from_dict(data)
#     assert node.identity == 'abc'
#     assert node.name == 'WorkRoot'
#     assert node.status == Status.WAITING
#     assert len(node.children) == 3
#     assert node.children[0].identity == 'bcd'
#     assert node.children[0].name == '1'
#     assert node.children[0].status == Status.COMPLETED
#     assert node.children[0].children == []
#     assert node.children[1].identity == 'cde'
#     assert node.children[1].name == '2'
#     assert node.children[1].status == Status.WAITING
#     assert node.children[1].children == []
#     assert node.children[2].identity == 'def'
#     assert node.children[2].name == '3'
#     assert node.children[2].status == Status.WAITING
#     assert len(node.children[2].children) == 1
#     assert node.children[2].children[0].identity == 'efg'
#     assert node.children[2].children[0].name == '4'
#     assert node.children[2].children[0].status == Status.COMPLETED
#     assert node.children[2].children[0].children == []

# def test_default_tree_creation():
#     tree = Tree()
#     assert tree.root.identity == hashlib.sha256(b"WorkRoot").hexdigest()
#     assert tree.root.name == "WorkRoot"
#     assert tree.root.status == Status.WAITING
#     assert len(tree.root.children) == 0