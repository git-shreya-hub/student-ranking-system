# Windows Setup (step by step)

Total time: about 15 minutes the first time, 10 seconds after that.

## 1. Install Python (skip if `py --version` already works)

1. Download **Python 3.10 or newer** from https://www.python.org/downloads/windows/
2. Run the installer and **tick "Add python.exe to PATH"** on the first screen, then click *Install Now*.
3. Open a new Command Prompt and check: `py --version` (or `python --version`).

## 2. Install PostgreSQL (skip if already installed)

1. Download the Windows installer from https://www.postgresql.org/download/windows/ (EDB installer, version 13 or newer).
2. Run it and keep the defaults:
   - Components: PostgreSQL Server, pgAdmin 4, Command Line Tools (Stack Builder is not needed).
   - **Password for the `postgres` user: choose one and write it down.** You will type it once in step 4.
   - Port: **5432**.
3. Finish. PostgreSQL now runs automatically as a Windows service (`postgresql-x64-NN`).

You do **not** need to create the database by hand; `run.bat` does it. (Manual instructions are in [DATABASE_SETUP.md](DATABASE_SETUP.md) if you prefer.)

## 3. Get the project

Unzip the project anywhere, for example `C:\Projects\student-ranking-system`.
Avoid folders that need admin rights (like `C:\Program Files`).

## 4. Run it

Double-click **`run.bat`** (or run it from Command Prompt inside the project folder).

On the first run it:

| Step | What happens |
|---|---|
| 1/4 | Creates a virtual environment in `venv\` |
| 2/4 | Installs Flask, SQLAlchemy, psycopg2, etc. (needs internet once) |
| 3/4 | Asks for your PostgreSQL details, saves them in `backend\.env`, creates the `student_ranking` database and table, and loads the 30 sample students |
| 4/4 | Starts the server and opens **http://127.0.0.1:5000** in your browser |

The first-run questions look like this (press Enter to accept the default in brackets):

```
First-time setup: tell me how to connect to PostgreSQL.
  PostgreSQL username [postgres]:
  PostgreSQL password (typing is hidden):      <- the password from step 2
  Host [localhost]:
  Port [5432]:
  Database name [student_ranking]:
```

Keep the black window open while you use the app. Press **Ctrl+C** in it to stop the server.

Every later run skips the setup and starts in a few seconds.

## 5. Run the tests (optional)

Double-click **`run_tests.bat`**. It runs 66 automated tests against a separate database
called `student_ranking_test`, so your demo data is not touched.

## Troubleshooting

| Message | Fix |
|---|---|
| `Python 3 was not found` | Install Python (step 1) and tick "Add python.exe to PATH". Then open a **new** Command Prompt. |
| `PostgreSQL rejected the username or password` | run.bat asks "Re-enter the PostgreSQL connection details? [Y,N]". Press **Y** and type the correct password. |
| `Cannot reach PostgreSQL at localhost:5432` | The service is stopped. Press Win+R, type `services.msc`, find **postgresql-x64-NN**, click **Start**. Then run run.bat again. |
| `Package installation failed` | Needs internet the first time. Check your connection, delete the `venv` folder and run again. |
| Red "Database not connected" bar in the app | PostgreSQL stopped while the app was running. Start the service, then click **Retry** in the bar. |
| Port 5000 already in use | Another program uses port 5000. Close it, or add `PORT=5050` to `backend\.env` and open http://127.0.0.1:5050 |
| Browser didn't open | Open http://127.0.0.1:5000 yourself. |

## Manual start (without run.bat)

```bat
cd C:\Projects\student-ranking-system
py -m venv venv
venv\Scripts\activate
pip install -r backend\requirements.txt
copy backend\.env.example backend\.env
notepad backend\.env            (put your PostgreSQL password in DATABASE_URL)
python backend\setup_db.py --sample-if-empty
python backend\app.py
```

Then open http://127.0.0.1:5000
