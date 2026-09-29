"""
Proves the DAA rule: the application never uses a built-in sort.
Scans the real source code, so it fails if anyone adds sorted(), .sort() or ORDER BY.
"""
import ast
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, 'backend')
FRONTEND = os.path.join(ROOT, 'frontend')


def python_sources():
    for name in os.listdir(BACKEND):
        if name.endswith('.py'):
            yield os.path.join(BACKEND, name)


def test_backend_has_no_builtin_sort_calls():
    offenders = []
    for path in python_sources():
        tree = ast.parse(open(path, encoding='utf-8').read())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else ''
                if name in ('sorted', 'sort', 'order_by', 'nlargest', 'nsmallest'):
                    offenders.append(f'{os.path.basename(path)}:{node.lineno} {name}()')
            if isinstance(node, ast.Constant) and isinstance(node.value, str) \
                    and re.search(r'\bORDER\s+BY\b', node.value) and not node.value.lstrip().startswith(('"', '\n')):
                # SQL strings only (docstrings explaining the rule are allowed)
                if 'SELECT' in node.value.upper():
                    offenders.append(f'{os.path.basename(path)}:{node.lineno} ORDER BY')
    assert offenders == []


def test_frontend_has_no_sort_call():
    source = open(os.path.join(FRONTEND, 'script.js'), encoding='utf-8').read()
    code = re.sub(r'//.*', '', source)
    assert re.search(r'\.sort\s*\(', code) is None
    assert 'toSorted' not in code
