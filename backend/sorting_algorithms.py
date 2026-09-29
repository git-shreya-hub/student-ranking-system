"""
Quadratic Sorting Algorithms (for comparison with Merge Sort)
=============================================================
Manual implementations of Bubble Sort, Selection Sort and Insertion Sort.
They sort student records in DESCENDING order of marks using the same
comparison rule as Merge Sort (comes_before), so all four algorithms
produce exactly the same order and can be compared fairly.

These are used ONLY by the performance comparison. Ranking always uses
Merge Sort (merge_sort.py).
"""

from merge_sort import comes_before, merge_sort, SortStats


def bubble_sort(students, stats=None):
    """
    BUBBLE SORT - O(n²) worst/average, O(n) best (already sorted, early exit)
    Repeatedly swap adjacent records that are out of order.
    """
    A = list(students)
    n = len(A)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            if stats is not None:
                stats.comparisons += 1
            if comes_before(A[j + 1], A[j]):
                A[j], A[j + 1] = A[j + 1], A[j]
                swapped = True
                if stats is not None:
                    stats.moves += 2
        if not swapped:
            break  # No swaps in a full pass: already sorted
    return A


def selection_sort(students, stats=None):
    """
    SELECTION SORT - O(n²) in every case.
    Select the highest remaining record and move it to the front.
    """
    A = list(students)
    n = len(A)
    for i in range(n - 1):
        best = i
        for j in range(i + 1, n):
            if stats is not None:
                stats.comparisons += 1
            if comes_before(A[j], A[best]):
                best = j
        if best != i:
            A[i], A[best] = A[best], A[i]
            if stats is not None:
                stats.moves += 2
    return A


def insertion_sort(students, stats=None):
    """
    INSERTION SORT - O(n²) worst/average, O(n) best.
    Insert each record into its place within the already sorted prefix.
    """
    A = list(students)
    for i in range(1, len(A)):
        current = A[i]
        j = i - 1
        while j >= 0:
            if stats is not None:
                stats.comparisons += 1
            if comes_before(current, A[j]):
                A[j + 1] = A[j]
                if stats is not None:
                    stats.moves += 1
                j -= 1
            else:
                break
        A[j + 1] = current
        if stats is not None:
            stats.moves += 1
    return A


# Registry used by the performance endpoint
ALGORITHMS = {
    'merge': {
        'name': 'Merge Sort',
        'function': merge_sort,
        'best': 'O(n log n)', 'average': 'O(n log n)', 'worst': 'O(n log n)', 'space': 'O(n)',
        'max_size': 100000
    },
    'insertion': {
        'name': 'Insertion Sort',
        'function': insertion_sort,
        'best': 'O(n)', 'average': 'O(n²)', 'worst': 'O(n²)', 'space': 'O(1)',
        'max_size': 5000
    },
    'selection': {
        'name': 'Selection Sort',
        'function': selection_sort,
        'best': 'O(n²)', 'average': 'O(n²)', 'worst': 'O(n²)', 'space': 'O(1)',
        'max_size': 5000
    },
    'bubble': {
        'name': 'Bubble Sort',
        'function': bubble_sort,
        'best': 'O(n)', 'average': 'O(n²)', 'worst': 'O(n²)', 'space': 'O(1)',
        'max_size': 5000
    }
}


def is_sorted_descending(students):
    """Check that marks never increase from one record to the next."""
    for i in range(len(students) - 1):
        if students[i]['marks'] < students[i + 1]['marks']:
            return False
    return True


__all__ = ['bubble_sort', 'selection_sort', 'insertion_sort', 'ALGORITHMS',
           'is_sorted_descending', 'SortStats']
