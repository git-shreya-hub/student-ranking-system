"""Unit tests for the manual Merge Sort, ranking, and the comparison algorithms."""
import math
import random

import pytest

from merge_sort import merge_sort, generate_ranks, count_tied_groups, get_statistics, SortStats
from sorting_algorithms import bubble_sort, selection_sort, insertion_sort, is_sorted_descending


def recs(*marks):
    return [{'roll': 100 + i, 'name': f'S{i}', 'marks': m} for i, m in enumerate(marks)]


def reference_order(records):
    # Test oracle only (never used by the application): highest marks first, then lowest roll
    return sorted(records, key=lambda s: (-s['marks'], s['roll']))


def test_empty_and_single():
    assert merge_sort([]) == []
    one = recs(50)
    assert merge_sort(one) == one


def test_presentation_example():
    # Slide 3/8: 72, 91, 85, 96, 78 -> 96, 91, 85, 78, 72
    data = [{'roll': 101, 'name': 'Rahul', 'marks': 72}, {'roll': 102, 'name': 'Priya', 'marks': 91},
            {'roll': 103, 'name': 'Aman', 'marks': 85}, {'roll': 104, 'name': 'Neha', 'marks': 96},
            {'roll': 105, 'name': 'Riya', 'marks': 78}]
    result = merge_sort(data)
    assert [s['name'] for s in result] == ['Neha', 'Priya', 'Aman', 'Riya', 'Rahul']
    assert [s['rank'] for s in generate_ranks(result)] == [1, 2, 3, 4, 5]


def test_input_not_modified():
    data = recs(10, 90, 50)
    copy = list(data)
    merge_sort(data)
    assert data == copy


def test_whole_record_moves_together():
    data = recs(10, 90, 50)
    result = merge_sort(data)
    assert result[0] == {'roll': 101, 'name': 'S1', 'marks': 90}


@pytest.mark.parametrize('n', [2, 3, 7, 16, 100, 1001])
def test_matches_reference_on_random_data(n):
    rng = random.Random(n)
    data = [{'roll': rng.randint(1, 10**6), 'name': 'x', 'marks': rng.randint(0, 100)} for _ in range(n)]
    assert merge_sort(data) == reference_order(data)


def test_ties_broken_by_roll_number():
    data = [{'roll': 5, 'name': 'E', 'marks': 80}, {'roll': 2, 'name': 'B', 'marks': 80},
            {'roll': 9, 'name': 'I', 'marks': 90}]
    assert [s['roll'] for s in merge_sort(data)] == [9, 2, 5]


def test_decimal_marks():
    assert [s['marks'] for s in merge_sort(recs(85.5, 85.25, 85.75))] == [85.75, 85.5, 85.25]


def test_comparisons_are_n_log_n():
    rng = random.Random(1)
    for n in (64, 1000, 5000):
        stats = SortStats()
        merge_sort([{'roll': i, 'name': 'x', 'marks': rng.randint(0, 100)} for i in range(n)], stats)
        assert stats.comparisons <= n * math.ceil(math.log2(n))
        assert stats.max_depth == math.ceil(math.log2(n))


def test_trace_describes_divide_compare_merge():
    trace = []
    result = merge_sort(recs(96, 72, 91, 85), trace=trace)
    types = {t['type'] for t in trace}
    assert types == {'divide', 'base', 'merge-start', 'compare', 'merged'}
    assert trace[0]['message'].startswith('DIVIDE [96, 72, 91, 85]')
    # The last snapshot is the final sorted order
    assert [x['marks'] for x in trace[-1]['array']] == [s['marks'] for s in result] == [96, 91, 85, 72]


def test_competition_ranking_with_ties():
    ranked = generate_ranks(merge_sort(recs(85, 91, 96, 91, 78)))
    assert [(s['marks'], s['rank']) for s in ranked] == [(96, 1), (91, 2), (91, 2), (85, 4), (78, 5)]
    assert count_tied_groups(ranked) == 1


def test_ranking_all_equal_and_empty():
    assert [s['rank'] for s in generate_ranks(merge_sort(recs(70, 70, 70)))] == [1, 1, 1]
    assert generate_ranks([]) == []


def test_ranking_multiple_tie_groups():
    ranked = generate_ranks(merge_sort(recs(50, 90, 90, 50, 50, 100)))
    assert [s['rank'] for s in ranked] == [1, 2, 2, 4, 4, 4]
    assert count_tied_groups(ranked) == 2


def test_statistics():
    assert get_statistics(recs(72, 91, 85, 96, 78)) == {'total': 5, 'highest': 96, 'average': 84.4, 'lowest': 72}
    assert get_statistics([]) == {'total': 0, 'highest': 0, 'average': 0, 'lowest': 0}


@pytest.mark.parametrize('algorithm', [bubble_sort, selection_sort, insertion_sort])
@pytest.mark.parametrize('order', ['random', 'sorted', 'reverse'])
def test_quadratic_algorithms_agree_with_merge_sort(algorithm, order):
    rng = random.Random(7)
    data = [{'roll': i, 'name': 'x', 'marks': rng.randint(0, 100)} for i in range(300)]
    if order == 'sorted':
        data = merge_sort(data)
    elif order == 'reverse':
        data = merge_sort(data)[::-1]
    assert algorithm(data) == merge_sort(data)
    assert is_sorted_descending(algorithm(data))


def test_best_case_counts():
    data = merge_sort([{'roll': i, 'name': 'x', 'marks': i % 100} for i in range(1000)])
    for fn in (bubble_sort, insertion_sort):
        stats = SortStats()
        fn(data, stats)
        assert stats.comparisons == 999            # O(n) on already sorted input
    stats = SortStats()
    selection_sort(data, stats)
    assert stats.comparisons == 1000 * 999 // 2     # always O(n^2)
