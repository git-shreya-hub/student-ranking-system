"""API tests against PostgreSQL (database student_ranking_test)."""
import pytest


def add(client, roll, name, marks):
    return client.post('/api/students', json={'roll': roll, 'name': name, 'marks': marks})


def test_health_and_frontend(client):
    r = client.get('/api/health')
    assert r.status_code == 200 and r.json['database'] == 'connected'
    assert client.get('/').status_code == 200
    assert client.get('/script.js').status_code == 200


def test_crud_flow(client):
    r = add(client, 101, 'Rahul Sharma', 72)
    assert r.status_code == 201
    sid = r.json['student']['id']
    assert client.get('/api/students').json['students'][0]['name'] == 'Rahul Sharma'

    r = client.put(f'/api/students/{sid}', json={'roll': 101, 'name': 'Rahul S', 'marks': 88.5})
    assert r.status_code == 200 and r.json['student']['marks'] == 88.5

    assert client.delete(f'/api/students/{sid}').status_code == 200
    assert client.get('/api/students').json['students'] == []
    assert client.delete(f'/api/students/{sid}').status_code == 404
    assert client.put(f'/api/students/{sid}', json={'roll': 1, 'name': 'A', 'marks': 1}).status_code == 404


@pytest.mark.parametrize('body, field', [
    ({'roll': True, 'name': 'Asha', 'marks': 50}, 'roll'),
    ({'roll': 0, 'name': 'Asha', 'marks': 50}, 'roll'),
    ({'roll': -3, 'name': 'Asha', 'marks': 50}, 'roll'),
    ({'roll': 1.5, 'name': 'Asha', 'marks': 50}, 'roll'),
    ({'roll': 1, 'name': '   ', 'marks': 50}, 'name'),
    ({'roll': 1, 'name': '<img src=x onerror=alert(1)>', 'marks': 50}, 'name'),
    ({'roll': 1, 'name': 'A' * 101, 'marks': 50}, 'name'),
    ({'roll': 1, 'name': 'Asha', 'marks': 100.5}, 'marks'),
    ({'roll': 1, 'name': 'Asha', 'marks': -1}, 'marks'),
    ({'roll': 1, 'name': 'Asha', 'marks': False}, 'marks'),
    ({'roll': 1, 'name': 'Asha', 'marks': 'abc'}, 'marks'),
    ({'roll': 1, 'name': 'Asha'}, 'marks'),
])
def test_validation(client, body, field):
    r = client.post('/api/students', json=body)
    assert r.status_code == 400
    assert r.json['field'] == field


def test_valid_edge_values(client):
    assert add(client, 1, "D'Souza Anne-Marie", 0).status_code == 201
    assert add(client, 2, 'Dr. Rao', 100).status_code == 201
    assert add(client, '3', 'Asha', '87.456').json['student']['marks'] == 87.46


def test_duplicate_roll(client):
    add(client, 101, 'Rahul', 72)
    r = add(client, 101, 'Someone', 50)
    assert r.status_code == 409 and r.json['field'] == 'roll'
    other = add(client, 102, 'Priya', 91).json['student']['id']
    assert client.put(f'/api/students/{other}', json={'roll': 101, 'name': 'Priya', 'marks': 91}).status_code == 409


def test_json_errors(client):
    r = client.post('/api/students', data='not json', content_type='text/plain')
    assert r.status_code == 400 and 'error' in r.json
    assert client.get('/api/nope').json == {'error': 'Endpoint not found'}
    assert client.patch('/api/students').status_code == 405
    assert 'error' in client.patch('/api/students').json


def test_sample_is_idempotent(client):
    r = client.post('/api/sample')
    assert r.status_code == 200 and len(r.json['added']) == 30
    r = client.post('/api/sample')
    assert r.json['added'] == [] and len(r.json['skipped']) == 30
    assert len(client.get('/api/students').json['students']) == 30


def test_ranking_uses_merge_sort_with_ties(client):
    for roll, name, marks in [(1, 'Asha', 85), (2, 'Bina', 91), (3, 'Chirag', 96), (4, 'Dev', 91), (5, 'Esha', 78)]:
        add(client, roll, name, marks)
    r = client.get('/api/ranking').json
    assert [(s['name'], s['rank']) for s in r['students']] == \
        [('Chirag', 1), ('Bina', 2), ('Dev', 2), ('Asha', 4), ('Esha', 5)]
    assert len(r['original']) == 5
    assert r['statistics'] == {'total': 5, 'highest': 96.0, 'average': 88.2, 'lowest': 78.0}
    assert r['algorithm']['tied_groups'] == 1 and r['algorithm']['comparisons'] > 0


