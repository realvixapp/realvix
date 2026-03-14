"""
appfirma/app.py — Blueprint de Firma Electrónica con Brevo
"""

import os
import json
import uuid
import traceback
import base64
import urllib.request
import urllib.error
from datetime import datetime
from functools import wraps

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import (Blueprint, request, jsonify, render_template,
                   redirect, url_for, Response)

# ── template_folder apunta a appfirma/templates/ ──
bp = Blueprint('firma', __name__,
               template_folder='templates',
               static_folder='static/js',
               static_url_path='/static/firma')

# ══════════════════════════════════════════
#  DB helpers
# ══════════════════════════════════════════

def _get_conn():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        return None
    try:
        return psycopg2.connect(url)
    except Exception as e:
        print(f"[FIRMA][DB] connect: {e}")
        return None


def _exec(sql, params=None):
    conn = _get_conn()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[FIRMA][DB] exec error: {e}")
        try:
            conn.rollback()
            conn.close()
        except:
            pass
        return False


def _query(sql, params=None, one=False):
    conn = _get_conn()
    if not conn:
        return None if one else []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return rows[0] if (one and rows) else (None if one else rows)
    except Exception as e:
        print(f"[FIRMA][DB] query error: {e}")
        return None if one else []


def _ensure_table():
    _exec("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)


# ══════════════════════════════════════════
#  AUTH helper
# ══════════════════════════════════════════

def _get_current_user():
    token = request.cookies.get('auth_token')
    if not token:
        return None
    row = _query(
        "SELECT user_id FROM user_sessions WHERE token=%s AND expires_at>NOW()",
        (token,), one=True
    )
    if not row:
        return None
    return _query("SELECT * FROM users WHERE id=%s", (row['user_id'],), one=True)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _get_current_user():
            return redirect(url_for('login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated


# ══════════════════════════════════════════
#  EMAIL — Brevo API
# ══════════════════════════════════════════

def _send_email(to_email, subject, html_body, attachments=None):
    api_key = os.environ.get('BREVO_API_KEY', '')
    if not api_key:
        print("[FIRMA][EMAIL] BREVO_API_KEY no configurada.")
        return False

    from_email = os.environ.get('SMTP_FROM', 'no-reply@realvix.com')

    payload = {
        "sender":      {"name": "Realvix CRM", "email": from_email},
        "to":          [{"email": to_email}],
        "subject":     subject,
        "htmlContent": html_body,
    }

    if attachments:
        payload["attachment"] = [
            {"name": att["filename"], "content": base64.b64encode(att["data"]).decode("utf-8")}
            for att in attachments
        ]

    body = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=body,
        headers={
            "api-key":      api_key,
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"[FIRMA][EMAIL] ✓ Enviado a {to_email} (status {resp.status})")
            return True
    except urllib.error.HTTPError as e:
        print(f"[FIRMA][EMAIL] ✗ HTTP {e.code} a {to_email}: {e.read().decode()}")
        return False
    except Exception as e:
        print(f"[FIRMA][EMAIL] ✗ Error a {to_email}: {e}")
        return False


def _base_url():
    return os.environ.get('BASE_URL', request.host_url.rstrip('/'))


# ══════════════════════════════════════════
#  TEMPLATES DE EMAIL
# ══════════════════════════════════════════

def _email_invitacion(doc_title, organizer_name, firmante_name, sign_url):
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8">
<style>
body{{font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f0;margin:0;padding:0;}}
.wrap{{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden;}}
.header{{background:#0f0f0f;color:#fff;padding:28px 32px;}}
.logo{{font-size:1.5rem;font-weight:700;}}.logo span{{color:#c9a84c;}}
.body{{padding:32px;color:#333;line-height:1.6;}}
.doc-box{{background:#f8f6f1;border:1px solid #e0dbd0;border-radius:8px;padding:16px 18px;margin:20px 0;}}
.btn-wrap{{text-align:center;margin:28px 0 16px;}}
.btn{{display:inline-block;background:#1B3FE4;color:#fff!important;text-decoration:none!important;padding:14px 36px;border-radius:8px;font-size:0.95rem;font-weight:700;}}
.note{{font-size:0.78rem;color:#999;margin-top:20px;line-height:1.5;}}
.url{{word-break:break-all;font-size:0.75rem;color:#1B3FE4;margin-top:8px;}}
.footer{{background:#f8f6f1;border-top:1px solid #e8e4dc;padding:16px 32px;font-size:0.74rem;color:#aaa;text-align:center;}}
</style></head>
<body><div class="wrap">
<div class="header"><div class="logo">Firma<span>Doc</span></div></div>
<div class="body">
<h2 style="font-size:1.15rem;color:#111;margin-bottom:12px;">Hola{(' ' + firmante_name) if firmante_name else ''} 👋</h2>
<p><strong>{organizer_name or 'Un organizador'}</strong> te solicita que firmes el siguiente documento:</p>
<div class="doc-box"><strong>📄 {doc_title}</strong><p style="font-size:0.82rem;color:#666;margin:4px 0 0;">Podés revisar el contenido antes de firmar desde el link.</p></div>
<p>Hacé clic en el botón para acceder a la página de firma segura:</p>
<div class="btn-wrap"><a href="{sign_url}" class="btn">✍️ Firmar documento</a></div>
<div class="note">Si el botón no funciona, copiá y pegá este link:<br><span class="url">{sign_url}</span></div>
<div class="note">Este link es personal e intransferible. Si no esperabas este email, ignoralo.</div>
</div>
<div class="footer">Realvix CRM · Firma Electrónica</div>
</div></body></html>"""


def _email_certificado(doc_title, destinatario_name, all_signers):
    firmantes_html = ''.join(
        f'<li style="padding:4px 0;"><strong>{s.get("name") or s.get("email","")}</strong> — {s.get("email","")} <span style="color:#2d6a4f;">✅ Firmado</span></li>'
        for s in all_signers
    )
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8">
<style>
body{{font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f0;margin:0;padding:0;}}
.wrap{{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden;}}
.header{{background:#0f0f0f;color:#fff;padding:28px 32px;}}
.logo{{font-size:1.5rem;font-weight:700;}}.logo span{{color:#c9a84c;}}
.body{{padding:32px;color:#333;line-height:1.6;}}
.success{{background:#f0faf4;border:1px solid #a7f3d0;border-radius:8px;padding:18px 20px;margin:20px 0;text-align:center;}}
.success h2{{color:#065F46;font-size:1.1rem;margin:8px 0 4px;}}
ul{{padding-left:16px;font-size:0.86rem;color:#555;}}
.footer{{background:#f8f6f1;border-top:1px solid #e8e4dc;padding:16px 32px;font-size:0.74rem;color:#aaa;text-align:center;}}
</style></head>
<body><div class="wrap">
<div class="header"><div class="logo">Firma<span>Doc</span></div></div>
<div class="body">
<p>Hola{(' ' + destinatario_name) if destinatario_name else ''} 👋</p>
<div class="success">
<div style="font-size:2.5rem;">🎉</div>
<h2>¡El documento fue firmado por todos!</h2>
<p style="font-size:0.88rem;color:#065F46;">"{doc_title}"</p>
</div>
<p>Adjunto encontrás el <strong>certificado PDF</strong> con todas las firmas registradas.</p>
<ul>{firmantes_html}</ul>
</div>
<div class="footer">Realvix CRM · Firma Electrónica</div>
</div></body></html>"""


# ══════════════════════════════════════════
#  PDF CERTIFICADO
# ══════════════════════════════════════════

def _generar_certificado(doc_data):
    try:
        import fitz
        pdf_b64 = doc_data.get('pdf_base64', '')
        if not pdf_b64:
            return _generar_certificado_simple(doc_data)

        pdf_bytes = base64.b64decode(pdf_b64)
        pdf = fitz.open(stream=pdf_bytes, filetype='pdf')

        for f in doc_data.get('firmantes', []):
            if not f.get('signed') or not f.get('signature') or not f.get('sign_zone'):
                continue
            zona     = f['sign_zone']
            page_num = int(zona.get('page', 1)) - 1
            if page_num < 0 or page_num >= len(pdf):
                page_num = 0
            page   = pdf[page_num]
            pw, ph = page.rect.width, page.rect.height
            cw     = zona.get('canvasW', pw) or pw
            ch     = zona.get('canvasH', ph) or ph
            sx, sy = pw / cw, ph / ch
            x0 = zona.get('x', 0) * sx
            y0 = zona.get('y', 0) * sy
            x1 = x0 + zona.get('w', 100) * sx
            y1 = y0 + zona.get('h', 40) * sy
            sig_data = f['signature']
            if sig_data.startswith('data:'):
                sig_data = sig_data.split(',', 1)[1]
            sig_bytes = base64.b64decode(sig_data)
            page.insert_image(fitz.Rect(x0, y0, x1, y1), stream=sig_bytes, keep_proportion=True, overlay=True)
            signed_at = f.get('signed_at', '')
            label = f"{f.get('name') or f.get('email', '')} · {signed_at[:10] if signed_at else ''}"
            page.insert_text(fitz.Point(x0, y1 + 10), label, fontsize=7, color=(0.3, 0.3, 0.3))

        cert_page = pdf.new_page(width=595, height=842)
        _dibujar_pagina_certificado(cert_page, doc_data)
        result = pdf.tobytes(deflate=True)
        pdf.close()
        return result
    except Exception as e:
        print(f"[FIRMA][CERT] Error PyMuPDF: {e}")
        traceback.print_exc()
        return _generar_certificado_simple(doc_data)


def _dibujar_pagina_certificado(page, doc_data):
    try:
        import fitz
        W, H = page.rect.width, page.rect.height
        page.draw_rect(fitz.Rect(0, 0, W, H), color=None, fill=(0.98, 0.97, 0.95))
        page.draw_rect(fitz.Rect(20, 20, W-20, H-20), color=(0.79, 0.66, 0.30), width=2)
        page.insert_text(fitz.Point(W/2 - 120, 70), "CERTIFICADO DE FIRMA", fontsize=20, color=(0.06, 0.06, 0.06))
        page.insert_text(fitz.Point(W/2 - 80, 98), "Firma Electronica - Realvix CRM", fontsize=9, color=(0.5, 0.5, 0.5))
        page.draw_line(fitz.Point(40, 110), fitz.Point(W-40, 110), color=(0.79, 0.66, 0.30), width=1)
        y = 135
        for label, value in [("Documento:", doc_data.get('title', '')),
                              ("Organizador:", doc_data.get('organizer_name', '')),
                              ("Fecha:", doc_data.get('created_at', '')[:10])]:
            page.insert_text(fitz.Point(40, y), label, fontsize=9, color=(0.4, 0.4, 0.4))
            page.insert_text(fitz.Point(130, y), value, fontsize=9, color=(0.1, 0.1, 0.1))
            y += 18
        y += 12
        page.draw_line(fitz.Point(40, y), fitz.Point(W-40, y), color=(0.85, 0.82, 0.78), width=0.5)
        y += 18
        page.insert_text(fitz.Point(40, y), "FIRMANTES", fontsize=10, color=(0.06, 0.06, 0.06))
        y += 20
        for f in doc_data.get('firmantes', []):
            if y > H - 80:
                break
            signed = f.get('signed', False)
            color  = (0.04, 0.37, 0.27) if signed else (0.6, 0.3, 0.0)
            page.insert_text(fitz.Point(40, y), f"{f.get('name') or f.get('email', '')} <{f.get('email', '')}>", fontsize=9, color=(0.1, 0.1, 0.1))
            page.insert_text(fitz.Point(W - 110, y), "Firmado" if signed else "Pendiente", fontsize=9, color=color)
            if signed and f.get('signed_at'):
                y += 13
                page.insert_text(fitz.Point(56, y), f"Fecha: {f['signed_at'][:19]}", fontsize=7.5, color=(0.5, 0.5, 0.5))
            y += 22
        page.draw_line(fitz.Point(40, H-50), fitz.Point(W-40, H-50), color=(0.85, 0.82, 0.78), width=0.5)
        page.insert_text(fitz.Point(40, H-35), "Certificado generado por Realvix CRM.", fontsize=7, color=(0.6, 0.6, 0.6))
    except Exception as e:
        print(f"[FIRMA][CERT] Error dibujando pagina: {e}")


def _generar_certificado_simple(doc_data):
    """Genera el certificado de auditoría con diseño profesional usando ReportLab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                        Table, TableStyle, HRFlowable, Image)
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        import io

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=20*mm, rightMargin=20*mm,
                                topMargin=18*mm, bottomMargin=18*mm)

        # ── Colores ──
        AZUL    = colors.HexColor('#1a3a6b')
        AZUL_L  = colors.HexColor('#e8eef7')
        GRIS    = colors.HexColor('#666666')
        GRIS_L  = colors.HexColor('#f5f5f5')
        VERDE   = colors.HexColor('#2d7a4f')
        VERDE_L = colors.HexColor('#e6f4ec')
        NEGRO   = colors.HexColor('#111111')
        BORDE   = colors.HexColor('#cccccc')

        # ── Estilos ──
        def style(name, **kw):
            return ParagraphStyle(name, **kw)

        s_titulo  = style('tit',  fontSize=18, fontName='Helvetica-Bold',
                          textColor=NEGRO, alignment=TA_CENTER, spaceAfter=4)
        s_sub     = style('sub',  fontSize=13, fontName='Helvetica-Bold',
                          textColor=NEGRO, alignment=TA_CENTER, spaceAfter=2)
        s_ref     = style('ref',  fontSize=9,  fontName='Helvetica-Bold',
                          textColor=NEGRO, spaceAfter=1)
        s_fecha   = style('fec',  fontSize=8,  fontName='Helvetica',
                          textColor=GRIS, spaceAfter=12)
        s_normal  = style('nor',  fontSize=8,  fontName='Helvetica',
                          textColor=NEGRO)
        s_bold    = style('bol',  fontSize=8,  fontName='Helvetica-Bold',
                          textColor=NEGRO)
        s_gris    = style('gri',  fontSize=7.5,fontName='Helvetica',
                          textColor=GRIS)
        s_legal   = style('leg',  fontSize=7,  fontName='Helvetica',
                          textColor=GRIS, leading=10)
        s_footer  = style('foo',  fontSize=7,  fontName='Helvetica',
                          textColor=GRIS, alignment=TA_CENTER)
        s_verde_b = style('veb',  fontSize=8,  fontName='Helvetica-Bold',
                          textColor=VERDE)
        s_header_lbl = style('hlbl', fontSize=7, fontName='Helvetica-Bold',
                             textColor=AZUL)

        story = []

        # ── Cabecera: Logo + CRM ──
        logo_row = Table(
            [[Paragraph('<b><font color="#1a3a6b" size="14">▶ Realvix</font></b>', style('lr', fontSize=14, fontName='Helvetica-Bold', textColor=AZUL)),
              Paragraph('<font color="#888888" size="8">CRM</font>', style('lc', fontSize=8, fontName='Helvetica', textColor=GRIS, alignment=TA_RIGHT))]],
            colWidths=['*', 40*mm]
        )
        logo_row.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(logo_row)
        story.append(HRFlowable(width='100%', thickness=1, color=BORDE, spaceAfter=12))

        # ── Título ──
        story.append(Paragraph('Certificado de Auditoria', s_titulo))
        story.append(Paragraph('de Firma Electronica', s_sub))
        story.append(Spacer(1, 10))
        story.append(HRFlowable(width='100%', thickness=0.5, color=BORDE, spaceAfter=10))

        # ── Ref + Fecha ──
        doc_id    = doc_data.get('doc_id', str(uuid.uuid4()).upper())
        created   = doc_data.get('created_at', '')[:19].replace('T', ' ')
        try:
            dt_obj  = datetime.fromisoformat(doc_data.get('created_at', '')[:19])
            fecha_f = dt_obj.strftime('%d/%m/%Y a las %H:%M:%S')
        except:
            fecha_f = created

        story.append(Paragraph(f'<b>Ref: {doc_id.upper()}</b>', s_ref))
        story.append(Paragraph(f'Emitido el: {fecha_f}', s_fecha))

        # ── Tabla info documento ──
        firmantes  = doc_data.get('firmantes', [])
        firmados   = sum(1 for f in firmantes if f.get('signed'))
        estado_txt = 'Completado' if firmados == len(firmantes) else 'Pendiente'

        info_data = [
            [Paragraph('DOCUMENTO', s_header_lbl), Paragraph(doc_data.get('title', ''), s_normal)],
            [Paragraph('ESTADO',    s_header_lbl), Paragraph(estado_txt, s_normal)],
            [Paragraph('FIRMANTES', s_header_lbl), Paragraph(str(len(firmantes)), s_normal)],
        ]
        info_table = Table(info_data, colWidths=[45*mm, '*'])
        info_table.setStyle(TableStyle([
            ('BACKGROUND',   (0,0), (0,-1), AZUL_L),
            ('BACKGROUND',   (1,0), (1,-1), colors.white),
            ('BOX',          (0,0), (-1,-1), 0.5, BORDE),
            ('INNERGRID',    (0,0), (-1,-1), 0.5, BORDE),
            ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING',   (0,0), (-1,-1), 6),
            ('BOTTOMPADDING',(0,0), (-1,-1), 6),
            ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 14))

        # ── Registro de firmas ──
        story.append(Table(
            [[Paragraph('REGISTRO DE FIRMAS', style('rft', fontSize=8, fontName='Helvetica-Bold', textColor=AZUL))]],
            colWidths=['*'],
            style=TableStyle([
                ('BACKGROUND',   (0,0), (-1,-1), AZUL_L),
                ('BOX',          (0,0), (-1,-1), 0.5, BORDE),
                ('TOPPADDING',   (0,0), (-1,-1), 6),
                ('BOTTOMPADDING',(0,0), (-1,-1), 6),
                ('LEFTPADDING',  (0,0), (-1,-1), 8),
            ])
        ))

        for f in firmantes:
            signed    = f.get('signed', False)
            name      = f.get('name') or '(sin nombre)'
            email     = f.get('email', '')
            signed_at = f.get('signed_at', '')
            ip        = f.get('ip', '')

            try:
                dt_f    = datetime.fromisoformat(signed_at[:19])
                meses   = ['enero','febrero','marzo','abril','mayo','junio',
                           'julio','agosto','septiembre','octubre','noviembre','diciembre']
                fecha_s = f"Firmado el {dt_f.day} de {meses[dt_f.month-1]} de {dt_f.year} a las {dt_f.strftime('%H:%M:%S')}"
            except:
                fecha_s = signed_at[:19] if signed_at else ''

            # Imagen de firma
            sig_img = None
            if signed and f.get('signature'):
                try:
                    sig_data = f['signature']
                    if sig_data.startswith('data:'):
                        sig_data = sig_data.split(',', 1)[1]
                    sig_bytes = base64.b64decode(sig_data)
                    sig_buf   = io.BytesIO(sig_bytes)
                    sig_img   = Image(sig_buf, width=35*mm, height=15*mm)
                    sig_img.hAlign = 'RIGHT'
                except:
                    sig_img = None

            # Badge FIRMADO / PENDIENTE
            if signed:
                badge = Table(
                    [[Paragraph('FIRMADO', style('bdg', fontSize=7, fontName='Helvetica-Bold',
                                                  textColor=colors.white, alignment=TA_CENTER))]],
                    colWidths=[22*mm],
                    style=TableStyle([
                        ('BACKGROUND',    (0,0), (-1,-1), VERDE),
                        ('ROUNDEDCORNERS',(0,0), (-1,-1), 3),
                        ('TOPPADDING',    (0,0), (-1,-1), 3),
                        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                    ])
                )
            else:
                badge = Table(
                    [[Paragraph('PENDIENTE', style('bdgp', fontSize=7, fontName='Helvetica-Bold',
                                                    textColor=AZUL, alignment=TA_CENTER))]],
                    colWidths=[26*mm],
                    style=TableStyle([
                        ('BACKGROUND',    (0,0), (-1,-1), AZUL_L),
                        ('TOPPADDING',    (0,0), (-1,-1), 3),
                        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                    ])
                )

            # Contenido izquierdo
            left_content = [
                Paragraph(f'<b>{name}</b>', s_bold),
                Paragraph(email, s_gris),
            ]
            if signed:
                left_content.append(Paragraph(fecha_s, s_gris))
                if ip:
                    left_content.append(Paragraph(f'IP: {ip}', s_gris))

            right_content = [badge]
            if sig_img:
                right_content.append(sig_img)

            # Tabla de cada firmante
            from reportlab.platypus import KeepTogether
            right_table = Table(
                [[item] for item in right_content],
                colWidths=['*'],
                style=TableStyle([
                    ('ALIGN',  (0,0), (-1,-1), 'RIGHT'),
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                    ('TOPPADDING',    (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ])
            )

            left_para  = Table([[p] for p in left_content],
                               colWidths=['*'],
                               style=TableStyle([
                                   ('TOPPADDING',    (0,0), (-1,-1), 1),
                                   ('BOTTOMPADDING', (0,0), (-1,-1), 1),
                               ]))

            row_table = Table(
                [[left_para, right_table]],
                colWidths=['*', 45*mm],
                style=TableStyle([
                    ('VALIGN',        (0,0), (-1,-1), 'TOP'),
                    ('BOX',           (0,0), (-1,-1), 0.5, BORDE),
                    ('TOPPADDING',    (0,0), (-1,-1), 8),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                    ('LEFTPADDING',   (0,0), (0,-1),  8),
                    ('RIGHTPADDING',  (1,0), (1,-1),  8),
                ])
            )
            story.append(row_table)

        story.append(Spacer(1, 16))

        # ── Texto legal ──
        legal = (
            "Por medio del presente instrumento digital, los firmantes declaran bajo juramento "
            "ser autores del documento suscripto, reconociendo la plena validez juridica de la "
            "firma electronica incorporada. Este certificado valida la firma del documento "
            "especificado mediante los mecanismos de autenticacion y cifrado utilizados "
            "conforme a la Ley N 25.506 y sus Decretos Reglamentarios de la Republica Argentina."
        )
        story.append(Paragraph(legal, s_legal))
        story.append(Spacer(1, 16))

        # ── Ref ID box ──
        doc_id_val = doc_data.get('doc_id', doc_id)
        ref_box = Table(
            [[Paragraph('<b>Repor rf Id:</b>', style('rid', fontSize=7, fontName='Helvetica-Bold', textColor=AZUL)),
              Paragraph(f'#:{doc_id_val.upper()}', style('ridv', fontSize=7, fontName='Helvetica', textColor=NEGRO))]],
            colWidths=[28*mm, '*'],
            style=TableStyle([
                ('BOX',           (0,0), (-1,-1), 0.5, BORDE),
                ('TOPPADDING',    (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('LEFTPADDING',   (0,0), (-1,-1), 8),
                ('ALIGN',         (0,0), (-1,-1), 'LEFT'),
            ])
        )
        # Alinear a la derecha
        ref_wrapper = Table([[ref_box]], colWidths=['*'],
                            style=TableStyle([('ALIGN', (0,0), (-1,-1), 'RIGHT')]))
        story.append(ref_wrapper)

        story.append(Spacer(1, 20))
        story.append(HRFlowable(width='100%', thickness=0.5, color=BORDE, spaceAfter=6))
        story.append(Paragraph('www.realvix.com', s_footer))

        doc.build(story)
        return buf.getvalue()

    except Exception as e:
        print(f"[FIRMA][CERT] Error certificado diseño: {e}")
        traceback.print_exc()
        return None


# ══════════════════════════════════════════
#  RUTAS
# ══════════════════════════════════════════

@bp.route('/api/documento', methods=['POST'])
@login_required
def crear_documento():
    _ensure_table()
    user            = _get_current_user()
    title           = (request.form.get('title') or '').strip()
    organizer_name  = (request.form.get('organizer_name') or '').strip()
    organizer_email = (request.form.get('organizer_email') or user.get('email', '')).strip()

    try:
        firmantes = json.loads(request.form.get('firmantes', '[]'))
    except Exception:
        return jsonify({'error': 'firmantes JSON invalido'}), 400

    if not title:
        return jsonify({'error': 'El titulo es requerido'}), 400
    if not firmantes:
        return jsonify({'error': 'Debe haber al menos un firmante'}), 400

    pdf_base64 = None
    pdf_file   = request.files.get('pdf_file')
    if pdf_file:
        pdf_base64 = base64.b64encode(pdf_file.read()).decode('utf-8')

    import secrets as sec
    doc_id = str(uuid.uuid4())
    now    = datetime.utcnow().isoformat()

    for f in firmantes:
        f['token']     = sec.token_urlsafe(32)
        f['signed']    = False
        f['signed_at'] = None
        f['signature'] = None
        f['sign_url']  = f"{_base_url()}/firmar/{doc_id}/{f['token']}"

    doc_data = {
        'doc_id':          doc_id,
        'title':           title,
        'organizer_name':  organizer_name,
        'organizer_email': organizer_email,
        'user_id':         user['id'],
        'firmantes':       firmantes,
        'pdf_base64':      pdf_base64,
        'created_at':      now,
        'status':          'pendiente',
    }

    ok = _exec("INSERT INTO documents (id, data, created_at) VALUES (%s, %s, %s)",
               (doc_id, json.dumps(doc_data), now))
    if not ok:
        return jsonify({'error': 'Error al guardar el documento'}), 500

    emails_ok, emails_err = [], []
    for f in firmantes:
        html = _email_invitacion(title, organizer_name, f.get('name', ''), f['sign_url'])
        if _send_email(f['email'], f"✍️ Te pidieron que firmes: {title}", html):
            emails_ok.append(f['email'])
        else:
            emails_err.append(f['email'])

    resp = {
        'ok':         True,
        'doc_id':     doc_id,
        'firmantes':  [{'email': f['email'], 'name': f.get('name', ''), 'sign_url': f['sign_url']} for f in firmantes],
        'emails_ok':  emails_ok,
        'emails_err': emails_err,
    }
    if emails_err:
        resp['warning'] = f"No se pudo enviar email a: {', '.join(emails_err)}"
    return jsonify(resp), 201


@bp.route('/api/documentos', methods=['GET'])
@login_required
def listar_documentos():
    _ensure_table()
    user   = _get_current_user()
    estado = request.args.get('estado', '')
    rows   = _query("SELECT id, data, created_at FROM documents ORDER BY created_at DESC")
    result = []
    for row in rows:
        d = row['data']
        if d.get('user_id') and d['user_id'] != user['id'] and user.get('role') != 'admin':
            continue
        firmantes = d.get('firmantes', [])
        total     = len(firmantes)
        firmados  = sum(1 for f in firmantes if f.get('signed'))
        doc_est   = 'completado' if (total > 0 and firmados == total) else 'pendiente'
        if estado and doc_est != estado:
            continue
        result.append({
            'id':         row['id'],
            'title':      d.get('title', ''),
            'created_at': str(row['created_at']),
            'status':     doc_est,
            'firmantes':  [{'name': f.get('name',''), 'email': f.get('email',''),
                            'signed': f.get('signed', False), 'signed_at': f.get('signed_at'),
                            'sign_url': f.get('sign_url','')} for f in firmantes],
            'total':    total,
            'firmados': firmados,
        })
    return jsonify({'documentos': result})


@bp.route('/api/documento/<doc_id>/estado', methods=['GET'])
@login_required
def estado_documento(doc_id):
    _ensure_table()
    row = _query("SELECT id, data, created_at FROM documents WHERE id=%s", (doc_id,), one=True)
    if not row:
        return jsonify({'error': 'Documento no encontrado'}), 404
    d         = row['data']
    firmantes = d.get('firmantes', [])
    total     = len(firmantes)
    firmados  = sum(1 for f in firmantes if f.get('signed'))
    return jsonify({
        'id':         doc_id,
        'title':      d.get('title', ''),
        'created_at': str(row['created_at']),
        'status':     'completado' if firmados == total else 'pendiente',
        'firmantes':  [{'name': f.get('name',''), 'email': f.get('email',''),
                        'signed': f.get('signed', False), 'signed_at': f.get('signed_at'),
                        'sign_url': f.get('sign_url','')} for f in firmantes],
        'total':    total,
        'firmados': firmados,
    })


@bp.route('/firmar/<doc_id>/<token>', methods=['GET'])
def pagina_firmar(doc_id, token):
    _ensure_table()
    row = _query("SELECT id, data FROM documents WHERE id=%s", (doc_id,), one=True)
    if not row:
        return "Documento no encontrado", 404
    d        = row['data']
    firmante = next((f for f in d.get('firmantes', []) if f.get('token') == token), None)
    if not firmante:
        return "Link de firma invalido", 404
    return render_template('firmar.html', doc_id=doc_id, token=token, doc=d, firmante=firmante)


@bp.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
def guardar_firma(doc_id, token):
    _ensure_table()
    row = _query("SELECT id, data FROM documents WHERE id=%s", (doc_id,), one=True)
    if not row:
        return jsonify({'error': 'Documento no encontrado'}), 404

    d         = dict(row['data'])
    firmantes = list(d.get('firmantes', []))
    idx       = next((i for i, f in enumerate(firmantes) if f.get('token') == token), None)
    if idx is None:
        return jsonify({'error': 'Token de firma invalido'}), 404
    if firmantes[idx].get('signed'):
        return jsonify({'error': 'Ya firmaste este documento'}), 400

    body = request.get_json(silent=True) or {}

    # El frontend manda 'signature_dataurl' — aceptamos ambos nombres
    signature = body.get('signature_dataurl') or body.get('signature', '')
    if not signature:
        return jsonify({'error': 'Falta la firma'}), 400

    # Validar email confirmado si viene
    email_confirmado = body.get('email_confirmado', '').strip().lower()
    firmante_email   = firmantes[idx].get('email', '').strip().lower()
    if email_confirmado and email_confirmado != firmante_email:
        return jsonify({'error': 'El email no coincide con el firmante registrado'}), 400

    firmantes[idx]['signed']    = True
    firmantes[idx]['signed_at'] = datetime.utcnow().isoformat()
    firmantes[idx]['signature'] = signature
    firmantes[idx]['ip']        = request.headers.get('X-Forwarded-For', request.remote_addr or '')
    d['firmantes'] = firmantes

    total    = len(firmantes)
    firmados = sum(1 for f in firmantes if f.get('signed'))
    all_done = firmados == total

    if all_done:
        d['status']       = 'completado'
        d['completed_at'] = datetime.utcnow().isoformat()

    ok = _exec("UPDATE documents SET data=%s WHERE id=%s", (json.dumps(d), doc_id))
    if not ok:
        return jsonify({'error': 'Error al guardar la firma'}), 500

    if all_done:
        _enviar_certificado_final(doc_id, d)

    return jsonify({'ok': True, 'all_signed': all_done, 'signed_count': firmados, 'total': total})


def _enviar_certificado_final(doc_id, doc_data):
    try:
        pdf_bytes     = _generar_certificado(doc_data)
        filename      = f"certificado_{doc_id[:8]}.pdf"
        destinatarios = [{'email': f['email'], 'name': f.get('name', '')}
                         for f in doc_data.get('firmantes', []) if f.get('email')]
        org_email = doc_data.get('organizer_email', '')
        if org_email and not any(d['email'] == org_email for d in destinatarios):
            destinatarios.append({'email': org_email, 'name': doc_data.get('organizer_name', '')})
        title         = doc_data.get('title', 'Documento')
        firmantes_all = doc_data.get('firmantes', [])
        for dest in destinatarios:
            html        = _email_certificado(title, dest['name'], firmantes_all)
            attachments = [{'filename': filename, 'data': pdf_bytes}] if pdf_bytes else []
            _send_email(dest['email'], f"Certificado de firma: {title}", html, attachments)
    except Exception as e:
        print(f"[FIRMA][CERT] Error enviando certificado: {e}")
        traceback.print_exc()


@bp.route('/api/documento/<doc_id>/certificado', methods=['GET'])
@login_required
def descargar_certificado(doc_id):
    _ensure_table()
    row = _query("SELECT id, data FROM documents WHERE id=%s", (doc_id,), one=True)
    if not row:
        return jsonify({'error': 'Documento no encontrado'}), 404
    pdf_bytes = _generar_certificado(row['data'])
    if not pdf_bytes:
        return jsonify({'error': 'No se pudo generar el certificado'}), 500
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="certificado_{doc_id[:8]}.pdf"'})


@bp.route('/api/documentos/historial', methods=['GET'])
@login_required
def historial_documentos():
    _ensure_table()
    user     = _get_current_user()
    rows     = _query("SELECT id, data, created_at FROM documents ORDER BY created_at DESC")
    carpetas = {}
    for row in rows:
        d = row['data']
        if d.get('user_id') and d['user_id'] != user['id'] and user.get('role') != 'admin':
            continue
        if d.get('status') != 'completado':
            continue
        try:
            dt  = datetime.fromisoformat(str(row['created_at']).replace('Z', ''))
            key = dt.strftime('%B %Y')
        except:
            key = 'Sin fecha'
        carpetas.setdefault(key, []).append({
            'id': row['id'], 'title': d.get('title', ''), 'created_at': str(row['created_at'])
        })
    result = [{'nombre': k, 'cantidad': len(v), 'docs': v} for k, v in carpetas.items()]
    return jsonify({'carpetas': result})


@bp.route('/api/documentos/historial/<carpeta>', methods=['DELETE'])
@login_required
def eliminar_carpeta_historial(carpeta):
    _ensure_table()
    user = _get_current_user()
    rows = _query("SELECT id, data, created_at FROM documents")
    ids_a_eliminar = []
    for row in rows:
        d = row['data']
        if d.get('user_id') and d['user_id'] != user['id'] and user.get('role') != 'admin':
            continue
        if d.get('status') != 'completado':
            continue
        try:
            dt  = datetime.fromisoformat(str(row['created_at']).replace('Z', ''))
            key = dt.strftime('%B %Y')
        except:
            key = 'Sin fecha'
        if key == carpeta:
            ids_a_eliminar.append(row['id'])
    for doc_id in ids_a_eliminar:
        _exec("DELETE FROM documents WHERE id=%s", (doc_id,))
    return jsonify({'ok': True, 'eliminados': len(ids_a_eliminar)})


@bp.route('/api/documento/<doc_id>', methods=['DELETE'])
@login_required
def eliminar_documento(doc_id):
    _ensure_table()
    _exec("DELETE FROM documents WHERE id=%s", (doc_id,))
    return jsonify({'ok': True})
