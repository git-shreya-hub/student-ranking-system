"""
Flask Backend for Student Marks Sorting and Ranking System
================================================================
PostgreSQL-backed REST API with Manual Merge Sort

Architecture:
    Frontend → Flask REST API → SQLAlchemy → PostgreSQL
    Frontend → Flask REST API → Manual Merge Sort → Rankings

All sorting is done manually via merge_sort().
No SQL ORDER BY or built-in sorting is used for ranking.

The same Flask server also serves the frontend, so the whole application
runs from one command (run.bat) at http://127.0.0.1:5000
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.exceptions import HTTPException
import os, sys, json, math, time, random, re, threading, webbrowser

# Add the backend directory to path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from database import (init_db, ensure_tables, db_state, test_connection,
                      describe_db_error, masked_url, USING_DEFAULT_URL)
from models import Student, db
from merge_sort import (merge_sort, generate_ranks, count_tied_groups, SortStats,
                        get_statistics as calc_stats)
from sorting_algorithms import ALGORITHMS, is_sorted_descending

FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, '..', 'frontend'))
SAMPLE_FILE = os.path.join(BACKEND_DIR, 'data', 'students.json')

# Limits that keep the demo responsive
MAX_ROLL = 2147483647          # PostgreSQL INTEGER maximum
MAX_NAME_LENGTH = 100
MAX_PERF_SIZE = 100000         # Merge Sort
MAX_VIZ_VALUES = 16
NAME_PATTERN = re.compile(r"^[^\W\d_]+(?:(?:[.'\-] ?| )[^\W\d_]+)*\.?$", re.UNICODE)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.json.sort_keys = False  # keep response keys in the order we write them
CORS(app)  # Allows the frontend to also be opened from Live Server / file://

# Initialize database (does not crash if PostgreSQL is not reachable yet)
init_db(app)


# ==================== HELPER FUNCTIONS ====================

def error_response(message, status=400, field=None, **extra):
    body = {'error': message}
    if field:
        body['field'] = field
    body.update(extra)
    return jsonify(body), status


def get_json_body():
    """Return the parsed JSON body, or None if it is missing/invalid."""
    return request.get_json(silent=True)


def student_to_dict(student_obj):
    """Convert SQLAlchemy Student object to dictionary."""
    return student_obj.to_dict()


def _parse_number(value):
    """Accept ints/floats and numeric strings, but never booleans."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def validate_student_data(data):
    """
    Validate and clean student input data.
    Returns (clean_data, error_message, field).
    """
    if not isinstance(data, dict):
        return None, 'Request body must be a JSON object with roll, name and marks', None

    # Roll number: whole number, 1 .. 2147483647
    roll = _parse_number(data.get('roll'))
    if roll is None:
        return None, 'Roll number is required and must be a number', 'roll'
    if isinstance(roll, float) and (math.isnan(roll) or not roll.is_integer()):
        return None, 'Roll number must be a whole number', 'roll'
    roll = int(roll)
    if roll < 1 or roll > MAX_ROLL:
        return None, 'Roll number must be a positive whole number', 'roll'

    # Name: letters with single spaces, dots, apostrophes or hyphens
    name = data.get('name')
    if not isinstance(name, str) or not name.strip():
        return None, 'Name is required and cannot be empty', 'name'
    name = ' '.join(name.split())
    if len(name) > MAX_NAME_LENGTH:
        return None, f'Name must be at most {MAX_NAME_LENGTH} characters', 'name'
    if not NAME_PATTERN.match(name):
        return None, "Name may contain only letters, spaces, dots, apostrophes and hyphens", 'name'

    # Marks: number between 0 and 100, at most 2 decimal places
    marks = _parse_number(data.get('marks'))
    if marks is None or (isinstance(marks, float) and math.isnan(marks)):
        return None, 'Marks is required and must be a number', 'marks'
    if marks < 0 or marks > 100:
        return None, 'Marks must be between 0 and 100', 'marks'
    marks = round(float(marks), 2)

    return {'roll': roll, 'name': name, 'marks': marks}, None, None


