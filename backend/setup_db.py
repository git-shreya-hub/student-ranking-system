"""
First-run database setup
========================
1. Creates backend/.env (asks for your PostgreSQL password) if it does not exist.
2. Creates the PostgreSQL database (default: student_ranking) if it does not exist.
3. Creates the students table.
4. Optionally loads the sample class:
       python backend/setup_db.py --sample            (always, skips existing rolls)
       python backend/setup_db.py --sample-if-empty   (only when the table is empty)

run.bat calls this automatically. It is safe to run many times.
Exit code 0 = database ready, 1 = something needs fixing (the message says what).
"""

import os
import sys
import getpass
from urllib.parse import quote, urlsplit, unquote

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BACKEND_DIR, '.env')
sys.path.insert(0, BACKEND_DIR)


def ask(prompt, default):
    value = input(f'{prompt} [{default}]: ').strip()
    return value or default


def write_env_interactively():
    print()
    print('First-time setup: tell me how to connect to PostgreSQL.')
    print('Press Enter to accept the value in [brackets].')
    user = ask('  PostgreSQL username', 'postgres')
    password = getpass.getpass('  PostgreSQL password (typing is hidden): ')
    host = ask('  Host', 'localhost')
    port = ask('  Port', '5432')
    dbname = ask('  Database name', 'student_ranking')

    auth = quote(user, safe='')
    if password:
        auth += ':' + quote(password, safe='')
    url = f'postgresql://{auth}@{host}:{port}/{dbname}'
    with open(ENV_PATH, 'w', encoding='utf-8') as f:
        f.write('# Created by setup_db.py. Delete this file to enter the details again.\n')
        f.write(f'DATABASE_URL={url}\n')
        f.write('FLASK_DEBUG=0\nPORT=5000\n')
    print(f'  Saved connection settings to {ENV_PATH}')
    print()


def create_database_if_missing(url):
    """Connect to the default 'postgres' database and CREATE DATABASE if needed."""
    import psycopg2
    from psycopg2 import sql

    parts = urlsplit(url)
    dbname = unquote((parts.path or '/').lstrip('/')) or 'student_ranking'
    params = dict(
        user=unquote(parts.username) if parts.username else 'postgres',
        password=unquote(parts.password) if parts.password else None,
        host=parts.hostname or 'localhost',
        port=parts.port or 5432,
        dbname='postgres',
        connect_timeout=5,
    )
    conn = psycopg2.connect(**params)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (dbname,))
            if cur.fetchone():
                print(f'  Database "{dbname}" already exists.')
            else:
                cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(dbname)))
                print(f'  Created database "{dbname}".')
    finally:
        conn.close()


def main():
    load_sample = '--sample' in sys.argv
    sample_if_empty = '--sample-if-empty' in sys.argv
    interactive = sys.stdin.isatty() and '--no-input' not in sys.argv

    if not os.path.exists(ENV_PATH) and not os.getenv('DATABASE_URL'):
        if interactive:
            write_env_interactively()
        else:
            print('backend/.env not found. Copy backend/.env.example to backend/.env and set DATABASE_URL.')
            return 1

    # Import after .env exists so database.py reads it
    from database import DATABASE_URL, describe_db_error, masked_url

    print(f'Checking PostgreSQL: {masked_url()}')
    try:
        create_database_if_missing(DATABASE_URL.replace('+psycopg2', ''))
    except Exception as exc:  # noqa: BLE001 - shown to the user
        print()
        print('  [!] Could not connect to PostgreSQL.')
        print('      ' + describe_db_error(exc))
        print('      Details: ' + str(exc).strip().splitlines()[0] if str(exc).strip() else '')
        return 1

    from app import app
    from database import ensure_tables, db_state
    from models import Student, db

    with app.app_context():
        if not ensure_tables(force=True):
            print('  [!] ' + str(db_state()['error']))
            return 1
        count = Student.query.count()
        print(f'  Table "students" ready ({count} records).')
        if load_sample or (sample_if_empty and count == 0):
            client = app.test_client()
            print('  ' + client.post('/api/sample').get_json()['message'])
    print('Database ready.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
