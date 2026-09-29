"""
Test setup.
The API tests run against a real PostgreSQL database called student_ranking_test
(created automatically). Override with the TEST_DATABASE_URL environment variable.
Your demo data in student_ranking is never touched.
"""
import os
import sys
from urllib.parse import urlsplit

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, 'backend')
sys.path.insert(0, BACKEND)


def _test_url():
    if os.getenv('TEST_DATABASE_URL'):
        return os.environ['TEST_DATABASE_URL']
    # Reuse the credentials from backend/.env but point at a separate test database
    from dotenv import dotenv_values
    url = dotenv_values(os.path.join(BACKEND, '.env')).get('DATABASE_URL') or \
        'postgresql://postgres@localhost:5432/student_ranking'
    parts = urlsplit(url)
    return parts._replace(path='/student_ranking_test').geturl()


TEST_URL = _test_url()
os.environ['DATABASE_URL'] = TEST_URL   # must be set before database.py is imported


@pytest.fixture(scope='session')
def app():
    from setup_db import create_database_if_missing
    try:
        create_database_if_missing(TEST_URL.replace('+psycopg2', ''))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f'PostgreSQL not available for API tests: {exc}')
    from app import app as flask_app
    from database import ensure_tables
    with flask_app.app_context():
        assert ensure_tables(force=True)
    flask_app.config['TESTING'] = True
    return flask_app


@pytest.fixture()
def client(app):
    from models import db, Student
    with app.app_context():
        Student.query.delete()
        db.session.commit()
    return app.test_client()