def commit_or_error():
    """Commit the session. On failure roll back and return an error response."""
    try:
        db.session.commit()
        return None
    except IntegrityError as exc:
        db.session.rollback()
        if 'roll' in str(exc.orig).lower() or 'unique' in str(exc.orig).lower():
            return error_response('Roll number already exists', 409, 'roll')
        return error_response('The record breaks a database rule (marks 0-100, roll > 0)', 400)
    except SQLAlchemyError as exc:
        db.session.rollback()
        return error_response(describe_db_error(exc), 503)


def load_sample_records():
    with open(SAMPLE_FILE, encoding='utf-8') as f:
        return json.load(f)


def fetch_all_students():
    """
    Read every student from PostgreSQL.
    NOTE: No ORDER BY. PostgreSQL only stores and returns the records;
    all ordering for ranking is done by merge_sort().
    """
    return [student_to_dict(s) for s in Student.query.all()]


def rank_records(records):
    """Run the manual Merge Sort, then competition ranking. Returns a response dict."""
    stats = SortStats()
    start = time.perf_counter()
    sorted_students = merge_sort(records, stats=stats)
    elapsed_ms = (time.perf_counter() - start) * 1000

    ranked = generate_ranks(sorted_students)
    n = len(records)
    return {
        'students': ranked,
        'original': records,                     # "before sorting" order
        'statistics': calc_stats(records),
        'algorithm': {
            'name': 'Merge Sort (manual, divide and conquer)',
            'n': n,
            'comparisons': stats.comparisons,
            'moves': stats.moves,
            'recursion_depth': stats.max_depth,
            'n_log2_n': round(n * math.log2(n), 1) if n > 1 else 0,
            'execution_time_ms': round(elapsed_ms, 4),
            'tied_groups': count_tied_groups(ranked)
        }
    }


def make_dataset(size, order='random', seed=42):
    """Generate random student records in memory (never stored in PostgreSQL)."""
    rng = random.Random(seed)   # local generator: does not disturb global random state
    records = [{'roll': 1000 + i, 'name': f'Student {i}', 'marks': rng.randint(0, 100)}
               for i in range(size)]
    if order in ('sorted', 'reverse'):
        # Build an already-ordered dataset with the manual merge sort itself
        records = merge_sort(records)
        if order == 'reverse':
            records = records[::-1]
    return records


# ==================== ERROR HANDLING ====================

@app.before_request
def require_database():
    """Return a clear 503 for API calls while PostgreSQL is unavailable."""
    path = request.path
    if not path.startswith('/api') or path in ('/api', '/api/', '/api/health'):
        return None
    # These endpoints never touch the database
    if path in ('/api/performance', '/api/visualize', '/api/rank', '/api/algorithms'):
        return None
    if not ensure_tables():
        return error_response(db_state()['error'] or 'Database is not available', 503,
                              database='disconnected')
    return None


@app.errorhandler(HTTPException)
def handle_http_error(e):
    if not request.path.startswith('/api'):
        return e
    messages = {
        404: 'Endpoint not found',
        405: f'Method {request.method} is not allowed for {request.path}',
        415: 'Request body must be JSON (Content-Type: application/json)'
    }
    return error_response(messages.get(e.code, e.description), e.code)


@app.errorhandler(OperationalError)
def handle_db_down(e):
    db.session.rollback()
    return error_response(describe_db_error(e), 503, database='disconnected')


@app.errorhandler(Exception)
def handle_unexpected(e):
    db.session.rollback()
    app.logger.exception('Unhandled error')
    return error_response(f'Internal server error: {type(e).__name__}', 500)


# ==================== FRONTEND ====================

@app.route('/', methods=['GET'])
def home():
    """Serve the frontend."""
    return send_from_directory(FRONTEND_DIR, 'index.html')


# ==================== API ENDPOINTS ====================

