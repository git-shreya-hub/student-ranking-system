"""
Merge Sort Implementation for Student Records
=============================================
This module implements the Merge Sort algorithm manually.
It sorts student records in DESCENDING order based on marks.
No built-in sorting functions (sorted(), list.sort(), SQL ORDER BY) are used.

The implementation follows the pseudocode from the PBL presentation:

    MERGE_SORT(A, low, high)
        IF low < high
            mid <- (low + high) / 2
            MERGE_SORT(A, low, mid)
            MERGE_SORT(A, mid + 1, high)
            MERGE(A, low, mid, high)

The complete student record (roll, name, marks) moves together.

Tie handling: when two students have equal marks, the student with the
smaller roll number is placed first. This keeps the order deterministic
(PostgreSQL does not guarantee the order rows are returned in) while tied
students still receive the same competition rank.
"""


class SortStats:
    """Counts the basic operations performed by a sorting algorithm."""

    def __init__(self):
        self.comparisons = 0
        self.moves = 0          # element writes into the output array
        self.max_depth = 0      # deepest recursion level reached

    def to_dict(self):
        return {
            'comparisons': self.comparisons,
            'moves': self.moves,
            'max_depth': self.max_depth
        }


def comes_before(a, b):
    """
    Return True if record `a` should be placed before record `b`.

    Higher marks come first (descending order). For equal marks the smaller
    roll number comes first, which keeps the sort stable and deterministic.
    """
    if a['marks'] != b['marks']:
        return a['marks'] > b['marks']
    return a.get('roll', 0) <= b.get('roll', 0)


def merge_sort(students, stats=None, trace=None):
    """
    MERGE SORT - Divide and Conquer Algorithm
    =========================================

    DIVIDE:  Split the list into two halves recursively until
             each sublist has 0 or 1 element.
    CONQUER: Recursively sort each half.
    COMBINE: Merge the sorted halves back together by comparing marks.

    Args:
        students: List of student dictionaries with keys 'roll', 'name', 'marks'.
        stats:    Optional SortStats object that counts comparisons and moves.
        trace:    Optional list. When given, a description of every Divide,
                  Compare and Merge step is appended to it (used by the
                  step-by-step visualization).

    Returns:
        A NEW list of student dictionaries sorted in descending order by marks.
        The input list is not modified.
    """
    # Work on a copy so the caller's list (e.g. "before sorting") is untouched
    A = []
    for s in students:
        A.append(s)

    if len(A) > 1:
        _merge_sort(A, 0, len(A) - 1, stats, trace, depth=0)
    return A


def _merge_sort(A, low, high, stats, trace, depth):
    """MERGE_SORT(A, low, high) - sorts A[low..high] in place."""
    if stats is not None and depth > stats.max_depth:
        stats.max_depth = depth

    # Base case: a sublist of 0 or 1 elements is already sorted
    if low >= high:
        if trace is not None:
            trace.append({
                'type': 'base',
                'depth': depth,
                'low': low, 'high': high,
                'array': _snapshot(A),
                'message': f'Base case: [{_marks(A, low, high)}] has one element, so it is already sorted'
            })
        return

    # DIVIDE step: find the middle point
    mid = (low + high) // 2
    if trace is not None:
        trace.append({
            'type': 'divide',
            'depth': depth,
            'low': low, 'mid': mid, 'high': high,
            'array': _snapshot(A),
            'message': f'DIVIDE [{_marks(A, low, high)}] into [{_marks(A, low, mid)}] and [{_marks(A, mid + 1, high)}]'
        })

    # CONQUER step: recursively sort both halves
    _merge_sort(A, low, mid, stats, trace, depth + 1)
    _merge_sort(A, mid + 1, high, stats, trace, depth + 1)

    # COMBINE step: merge the two sorted halves
    merge(A, low, mid, high, stats, trace, depth)


