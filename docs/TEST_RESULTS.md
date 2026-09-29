# Test Results

**Date:** 28 September 2026
**Environment:** Linux test machine, Python 3.11, PostgreSQL 16.13, Chromium (Playwright). Package versions are the ones pinned in `backend/requirements.txt`.
**Result:** 66 of 66 automated tests passed, and 26 of 26 browser workflow steps passed.

Not tested here: running `run.bat` itself on Windows (no Windows machine was available). Its steps were checked
one by one on Linux, including the first-run password prompt, and the pinned packages were confirmed to have
Windows wheels for Python 3.10 to 3.14 (`psycopg2-binary 2.9.13`, `SQLAlchemy 2.0.54`).
**Please do one full `run.bat` run on the demo laptop before the review.**

## 1. Automated tests (pytest): 66 passed

Run with `run_tests.bat` (or `venv\Scripts\python -m pytest tests -v`). The API tests use a real PostgreSQL database
(`student_ranking_test`).

| File | Tests | What is proven |
|---|---|---|
| `tests/test_merge_sort.py` | 30 | Merge Sort is correct on empty/single/random inputs up to n = 1001, doesn't modify its input, moves whole records, sorts decimals, breaks ties by roll number, makes ≤ n⌈log₂ n⌉ comparisons with recursion depth ⌈log₂ n⌉, and its trace ends in the sorted order. Competition ranking: 96, 91, 91, 85, 78 → 1, 2, 2, 4, 5; all-equal → all rank 1; several tie groups. Bubble/Selection/Insertion give identical results on random, sorted and reverse input; best-case counts are O(n) for Bubble and Insertion and n(n-1)/2 for Selection. |
| `tests/test_api.py` | 34 | Full CRUD against PostgreSQL; 12 invalid inputs rejected with the right field (boolean/zero/negative/decimal roll, empty/HTML/too-long name, marks > 100, < 0, boolean, text, missing); valid edge cases (0, 100, `D'Souza Anne-Marie`, `Dr. Rao`, numeric strings); duplicate roll → 409 on add and edit; non-JSON body, unknown endpoint and wrong method → JSON errors; sample loading is idempotent (30, then 0 added); ranking with ties from the database; statistics; clear all; performance endpoint (single, comparison, 9 bad inputs, O(n²) size cap); visualization endpoint; automatic upgrade of a table created by the original version; friendly database error messages. |
| `tests/test_no_builtin_sort.py` | 2 | Scans the real source code: no `sorted()`, `.sort()`, `order_by()` or SQL `ORDER BY` in the backend, and no `.sort()` in the frontend JavaScript. Verified that it fails if `sorted()` is added to `app.py`. |

<details><summary>Full pytest output</summary>

```
test_api.py::test_health_and_frontend PASSED
test_api.py::test_crud_flow PASSED
test_api.py::test_validation[body0-roll] ... [body11-marks]   12 PASSED
test_api.py::test_valid_edge_values PASSED
test_api.py::test_duplicate_roll PASSED
test_api.py::test_json_errors PASSED
test_api.py::test_sample_is_idempotent PASSED
test_api.py::test_ranking_uses_merge_sort_with_ties PASSED
test_api.py::test_ranking_empty PASSED
test_api.py::test_statistics_endpoint PASSED
test_api.py::test_clear_all PASSED
test_api.py::test_inline_rank PASSED
test_api.py::test_performance_single_and_compare PASSED
test_api.py::test_performance_rejects_bad_input[body0..body8]  9 PASSED
test_api.py::test_visualize PASSED
test_api.py::test_old_table_is_migrated PASSED
test_api.py::test_friendly_database_errors PASSED
test_merge_sort.py::test_empty_and_single PASSED
test_merge_sort.py::test_presentation_example PASSED
test_merge_sort.py::test_input_not_modified PASSED
test_merge_sort.py::test_whole_record_moves_together PASSED
test_merge_sort.py::test_matches_reference_on_random_data[2,3,7,16,100,1001]  6 PASSED
test_merge_sort.py::test_ties_broken_by_roll_number PASSED
test_merge_sort.py::test_decimal_marks PASSED
test_merge_sort.py::test_comparisons_are_n_log_n PASSED
test_merge_sort.py::test_trace_describes_divide_compare_merge PASSED
test_merge_sort.py::test_competition_ranking_with_ties PASSED
test_merge_sort.py::test_ranking_all_equal_and_empty PASSED
test_merge_sort.py::test_ranking_multiple_tie_groups PASSED
test_merge_sort.py::test_statistics PASSED
test_merge_sort.py::test_quadratic_algorithms_agree_with_merge_sort[3 orders x 3 algorithms]  9 PASSED
test_merge_sort.py::test_best_case_counts PASSED
test_no_builtin_sort.py::test_backend_has_no_builtin_sort_calls PASSED
test_no_builtin_sort.py::test_frontend_has_no_sort_call PASSED
============================== 66 passed in 0.75s ==============================
```
</details>