@app.route('/api', methods=['GET'])
def api_info():
    """API information."""
    connected, _ = test_connection()
    return jsonify({
        'message': 'Student Marks Sorting & Ranking System',
        'status': 'Running',
        'algorithm': 'Merge Sort (Manual Implementation)',
        'database': 'connected' if connected else 'disconnected'
    }), 200


@app.route('/api/health', methods=['GET'])
def health():
    """Health check - returns database connection status."""
    connected, error = test_connection()
    if connected:
        ready = ensure_tables(force=True)
        error = None if ready else db_state()['error']
        connected = ready
    return jsonify({
        'status': 'ok' if connected else 'error',
        'database': 'connected' if connected else 'disconnected',
        'database_url': masked_url(),
        'message': error,
        'using_default_url': USING_DEFAULT_URL
    }), 200 if connected else 503


@app.route('/api/students', methods=['GET'])
def get_students():
    """GET /api/students - Return all students from PostgreSQL."""
    return jsonify({'students': fetch_all_students()}), 200


@app.route('/api/students', methods=['POST'])
def add_student():
    """POST /api/students - Add a new student."""
    clean, error_msg, field = validate_student_data(get_json_body())
    if error_msg:
        return error_response(error_msg, 400, field)

    # Check for duplicate roll number
    existing = Student.query.filter_by(roll_no=clean['roll']).first()
    if existing:
        return error_response(f"Roll number {clean['roll']} already belongs to {existing.name}", 409, 'roll')

    new_student = Student(roll_no=clean['roll'], name=clean['name'], marks=clean['marks'])
    db.session.add(new_student)
    failed = commit_or_error()
    if failed:
        return failed

    return jsonify({'message': f"{new_student.name} added successfully",
                    'student': student_to_dict(new_student)}), 201


@app.route('/api/students/<int:id>', methods=['PUT'])
def update_student(id):
    """PUT /api/students/<id> - Update a student."""
    student = db.session.get(Student, id)
    if not student:
        return error_response('Student not found. It may have been deleted; refresh the list.', 404)

    clean, error_msg, field = validate_student_data(get_json_body())
    if error_msg:
        return error_response(error_msg, 400, field)

    # Check for duplicate roll number (excluding current student)
    existing = Student.query.filter(Student.roll_no == clean['roll'], Student.id != id).first()
    if existing:
        return error_response(f"Roll number {clean['roll']} already belongs to {existing.name}", 409, 'roll')

    student.roll_no = clean['roll']
    student.name = clean['name']
    student.marks = clean['marks']
    failed = commit_or_error()
    if failed:
        return failed

    return jsonify({'message': f"{student.name} updated successfully",
                    'student': student_to_dict(student)}), 200


@app.route('/api/students/<int:id>', methods=['DELETE'])
def delete_student(id):
    """DELETE /api/students/<id> - Delete a student."""
    student = db.session.get(Student, id)
    if not student:
        return error_response('Student not found. It may have already been deleted.', 404)

    name = student.name
    db.session.delete(student)
    failed = commit_or_error()
    if failed:
        return failed

    return jsonify({'message': f'{name} deleted successfully'}), 200


@app.route('/api/students', methods=['DELETE'])
def delete_all_students():
    """DELETE /api/students - Delete all students."""
    deleted = Student.query.delete()
    failed = commit_or_error()
    if failed:
        return failed
    return jsonify({'message': f'All {deleted} students deleted', 'deleted': deleted}), 200


@app.route('/api/sample', methods=['POST', 'GET'])
def load_sample():
    """POST /api/sample - Load the sample class from data/students.json into PostgreSQL.
    Does not duplicate existing roll numbers. (GET kept for backward compatibility.)"""
    try:
        sample_data = load_sample_records()
    except (OSError, ValueError) as exc:
        return error_response(f'Could not read sample data file: {exc}', 500)

    existing_rolls = set(s.roll_no for s in Student.query.all())
    added, skipped = [], []

    for data in sample_data:
        clean, error_msg, _ = validate_student_data(data)
        if error_msg or clean['roll'] in existing_rolls:
            skipped.append(data.get('roll'))
            continue
        db.session.add(Student(roll_no=clean['roll'], name=clean['name'], marks=clean['marks']))
        existing_rolls.add(clean['roll'])
        added.append(clean['roll'])

    failed = commit_or_error()
    if failed:
        return failed

    return jsonify({
        'message': f'Sample data loaded: {len(added)} added, {len(skipped)} already present',
        'added': added,
        'skipped': skipped,
        'students': fetch_all_students()
    }), 200


