"""
Blueprint: Métricas
Rutas: /api/objetivos, /api/planilla
Tablas: objetivos, planilla
"""
import uuid, json
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('metricas', __name__)


@bp.route('/api/objetivos', methods=['GET'])
def get_objetivos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'objetivos': {}})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM objetivos WHERE user_id=%s", (user['id'],))
        row = cur.fetchone(); cur.close(); conn.close()
        return jsonify({'objetivos': row['data'] if row else {}})
    except:
        return jsonify({'objetivos': {}})

@bp.route('/api/objetivos', methods=['POST'])
def guardar_objetivos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        oid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO objetivos (id, user_id, data) VALUES (%s,%s,%s)
            ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
        """, (oid, user['id'], json.dumps(data.get('data', data))))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/planilla', methods=['GET'])
def get_planilla():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'planilla': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM planilla WHERE user_id=%s", (user['id'],))
        row = cur.fetchone(); cur.close(); conn.close()
        return jsonify({'planilla': row['data'] if row else []})
    except:
        return jsonify({'planilla': []})

@bp.route('/api/planilla', methods=['POST'])
def guardar_planilla():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        pid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO planilla (id, user_id, data) VALUES (%s,%s,%s)
            ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
        """, (pid, user['id'], json.dumps(data.get('data', data))))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