def test_ranking_empty(client):
    r = client.get('/api/ranking').json
    assert r['students'] == [] and r['statistics']['total'] == 0


def test_statistics_endpoint(client):
    add(client, 1, 'Asha', 40)
    add(client, 2, 'Bina', 60)
    assert client.get('/api/statistics').json == {'total': 2, 'highest': 60.0, 'average': 50.0, 'lowest': 40.0}


def test_clear_all(client):
    client.post('/api/sample')
    r = client.delete('/api/students')
    assert r.status_code == 200 and r.json['deleted'] == 30
    assert client.get('/api/students').json['students'] == []


def test_inline_rank(client):
    r = client.post('/api/rank', json={'students': [{'roll': 1, 'name': 'A', 'marks': 50},
                                                    {'roll': 2, 'name': 'B', 'marks': 70}]})
    assert [s['rank'] for s in r.json['students']] == [1, 2]
    assert client.post('/api/rank', json={'students': [{'roll': 1, 'name': 'A', 'marks': 500}]}).status_code == 400


def test_performance_single_and_compare(client):
    r = client.post('/api/performance', json={'size': 1000}).json
    assert r['size'] == 1000 and r['sort_correct'] and r['execution_time_ms'] > 0

    r = client.post('/api/performance', json={'sizes': [50, 200], 'algorithms': ['merge', 'bubble', 'insertion', 'selection'],
                                              'order': 'reverse'}).json
    for row in r['results']:
        for key, res in row['results'].items():
            assert res['sort_correct'], key
    big = client.post('/api/performance', json={'sizes': [6000], 'algorithms': ['merge', 'bubble']}).json
    assert big['results'][0]['results']['bubble']['skipped'] is True


@pytest.mark.parametrize('body', [{'size': 0}, {'size': -5}, {'size': 'x'}, {'size': True}, {'size': 10**7},
                                  {'sizes': []}, {'sizes': [10], 'algorithms': ['quick']},
                                  {'sizes': [10], 'order': 'weird'}, {}])
def test_performance_rejects_bad_input(client, body):
    assert client.post('/api/performance', json=body).status_code == 400


def test_visualize(client):
    r = client.post('/api/visualize', json={'marks': [96, 72, 91, 85]}).json
    assert [s['marks'] for s in r['sorted']] == [96, 91, 85, 72]
    assert r['steps'][0]['type'] == 'divide'
    assert client.post('/api/visualize', json={'marks': [1]}).status_code == 400
    assert client.post('/api/visualize', json={'marks': [1, 200]}).status_code == 400
    assert client.post('/api/visualize', json={'marks': list(range(17))}).status_code == 400
    r = client.post('/api/visualize', json={'students': [{'roll': 1, 'name': 'Asha', 'marks': 80},
                                                         {'roll': 2, 'name': 'Bina', 'marks': 80}]}).json
    assert [s['rank'] for s in r['sorted']] == [1, 1]


def test_old_table_is_migrated(app):
    """A students table created by the original version (no updated_at) is upgraded automatically."""
    import database
    from models import db
    from sqlalchemy import text, inspect
    with app.app_context():
        db.session.execute(text('DROP TABLE students'))
        db.session.execute(text('CREATE TABLE students (id SERIAL PRIMARY KEY, roll_no INTEGER UNIQUE NOT NULL, '
                                'name VARCHAR(100) NOT NULL, marks FLOAT NOT NULL, created_at TIMESTAMP)'))
        db.session.commit()
        database._state['ready'] = False
        assert database.ensure_tables(force=True)
        assert 'updated_at' in [c['name'] for c in inspect(db.engine).get_columns('students')]


def test_friendly_database_errors():
    from database import describe_db_error
    assert 'username or password' in describe_db_error(Exception('FATAL: password authentication failed for user "postgres"'))
    assert 'does not exist' in describe_db_error(Exception('FATAL: database "student_ranking" does not exist'))
    assert 'service is running' in describe_db_error(Exception('connection refused'))
