import os
import time
from urllib.parse import urlsplit
from dotenv import load_dotenv
from sqlalchemy import inspect, text
from models import db

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BACKEND_DIR, '.env')

# Load environment variables from .env file
load_dotenv(ENV_PATH)

DEFAULT_DATABASE_URL = 'postgresql://postgres@localhost:5432/student_ranking'


def normalize_url(url):
    """
    Always use the psycopg2 driver listed in requirements.txt.
    (SQLAlchemy 2.1+ otherwise defaults postgresql:// to the newer 'psycopg' driver.)
    """
    url = url.strip()
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    if url.startswith('postgresql://'):
        url = 'postgresql+psycopg2://' + url[len('postgresql://'):]
    return url


DATABASE_URL = normalize_url(os.getenv('DATABASE_URL') or DEFAULT_DATABASE_URL)
USING_DEFAULT_URL = not os.getenv('DATABASE_URL')

# Remember whether tables are ready so we only retry occasionally
_state = {'ready': False, 'error': None, 'last_attempt': 0.0}
RETRY_SECONDS = 5


def masked_url(url=None):
    """Return the database URL with the password hidden (safe to print)."""
    parts = urlsplit(url or DATABASE_URL)
    if parts.password:
        netloc = parts.netloc.replace(':' + parts.password + '@', ':****@')
        return parts._replace(netloc=netloc).geturl()
    return parts.geturl()


def describe_db_error(exc):
    """Turn a low-level PostgreSQL/driver error into advice a student can act on."""
    raw = str(getattr(exc, 'orig', exc) or exc)
    msg = raw.lower()
    parts = urlsplit(DATABASE_URL)
    host = f"{parts.hostname or 'localhost'}:{parts.port or 5432}"
    dbname = (parts.path or '/').lstrip('/') or 'student_ranking'

    if 'password authentication failed' in msg or 'no password supplied' in msg:
        return ('PostgreSQL rejected the username or password in backend/.env. '
                'Delete backend/.env and run run.bat again to re-enter it.')
    if 'does not exist' in msg and 'database' in msg:
        return (f'The database "{dbname}" does not exist yet. '
                'Run "python backend/setup_db.py" (run.bat does this automatically).')
    if ('connection refused' in msg or 'could not connect' in msg
            or 'timeout expired' in msg or 'connection timed out' in msg):
        return (f'Cannot reach PostgreSQL at {host}. Make sure the PostgreSQL service is running '
                '(Windows: Services > postgresql-x64-NN > Start).')
    if 'no module named' in msg and 'psycopg2' in msg:
        return 'The PostgreSQL driver is not installed. Run: pip install -r backend/requirements.txt'
    return f'Database error: {raw.strip().splitlines()[0] if raw.strip() else type(exc).__name__}'


def init_db(app):
    """Initialize the database connection and try to create tables."""
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    # Detect dropped connections (e.g. PostgreSQL restarted during the demo)
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True}
    db.init_app(app)

    with app.app_context():
        ensure_tables(force=True)


def ensure_tables(force=False):
    """
    Create tables (and add columns introduced by newer versions) if needed.
    Returns True when the database is ready. Must run inside an app context.
    """
    if _state['ready']:
        return True
    now = time.time()
    if not force and now - _state['last_attempt'] < RETRY_SECONDS:
        return False
    _state['last_attempt'] = now

    try:
        db.create_all()
        _migrate_columns()
        _state['ready'] = True
        _state['error'] = None
    except Exception as exc:  # noqa: BLE001 - reported to the user
        db.session.rollback()
        _state['ready'] = False
        _state['error'] = describe_db_error(exc)
    return _state['ready']


def _migrate_columns():
    """Add the updated_at column to tables created by the first version of the project."""
    columns = [c['name'] for c in inspect(db.engine).get_columns('students')]
    if 'updated_at' not in columns:
        with db.engine.begin() as conn:
            conn.execute(text('ALTER TABLE students ADD COLUMN updated_at TIMESTAMP'))
            conn.execute(text('UPDATE students SET updated_at = created_at'))


def db_state():
    return dict(_state)


def get_db():
    """Get the database session."""
    return db


def test_connection():
    """Test if PostgreSQL is connected. Returns (connected, error_message)."""
    try:
        db.session.execute(text('SELECT 1'))
        return True, None
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        _state['ready'] = False
        return False, describe_db_error(exc)