def merge(A, low, mid, high, stats=None, trace=None, depth=0):
    """
    MERGE(A, low, mid, high)
    ========================
    A[low..mid] and A[mid+1..high] are each sorted in descending order.
    Compare the records from both halves, always select the higher mark,
    and place the complete student record into a temporary array.
    Finally copy the merged records back into A[low..high].
    """
    left = A[low:mid + 1]
    right = A[mid + 1:high + 1]
    temp = []
    i = 0  # Index for left half
    j = 0  # Index for right half

    if trace is not None:
        trace.append({
            'type': 'merge-start',
            'depth': depth,
            'low': low, 'mid': mid, 'high': high,
            'array': _snapshot(A),
            'message': f'COMBINE: merge [{_marks(A, low, mid)}] and [{_marks(A, mid + 1, high)}]'
        })

    # Compare elements from both halves and take the larger one first
    while i < len(left) and j < len(right):
        if stats is not None:
            stats.comparisons += 1
        take_left = comes_before(left[i], right[j])

        if trace is not None:
            a, b = left[i]['marks'], right[j]['marks']
            if a != b:
                reason = f'{_fmt(a)} > {_fmt(b)}' if take_left else f'{_fmt(a)} < {_fmt(b)}'
            else:
                reason = f'{_fmt(a)} = {_fmt(b)}, tie broken by roll number'
            trace.append({
                'type': 'compare',
                'depth': depth,
                'low': low, 'mid': mid, 'high': high,
                'compare': [low + i, mid + 1 + j],
                'array': _snapshot(A),
                'message': f'Compare {_fmt(a)} vs {_fmt(b)}: {reason}, take {_fmt(a if take_left else b)}'
            })

        if take_left:
            temp.append(left[i])
            i += 1
        else:
            temp.append(right[j])
            j += 1

    # Copy any remaining elements from the left half
    while i < len(left):
        temp.append(left[i])
        i += 1

    # Copy any remaining elements from the right half
    while j < len(right):
        temp.append(right[j])
        j += 1

    # Copy merged records back to A[low..high]
    for k in range(len(temp)):
        A[low + k] = temp[k]
        if stats is not None:
            stats.moves += 1

    if trace is not None:
        trace.append({
            'type': 'merged',
            'depth': depth,
            'low': low, 'high': high,
            'array': _snapshot(A),
            'message': f'Merged result: [{_marks(A, low, high)}]'
        })


def generate_ranks(sorted_students):
    """
    Generate competition ranks after sorting.
    ========================================
    Uses competition ranking (ties get the same rank, next rank skips).
    Example: 96→1, 91→2, 91→2, 85→4

    Args:
        sorted_students: List of student dictionaries sorted in
                         descending order by marks.

    Returns:
        List of student dictionaries with an added 'rank' key.
    """
    if not sorted_students:
        return []

    ranked_students = []
    current_rank = 1

    for idx, student in enumerate(sorted_students):
        if idx == 0:
            # First student always gets rank 1
            current_rank = 1
        else:
            # If marks are the same as previous student, same rank
            if student['marks'] == sorted_students[idx - 1]['marks']:
                current_rank = ranked_students[-1]['rank']
            else:
                # Otherwise rank = index + 1 (competition ranking)
                current_rank = idx + 1

        # Create a copy with the rank added
        ranked_student = dict(student)
        ranked_student['rank'] = current_rank
        ranked_students.append(ranked_student)

    return ranked_students


def count_tied_groups(ranked_students):
    """Return how many ranks are shared by two or more students."""
    groups = 0
    idx = 1
    while idx < len(ranked_students):
        if ranked_students[idx]['rank'] == ranked_students[idx - 1]['rank']:
            groups += 1
            # Skip the rest of this tied group
            while idx < len(ranked_students) and ranked_students[idx]['rank'] == ranked_students[idx - 1]['rank']:
                idx += 1
        else:
            idx += 1
    return groups


def get_statistics(students):
    """
    Calculate basic statistics from a list of students.

    Args:
        students: List of student dictionaries.

    Returns:
        Dictionary with total, highest, average, lowest marks.
    """
    if not students:
        return {
            'total': 0,
            'highest': 0,
            'average': 0,
            'lowest': 0
        }

    marks = [s['marks'] for s in students]
    total = len(students)
    highest = max(marks)
    lowest = min(marks)
    average = sum(marks) / total

    return {
        'total': total,
        'highest': highest,
        'average': round(average, 2),
        'lowest': lowest
    }


# ==================== VISUALIZATION HELPERS ====================

def _fmt(value):
    """Show 85.0 as 85 but keep 85.5."""
    return str(int(value)) if float(value).is_integer() else str(value)


def _marks(A, low, high):
    return ', '.join(_fmt(A[k]['marks']) for k in range(low, high + 1))


def _snapshot(A):
    return [{'marks': s['marks'], 'label': s.get('name', '')} for s in A]