@app.route('/api/ranking', methods=['GET'])
def get_ranking():
    """GET /api/ranking - Fetch students from PostgreSQL, sort using manual Merge Sort,
    generate competition ranks, and return the ranking.

    IMPORTANT: Uses manual Merge Sort, NOT SQL ORDER BY.
    """
    return jsonify(rank_records(fetch_all_students())), 200


@app.route('/api/rank', methods=['POST'])
def rank_students():
    """POST /api/rank - Accept student records, sort using Merge Sort, assign ranks.
    Nothing is stored. Useful for testing the algorithm with custom input.
    """
    data = get_json_body()
    if not data or 'students' not in data:
        return error_response('Invalid input. Expected {"students": [{"roll", "name", "marks"}, ...]}')

    students = data['students']
    if not isinstance(students, list):
        return error_response('"students" must be a list')
    if len(students) > MAX_PERF_SIZE:
        return error_response(f'At most {MAX_PERF_SIZE} students can be ranked at once')

    cleaned = []
    for i, s in enumerate(students):
        clean, error_msg, _ = validate_student_data(s)
        if error_msg:
            return error_response(f'Student at index {i}: {error_msg}')
        cleaned.append(clean)

    return jsonify(rank_records(cleaned)), 200


@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """GET /api/statistics - Return database statistics (same keys as /api/ranking)."""
    return jsonify(calc_stats(fetch_all_students())), 200


@app.route('/api/algorithms', methods=['GET'])
def list_algorithms():
    """GET /api/algorithms - Theoretical complexity of each implemented algorithm."""
    return jsonify({'algorithms': [
        {'key': key, 'name': a['name'], 'best': a['best'], 'average': a['average'],
         'worst': a['worst'], 'space': a['space'], 'max_size': a['max_size']}
        for key, a in ALGORITHMS.items()
    ]}), 200


@app.route('/api/performance', methods=['POST'])
def performance_test():
    """POST /api/performance - Measure sorting time on in-memory datasets.

    Input (single, backward compatible):  {"size": 1000}
    Input (comparison):
        {"sizes": [100, 500, 1000], "algorithms": ["merge", "insertion", "selection", "bubble"],
         "order": "random" | "sorted" | "reverse"}

    Every algorithm sorts an identical copy of the same dataset. Records are generated
    in memory only (not inserted into PostgreSQL), so only the sort itself is timed.
    """
    data = get_json_body()
    if not isinstance(data, dict):
        return error_response('Invalid input. Expected {"size": 1000} or {"sizes": [...]}')

    single = 'size' in data and 'sizes' not in data
    sizes = [data['size']] if single else data.get('sizes')
    algorithms = ['merge'] if single else data.get('algorithms', ['merge'])
    order = data.get('order', 'random')

    if not isinstance(sizes, list) or not sizes or len(sizes) > 10:
        return error_response('Provide 1 to 10 dataset sizes')
    for size in sizes:
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            return error_response('Size must be a positive integer')
        if size > MAX_PERF_SIZE:
            return error_response(f'Size must be at most {MAX_PERF_SIZE:,}')
    if not isinstance(algorithms, list) or not algorithms:
        return error_response('Provide at least one algorithm')
    for key in algorithms:
        if key not in ALGORITHMS:
            return error_response(f'Unknown algorithm "{key}". Use: {", ".join(ALGORITHMS)}')
    if order not in ('random', 'sorted', 'reverse'):
        return error_response('Order must be random, sorted or reverse')

    results = []
    for size in sizes:
        dataset = make_dataset(size, order)
        row = {'size': size, 'n_log2_n': round(size * math.log2(size), 1) if size > 1 else 0,
               'n_squared': size * size, 'results': {}}
        for key in algorithms:
            algo = ALGORITHMS[key]
            if size > algo['max_size']:
                row['results'][key] = {'skipped': True,
                                       'reason': f"{algo['name']} is O(n²); limited to n ≤ {algo['max_size']:,} to keep the demo responsive"}
                continue
            # Small inputs finish in microseconds; take the best of a few runs
            runs = 3 if size <= 2000 else 1
            best_ms, stats, output = None, None, None
            for _ in range(runs):
                run_stats = SortStats()
                start = time.perf_counter()
                output = algo['function'](dataset, run_stats)
                ms = (time.perf_counter() - start) * 1000
                if best_ms is None or ms < best_ms:
                    best_ms, stats = ms, run_stats
            row['results'][key] = {
                'execution_time_ms': round(best_ms, 4),
                'comparisons': stats.comparisons,
                'moves': stats.moves,
                'sort_correct': is_sorted_descending(output)
            }
        results.append(row)

    if single:
        r = results[0]['results']['merge']
        return jsonify({'size': sizes[0], 'execution_time_ms': r['execution_time_ms'],
                        'comparisons': r['comparisons'], 'sort_correct': r['sort_correct']}), 200
    return jsonify({'order': order, 'algorithms': algorithms, 'results': results}), 200