## 2. Browser workflow test: 26 passed

`tests/browser/workflow.test.js` drives the real app in Chromium (desktop 1366×900, then phone 390×844):

```
PASS  Page loads and shows PostgreSQL connected
PASS  Every navigation button opens its section and highlights itself
PASS  Clear All asks for confirmation and empties the table
PASS  Empty dashboard and ranking show helpful empty states
PASS  Form validation shows field errors (empty, bad name, marks > 100)
PASS  Add students (including decimal marks and a tie)
PASS  Duplicate roll number is rejected by the API with a field error
PASS  Edit a student
PASS  Delete a student after confirmation (Cancel keeps it)
PASS  Load Sample Data adds 30 records and does not duplicate
PASS  Search filters the student list
PASS  Dashboard shows statistics, top 5 and distribution
PASS  Dashboard "View Ranking" opens the ranking
PASS  Ranking is descending with competition ranks for ties
PASS  Ranking filters (search, min/max) keep original ranks
PASS  Before-sorting tab shows database order
PASS  Export ranking as CSV
PASS  Visualization: start, step, jump to the end, see ranks
PASS  Visualization Play animates and Pause stops
PASS  Visualization rejects invalid input
PASS  Visualization from database students
PASS  Performance: Merge Sort scalability run
PASS  Performance: comparison with Bubble, Selection, Insertion
PASS  Database outage shows banner, Retry recovers
PASS  Mobile layout: menu toggle opens navigation, no sideways scroll
PASS  No JavaScript errors during the whole run

26 passed, 0 failed
```

The first run found one real bug (after editing a student, the button kept saying "Update Student");
it was fixed and the whole suite re-run.

Also checked: opening `frontend/index.html` directly from disk (file://) still talks to the API on port 5000.

## 3. Setup script checks

| Scenario | Result |
|---|---|
| First run with no `backend/.env` | Asked for username/password/host/port/database, saved `.env` (password with `@ : / #` correctly URL-encoded), created the database, created the table, loaded 30 students |
| Second run | "Database already exists", "Table ready (30 records)", no duplicates |
| Wrong password | *"PostgreSQL rejected the username or password in backend/.env…"*, exit code 1 (run.bat then offers to re-enter it) |
| PostgreSQL stopped | *"Cannot reach PostgreSQL at localhost:5432. Make sure the PostgreSQL service is running…"*, exit code 1 |
| App started with no `.env` and PostgreSQL down | App still starts; every API call returns a clear 503 message; the UI shows the red banner |

## 4. Measured performance (test machine, in-memory data)

Merge Sort scalability (random input):

| n | Time (ms) | Comparisons | n log₂ n | Ratio |
|---:|---:|---:|---:|---:|
| 100 | 0.19 | 543 | 664 | 0.817 |
| 1,000 | 2.7 | 8,696 | 9,966 | 0.873 |
| 10,000 | 37.5 | 120,258 | 132,877 | 0.905 |
| 50,000 | 230 | 716,468 | 780,482 | 0.918 |

Comparison at n = 5,000, random input:

| Algorithm | Time (ms) | Comparisons |
|---|---:|---:|
| Merge Sort | 16.4 | 55,189 |
| Insertion Sort | 891 | 6,152,999 |
| Selection Sort | 1,355 | 12,497,500 |
| Bubble Sort | 2,017 | 12,492,450 |

Times vary by computer; the comparison counts are exact and the same on every machine (fixed random seed).
