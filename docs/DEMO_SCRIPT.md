# 5-Minute PBL Demonstration Script

**Before the panel arrives:** double-click `run.bat`, wait for the browser, and check the header badge says
**PostgreSQL connected**. Students page should show 30 records (if not: *Load Sample Data*).
Keep the Algorithm page ready as a fallback. Suggested split: one presenter drives, one speaks.

---

### 0:00 – 0:30 · Introduction (Dashboard)

> "Our project is a Student Marks Sorting and Ranking System. It sorts student records by marks in
> descending order using **Merge Sort, implemented manually**, and generates competition ranks with tie handling.
> The stack is an HTML/CSS/JavaScript frontend, a Flask REST API, SQLAlchemy, and PostgreSQL."

Point at the **4 stat cards** (30 students, highest 99, average 75.32, lowest 38) and the pipeline strip:
*PostgreSQL → Divide → Conquer → Combine → Rank*.

> "Even this dashboard's Top 5 comes from our Merge Sort, not from the database."

### 0:30 – 1:15 · CRUD and validation (Students)

1. Click **Students**. Point out the list is in database order, *unsorted*.
2. Add a student: roll **131**, name **Aditi Sharma**, marks **96** → green toast, row flashes.
   (96 ties with Neha on purpose.)
3. Show validation: roll **101** again → *"Roll number 101 already belongs to Rahul Sharma"* under the field.
   Marks **105** → *"Marks must be between 0 and 100"*.
4. Click **Edit** on Aditi, change marks to **96.5**, Update. Mention decimals are supported.
   Then change back to **96**.

> "Validation happens in the browser, again in the Flask API, and again as CHECK and UNIQUE constraints in PostgreSQL."

### 1:15 – 2:15 · Ranking with ties (Ranking)

1. Click **Ranking** → **Sort & Generate Ranking**.
2. Read the summary cards: *n = 31, ~120 comparisons vs n log₂ n ≈ 154, recursion depth 5, sort time well under 1 ms*.
3. Point at the table: Ananya **99 → rank 1**, Neha and Aditi **96 → both rank 2 (Tied)**, Shruti **95 → rank 4**.

> "This is competition ranking: equal marks share a rank and the next rank is skipped, 1, 2, 2, 4.
> Tied students are listed by roll number so the order is always the same."

4. Click **Before sorting (database order)** tab to show the unsorted input, then back to **After Merge Sort**.
5. Optional: type **85** in Min and Max to show the three students tied at rank 11. Click **Reset**.

> "We never use Python `sorted()` or SQL `ORDER BY` for ranking. We even have an automated test that scans the
> source code and fails if anyone adds one."

### 2:15 – 3:30 · Divide and Conquer, step by step (Visualization)

1. Click **Visualization**. The input is `96, 72, 91, 85, 78, 91, 64, 88` (8 values with a tie). Click **Start**.
2. Click **Next** a few times, narrating:
   - **DIVIDE** (blue): "the array is split at mid into halves until single elements remain."
   - **Recursion tree** fills row by row: "depth is log₂ 8 = 3 levels."
   - **COMPARE** (orange bars lift): "96 vs 72, 96 is higher so it goes first."
   - **MERGED** (green): "the merged sub-array is sorted, and the tree node turns green."
3. Press **Play** and let it finish (drag Speed to fast if short on time).
4. Final card shows ranks: **96 → 1, then 91 and 91 both rank 2, then 88 → 4**.

> "These steps come from the backend's actual `merge_sort()` function, the same one that ranks students."

### 3:30 – 4:30 · Performance and comparison (Performance)

1. Point at the **Theoretical Complexity** table.
2. Click **Run All** under *Merge Sort Scalability*: up to 50,000 records in about a quarter of a second.
   Point at the **Ratio** column: comparisons ÷ n log₂ n stays around 0.8–0.9. "That constant ratio is O(n log n) in practice."
3. Under *Merge Sort vs Bubble, Selection and Insertion*, choose **Reverse sorted (worst case)** and click **Run Comparison**
   (takes a few seconds).
4. Read the insight box: at n = 5,000 Bubble Sort is **around 100× slower** than Merge Sort
   with about **225× more comparisons**. Toggle **Comparisons** to show the n² curves.

> "Doubling n quadruples the quadratic sorts but only slightly more than doubles Merge Sort."

(If asked about best case: switch to *Already sorted*. Insertion and Bubble become O(n) and can beat Merge Sort,
but Merge Sort is O(n log n) in every case, which is why we chose it.)

### 4:30 – 5:00 · Wrap-up (Algorithm)

Click **Algorithm** and summarise from the page:

> "Recurrence T(n) = 2T(n/2) + O(n), which is Θ(n log n) by the Master Theorem; O(n) auxiliary space; stable.
> Overall: fetch O(n) + Merge Sort O(n log n) + ranking O(n) = O(n log n).
> Future scope: multiple subjects and CGPA, and PDF reports. We already export the ranking as CSV."

---

## Likely viva questions (short answers)

| Question | Answer |
|---|---|
| Why Merge Sort, not Quick Sort? | Guaranteed O(n log n) worst case and stable. Quick Sort is O(n²) in the worst case. |
| Where exactly is the sort? | `backend/merge_sort.py`: `merge_sort()` → `_merge_sort(A, low, high)` → `merge(A, low, mid, high)`, matching our pseudocode. |
| How are ties handled in sorting? | `comes_before()`: higher marks first; equal marks → smaller roll number first. |
| How are ties handled in ranking? | `generate_ranks()`: same marks as previous → same rank; else rank = position + 1. |
| Space complexity? | O(n) for the temporary merge arrays, plus O(log n) recursion stack. |
| Is the database sorting anything? | No. `Student.query.all()` has no ORDER BY; `tests/test_no_builtin_sort.py` proves it. |
| What if two users add the same roll at once? | The UNIQUE constraint rejects the second; the API rolls back and returns 409. |
| What happens if PostgreSQL stops? | The header badge turns red, a banner explains how to start it, and **Retry** reconnects without restarting the app. |
