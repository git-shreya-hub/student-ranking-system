# Files Changed and Why

Starting point: the uploaded `student-ranking-system-using-merge-sort-main` project.
The architecture is unchanged (HTML/CSS/JS → Flask REST API → SQLAlchemy → PostgreSQL → manual Merge Sort → ranking → frontend),
and the original Merge Sort, ranking and CRUD code was kept and extended rather than replaced.

## Bugs fixed

| # | Bug in the original | Fix | Where |
|---|---|---|---|
| 1 | Visualization's final step used JavaScript's built-in `.sort()`, breaking the "manual sort only" rule | Steps now come from the backend's own `merge_sort()`; the frontend has no sort call anywhere (and a test enforces it) | `frontend/script.js`, `backend/app.py` `/api/visualize` |
| 2 | **A fresh install could not connect to PostgreSQL at all**: `requirements.txt` didn't pin SQLAlchemy, and SQLAlchemy 2.1 uses the `psycopg` (v3) driver for `postgresql://` URLs, which isn't installed (`ModuleNotFoundError: No module named 'psycopg'`) | Pinned `SQLAlchemy==2.0.54` and always use the `postgresql+psycopg2://` driver | `backend/requirements.txt`, `backend/database.py` |
| 3 | App crashed on start without `.env` (`RuntimeError: Either 'SQLALCHEMY_DATABASE_URI'…`) | Default URL, app starts even if PostgreSQL is down, clear 503 messages, auto-retry | `backend/database.py`, `backend/app.py` |
| 4 | `.env.example` was git-ignored, so it was missing | Added it; removed it from `.gitignore` | `backend/.env.example`, `backend/.gitignore` |
| 5 | Navigation highlight never moved | Active button follows the section; URL hash remembers the page | `frontend/script.js` |
| 6 | Dashboard "View Ranking" didn't open the Ranking page | Now navigates and ranks | `frontend/script.js`, `index.html` |
| 7 | Stored XSS: names inserted with `innerHTML` unescaped | All user text escaped; the API also rejects names with symbols | `frontend/script.js`, `backend/app.py` |
| 8 | Validation holes: `true` accepted as roll 1, negative/decimal rolls, `false` as 0 marks, no name length limit, misleading message for roll 0 | Strict validation with the failing field named; DB CHECK constraints as a second layer | `backend/app.py`, `backend/models.py` |
| 9 | Decimal marks truncated (`parseInt`: 85.5 → 85) | `parseFloat`, `step=0.01`, stored to 2 decimals | `frontend/script.js`, `index.html` |
| 10 | Non-JSON requests returned an HTML error page | JSON error handlers for 400/404/405/415/500/503 | `backend/app.py` |
| 11 | No rollback after a failed commit (could break later requests) | `commit_or_error()` rolls back and maps unique violations to 409 | `backend/app.py` |
| 12 | Timer used `time.time()` (~15 ms resolution on Windows, so small sizes showed 0 ms) | `time.perf_counter()`, best of 3 runs for small n | `backend/app.py` |
| 13 | No limit on performance size (10 million would freeze the server) | Merge Sort ≤ 100,000; O(n²) sorts ≤ 5,000 | `backend/app.py`, `backend/sorting_algorithms.py` |
| 14 | Tied students could swap places between runs (PostgreSQL row order isn't guaranteed) | Merge compares roll number when marks are equal | `backend/merge_sort.py` |
| 15 | Editing a student overwrote `created_at` | Separate `updated_at` column (existing tables are upgraded automatically) | `backend/models.py`, `backend/database.py` |
| 16 | `/api/statistics` and `/api/ranking` used different key names | Both return `total, highest, average, lowest` | `backend/app.py` |
| 17 | Frontend needed a separate static server on port 5500 | Flask serves the frontend at http://127.0.0.1:5000 | `backend/app.py` |
| 18 | Deprecated `Query.get()`, global `random.seed(42)`, `debug=True` on `0.0.0.0` | `db.session.get()`, local RNG, debug off and localhost only by default | `backend/app.py` |

## Features added

| Feature | Where |
|---|---|
| **Bubble, Selection and Insertion Sort**, implemented manually, measured against Merge Sort on identical data (random / sorted / reverse input), with time and comparison counts, line chart and insight box | `backend/sorting_algorithms.py`, `/api/performance`, Performance page |
| Merge Sort instrumentation: comparisons, moves, recursion depth, n log₂ n, and the ratio between them | `backend/merge_sort.py` (`SortStats`), Ranking and Performance pages |
| Step-by-step visualization driven by the real algorithm: animated bars (current range, compared pair, merged range), recursion tree, clickable step log, play/pause/speed, keyboard arrows, ranks at the end, "From database" and "Random" inputs | `backend/merge_sort.py` (trace), `/api/visualize`, Visualization page |
| Merge Sort rewritten to follow the presentation's `MERGE_SORT(A, low, high)` / `MERGE(A, low, mid, high)` pseudocode exactly | `backend/merge_sort.py` |
| Ranking page: algorithm summary, before/after sorting tabs, medals, "Tied" markers, search by name or roll, min/max filter, CSV export | `frontend/*` |
| Dashboard: top-5 students, marks distribution chart, Divide/Conquer/Combine pipeline, names of top and bottom scorers | `frontend/*` |
| Live PostgreSQL status badge, offline banner with Retry, auto-reconnect | `frontend/*`, `/api/health` |
| Loading spinners on every action, success/error toasts, per-field errors, confirmation dialogs, empty states | `frontend/*` |
| Responsive layout with phone menu | `frontend/style.css` |
| Realistic sample class of 30 students with ties, a decimal mark and a fail, loaded from `data/students.json` (previously unused) | `backend/data/students.json` |
| One-click Windows start that creates the venv, installs packages, asks for the DB password once, creates the database and opens the browser | `run.bat`, `backend/setup_db.py` |
| Automated tests (66) and a browser workflow test (26 steps) | `tests/`, `run_tests.bat` |
| Documentation: Windows setup, database setup, demo script, test results | `docs/` |

## File-by-file

| File | Status | Why |
|---|---|---|
| `backend/merge_sort.py` | Modified | Slide-matching recursion, roll-number tie-break, optional stats and trace; `generate_ranks()` and `get_statistics()` kept as they were; added `count_tied_groups()` |
| `backend/app.py` | Modified | Validation, error handling, rollback, serves the frontend, `/api/visualize`, `/api/algorithms`, comparison in `/api/performance`, ranking returns before-order and algorithm stats, POST `/api/sample` (GET still works), removed the unused `/api/sample-data` |
| `backend/database.py` | Modified | psycopg2 driver, friendly errors, retry, automatic column upgrade |
| `backend/models.py` | Modified | `updated_at`, CHECK constraints |
| `backend/requirements.txt` | Modified | Pinned SQLAlchemy 2.0.54 |
| `backend/data/students.json` | Modified | 30 realistic students (was 5, unused) |
| `backend/.gitignore` | Modified | Stop ignoring `.env.example` |
| `backend/.env.example` | New | Connection template |
| `backend/sorting_algorithms.py` | New | Bubble, Selection and Insertion Sort for comparison |
| `backend/setup_db.py` | New | Creates `.env`, the database and table; loads sample data |
| `frontend/index.html` | Modified | Same six sections, with the new controls, tables and cards |
| `frontend/script.js` | Modified | All fixes above, charts, visualization, states |
| `frontend/style.css` | Modified | Same colour scheme, polished and responsive |
| `run.bat`, `run_tests.bat` | New | Windows start and test scripts |
| `tests/*` | New | pytest suite and browser workflow test |
| `docs/*`, `README.md` | New / updated | Setup, database, demo, results, this list |
| `.gitattributes`, `.gitignore` | New | Keep Windows line endings in `.bat` files; ignore venv and caches |
