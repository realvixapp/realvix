"""
Blueprint: Cierres
Rutas: /api/cierres, /api/gastos
Tablas: cierres, gastos
"""
import uuid
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('cierres', __name__)


# ── CIERRES ──

@bp.route('/api/cierres', methods=['GET'])
def listar_cierres():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'cierres': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM cierres WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'cierres': rows})
    except:
        return jsonify({'cierres': []})

@bp.route('/api/cierres', methods=['POST'])
def crear_cierre():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cierres (id, user_id, propiedad, propiedad_id, comprador, vendedor,
                valor_operacion, moneda, comision_pct, comision_bruta, comision_neta, fecha, tipo, notas)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                propiedad=EXCLUDED.propiedad, propiedad_id=EXCLUDED.propiedad_id,
                comprador=EXCLUDED.comprador, vendedor=EXCLUDED.vendedor,
                valor_operacion=EXCLUDED.valor_operacion, moneda=EXCLUDED.moneda,
                comision_pct=EXCLUDED.comision_pct, comision_bruta=EXCLUDED.comision_bruta,
                comision_neta=EXCLUDED.comision_neta, fecha=EXCLUDED.fecha,
                tipo=EXCLUDED.tipo, notas=EXCLUDED.notas
        """, (cid, user['id'], data.get('propiedad',''), data.get('propiedad_id',''),
              data.get('comprador',''), data.get('vendedor',''),
              data.get('valor_operacion',0), data.get('moneda','USD'),
              data.get('comision_pct',3), data.get('comision_bruta',0),
              data.get('comision_neta',0), data.get('fecha',''),
              data.get('tipo','venta'), data.get('notas','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': cid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/cierres/<cid>', methods=['PUT'])
def actualizar_cierre(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE cierres SET propiedad=%s, propiedad_id=%s, comprador=%s, vendedor=%s,
                valor_operacion=%s, moneda=%s, comision_pct=%s, comision_bruta=%s,
                comision_neta=%s, fecha=%s, tipo=%s, notas=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('propiedad',''), data.get('propiedad_id',''),
              data.get('comprador',''), data.get('vendedor',''),
              data.get('valor_operacion',0), data.get('moneda','USD'),
              data.get('comision_pct',3), data.get('comision_bruta',0),
              data.get('comision_neta',0), data.get('fecha',''),
              data.get('tipo','venta'), data.get('notas',''), cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/cierres/<cid>', methods=['DELETE'])
def eliminar_cierre(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM cierres WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── GASTOS DEL NEGOCIO (NUEVO) ──

@bp.route('/api/gastos', methods=['GET'])
def listar_gastos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'gastos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM gastos WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'gastos': rows})
    except:
        return jsonify({'gastos': []})

@bp.route('/api/gastos', methods=['POST'])
def crear_gasto():
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
            INSERT INTO gastos (id, user_id, descripcion, monto, moneda, tipo, categoria, proveedor, fecha, notas)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                descripcion=EXCLUDED.descripcion, monto=EXCLUDED.monto, moneda=EXCLUDED.moneda,
                tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria, proveedor=EXCLUDED.proveedor,
                fecha=EXCLUDED.fecha, notas=EXCLUDED.notas
        """, (gid, user['id'], data.get('descripcion',''), data.get('monto',0),
              data.get('moneda','ARS'), data.get('tipo','egreso'), data.get('categoria','general'),
              data.get('proveedor',''), data.get('fecha',''), data.get('notas','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': gid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/gastos/<gid>', methods=['PUT'])
def actualizar_gasto(gid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE gastos SET descripcion=%s, monto=%s, moneda=%s, tipo=%s,
                categoria=%s, proveedor=%s, fecha=%s, notas=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('descripcion',''), data.get('monto',0), data.get('moneda','ARS'),
              data.get('tipo','egreso'), data.get('categoria','general'),
              data.get('proveedor',''), data.get('fecha',''), data.get('notas',''),
              gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/gastos/<gid>', methods=['DELETE'])
def eliminar_gasto(gid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM gastos WHERE id=%s AND user_id=%s", (gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
