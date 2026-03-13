"""
Blueprint: Contenido
Rutas: /api/textos, /api/guiones, /api/ideas
Tablas: textos, guiones, ideas
"""
import uuid
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('contenido', __name__)


# ── TEXTOS ──

@bp.route('/api/textos', methods=['GET'])
def listar_textos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'textos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM textos WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'textos': rows})
    except:
        return jsonify({'textos': []})

@bp.route('/api/textos', methods=['POST'])
def crear_texto():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        tid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO textos (id, user_id, titulo, contenido, tipo, categoria)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, contenido=EXCLUDED.contenido,
                tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria
        """, (tid, user['id'], data.get('titulo',''), data.get('contenido',''),
              data.get('tipo','whatsapp'), data.get('categoria','general')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': tid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/textos/<tid>', methods=['PUT'])
def actualizar_texto(tid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE textos SET titulo=%s, contenido=%s, tipo=%s, categoria=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('contenido',''),
              data.get('tipo','whatsapp'), data.get('categoria','general'), tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/textos/<tid>', methods=['DELETE'])
def eliminar_texto(tid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM textos WHERE id=%s AND user_id=%s", (tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── GUIONES ──

@bp.route('/api/guiones', methods=['GET'])
def listar_guiones():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'guiones': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM guiones WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'guiones': rows})
    except:
        return jsonify({'guiones': []})

@bp.route('/api/guiones', methods=['POST'])
def crear_guion():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        gid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO guiones (id, user_id, titulo, hook, desarrollo, cta, grabado, fecha_grabacion, tema)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, hook=EXCLUDED.hook, desarrollo=EXCLUDED.desarrollo,
                cta=EXCLUDED.cta, grabado=EXCLUDED.grabado,
                fecha_grabacion=EXCLUDED.fecha_grabacion, tema=EXCLUDED.tema
        """, (gid, user['id'], data.get('titulo',''), data.get('hook',''),
              data.get('desarrollo',''), data.get('cta',''),
              data.get('grabado', False), data.get('fecha_grabacion',''), data.get('tema','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': gid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/guiones/<gid>', methods=['PUT'])
def actualizar_guion(gid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE guiones SET titulo=%s, hook=%s, desarrollo=%s, cta=%s,
                grabado=%s, fecha_grabacion=%s, tema=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('hook',''), data.get('desarrollo',''),
              data.get('cta',''), data.get('grabado', False), data.get('fecha_grabacion',''),
              data.get('tema',''), gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/guiones/<gid>', methods=['DELETE'])
def eliminar_guion(gid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM guiones WHERE id=%s AND user_id=%s", (gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── IDEAS ──

@bp.route('/api/ideas', methods=['GET'])
def listar_ideas():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'ideas': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM ideas WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'ideas': rows})
    except:
        return jsonify({'ideas': []})

@bp.route('/api/ideas', methods=['POST'])
def crear_idea():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        iid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ideas (id, user_id, texto, estado)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET texto=EXCLUDED.texto, estado=EXCLUDED.estado
        """, (iid, user['id'], data.get('texto',''), data.get('estado','pendiente')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': iid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/ideas/<iid>', methods=['PUT'])
def actualizar_idea(iid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("UPDATE ideas SET texto=%s, estado=%s WHERE id=%s AND user_id=%s",
            (data.get('texto',''), data.get('estado','pendiente'), iid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/ideas/<iid>', methods=['DELETE'])
def eliminar_idea(iid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM ideas WHERE id=%s AND user_id=%s", (iid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