@app.route('/api/visualize', methods=['POST'])
def visualize():
    """POST /api/visualize - Step-by-step trace of the SAME merge_sort() used for ranking.

    Input: {"marks": [96, 72, 91, 85]}  or  {"students": [{"roll","name","marks"}, ...]}
    """
    data = get_json_body()
    if not isinstance(data, dict):
        return error_response('Expected {"marks": [..]} or {"students": [..]}')

    if 'students' in data:
        raw = data['students']
        if not isinstance(raw, list):
            return error_response('"students" must be a list')
        records = []
        for i, s in enumerate(raw):
            clean, error_msg, _ = validate_student_data(s)
            if error_msg:
                return error_response(f'Student at index {i}: {error_msg}')
            records.append(clean)
    else:
        marks = data.get('marks')
        if not isinstance(marks, list):
            return error_response('Enter marks separated by commas, e.g. 96, 72, 91, 85')
        records = []
        for i, m in enumerate(marks):
            value = _parse_number(m)
            if value is None or value < 0 or value > 100:
                return error_response(f'"{m}" is not a valid mark (0-100)')
            records.append({'roll': i + 1, 'name': f'S{i + 1}', 'marks': round(float(value), 2)})

    if len(records) < 2 or len(records) > MAX_VIZ_VALUES:
        return error_response(f'Enter between 2 and {MAX_VIZ_VALUES} values to visualize')

    trace = []
    stats = SortStats()
    sorted_records = merge_sort(records, stats=stats, trace=trace)
    ranked = generate_ranks(sorted_records)
    return jsonify({
        'input': records,
        'steps': trace,
        'sorted': ranked,
        'stats': stats.to_dict(),
        'n': len(records)
    }), 200


# ==================== RUN ====================

def open_browser(url):
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    url = f'http://127.0.0.1:{port}'
    state = db_state()
    print("=" * 64)
    print(" Student Marks Sorting & Ranking System")
    print(f" Open:      {url}")
    print(f" Database:  {masked_url()}")
    print(f" DB status: {'connected' if state['ready'] else 'NOT CONNECTED'}")
    if not state['ready']:
        print(f"   -> {state['error']}")
    print(" Algorithm: Merge Sort (Manual Implementation)")
    print(" Press Ctrl+C to stop the server.")
    print("=" * 64)
    if os.getenv('OPEN_BROWSER') == '1' and not os.getenv('WERKZEUG_RUN_MAIN'):
        open_browser(url)
    app.run(debug=debug, host='127.0.0.1', port=port)
