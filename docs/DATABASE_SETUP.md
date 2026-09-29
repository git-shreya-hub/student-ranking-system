# Database Setup (PostgreSQL)

`run.bat` does all of this automatically. Use this page if you want to do it by hand,
explain it in the viva, or fix a problem.

## What the application needs

| Item | Value |
|---|---|
| Server | PostgreSQL 13 or newer, running on `localhost:5432` |
| Database | `student_ranking` |
| Table | `students` (created automatically by SQLAlchemy) |
| Connection | `DATABASE_URL` in `backend\.env` |

## Option A: automatic (recommended)

```bat
venv\Scripts\python backend\setup_db.py --sample-if-empty
```

It asks for your password if `backend\.env` doesn't exist, creates the database if missing,
creates the table, and loads the 30 sample students when the table is empty. It is safe to run many times.

## Option B: manual with psql or pgAdmin

1. Open **SQL Shell (psql)** from the Start menu and press Enter for the defaults, then type your password.
2. Create the database:
   ```sql
   CREATE DATABASE student_ranking;
   \l student_ranking
   ```
3. Create `backend\.env` (copy `backend\.env.example`) and set:
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/student_ranking
   ```
   If the password contains `@ : / # %` or spaces, URL-encode them (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `%` → `%25`, space → `%20`),
   or let `setup_db.py` write the file for you.
4. Start the app (`run.bat` or `python backend\app.py`). The table is created on startup.

In pgAdmin: right-click *Databases* → *Create* → *Database…*, name it `student_ranking`, Save.

## Table design

Created from `backend/models.py`:

```sql
CREATE TABLE students (
    id          SERIAL PRIMARY KEY,
    roll_no     INTEGER      NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    marks       DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    CONSTRAINT ck_students_marks_range  CHECK (marks >= 0 AND marks <= 100),
    CONSTRAINT ck_students_roll_positive CHECK (roll_no > 0)
);
```

Rules are enforced twice: in the Flask API (clear error messages) and in PostgreSQL (CHECK and UNIQUE constraints),
so bad data cannot get in even through another tool.

If you used the original version of the project, your existing `students` table is upgraded automatically
(the `updated_at` column is added on startup). Existing records are kept.

## Important: PostgreSQL does not sort

The app reads records with a plain `SELECT` (SQLAlchemy `Student.query.all()`), **without `ORDER BY`**.
PostgreSQL only stores and returns the rows. Every ranking is produced by the manual Merge Sort in
`backend/merge_sort.py`. The automated test `tests/test_no_builtin_sort.py` scans the source code
and fails if `sorted()`, `.sort()`, `order_by()` or `ORDER BY` is ever added.

## Useful commands

```sql
-- See the data (in psql, connected with \c student_ranking)
SELECT * FROM students;

-- Count
SELECT COUNT(*) FROM students;

-- Start over (the app recreates the table on next start)
DROP TABLE students;
```

In the app, **Students → Clear All** deletes all records and **Load Sample Data** restores the 30 sample students.

## Sample data

`backend/data/students.json` holds a class of 30 students (rolls 101 to 130). It includes the five students
from the presentation (Rahul 72, Priya 91, Aman 85, Neha 96, Riya 78) and deliberate ties to demonstrate
competition ranking: 91 ×2, 85 ×3, 78 ×2, 64 ×2, plus a decimal mark (87.5) and one fail (38).

## Test database

`run_tests.bat` uses a separate database, `student_ranking_test` (created automatically with the same
credentials), so tests never touch your demo data. Override it with the `TEST_DATABASE_URL` environment variable.
