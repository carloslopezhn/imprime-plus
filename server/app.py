"""Imprime+ - Print Layout Editor and Update Server"""
from flask import Flask, render_template, request, jsonify, abort, send_from_directory
from flask_compress import Compress
from packaging.version import Version
import pymysql
import json
import os
import time

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'imprime-plus-dev-key-2026')
Compress(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "downloads")

# ---------- Database ----------
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'imprime'),
    'password': os.environ.get('DB_PASSWORD', 'imprimeplus2026'),
    'database': os.environ.get('DB_NAME', 'imprimeplus'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
}


def get_db():
    return pymysql.connect(**DB_CONFIG)


def init_db():
    for attempt in range(30):
        try:
            conn = get_db()
            break
        except pymysql.err.OperationalError:
            if attempt < 29:
                time.sleep(2)
            else:
                raise

    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS presets (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(128) NOT NULL,
                    width DECIMAL(10,2) NOT NULL,
                    height DECIMAL(10,2) NOT NULL,
                    unit VARCHAR(10) NOT NULL DEFAULT 'cm',
                    builtin TINYINT(1) NOT NULL DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            conn.commit()

            cur.execute("SELECT COUNT(*) AS cnt FROM presets WHERE builtin = 1")
            if cur.fetchone()['cnt'] == 0:
                defaults = [
                    ('letter', 'Carta', 21.59, 27.94, 'cm', 1),
                    ('legal', 'Oficio', 21.59, 35.56, 'cm', 1),
                    ('a4', 'A4', 21.0, 29.7, 'cm', 1),
                    ('a5', 'A5', 14.8, 21.0, 'cm', 1),
                    ('4x6', '4x6 pulg', 10.16, 15.24, 'cm', 1),
                    ('5x7', '5x7 pulg', 12.7, 17.78, 'cm', 1),
                ]
                cur.executemany(
                    'INSERT IGNORE INTO presets (id, name, width, height, unit, builtin) VALUES (%s,%s,%s,%s,%s,%s)',
                    defaults,
                )
                conn.commit()


init_db()


def load_latest():
    path = os.path.join(DATA_DIR, 'latest.json')
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.loads(f.read().encode().lstrip(b'\xef\xbb\xbf').decode('utf-8'))


# ---------- Presets API ----------

@app.route('/api/presets', methods=['GET'])
def get_presets():
    conn = get_db()
    with conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id, name, width, height, unit, builtin FROM presets ORDER BY builtin DESC, name')
            rows = cur.fetchall()
    for r in rows:
        r['width'] = float(r['width'])
        r['height'] = float(r['height'])
        r['builtin'] = bool(r['builtin'])
    return jsonify(rows)


@app.route('/api/presets', methods=['POST'])
def create_preset():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('width') or not data.get('height'):
        return jsonify({'error': 'Nombre, ancho y alto son requeridos'}), 400

    conn = get_db()
    with conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS cnt FROM presets WHERE builtin = 0')
            count = cur.fetchone()['cnt']
            new_id = f'custom_{count + 1}_{int(time.time())}'
            cur.execute(
                'INSERT INTO presets (id, name, width, height, unit, builtin) VALUES (%s,%s,%s,%s,%s,0)',
                (new_id, data['name'], float(data['width']), float(data['height']), data.get('unit', 'cm')),
            )
            conn.commit()

    preset = {
        'id': new_id,
        'name': data['name'],
        'width': float(data['width']),
        'height': float(data['height']),
        'unit': data.get('unit', 'cm'),
        'builtin': False,
    }
    return jsonify(preset), 201


@app.route('/api/presets/<preset_id>', methods=['DELETE'])
def delete_preset(preset_id):
    conn = get_db()
    with conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id, builtin FROM presets WHERE id = %s', (preset_id,))
            preset = cur.fetchone()
            if not preset:
                return jsonify({'error': 'Preset no encontrado'}), 404
            if preset['builtin']:
                return jsonify({'error': 'No se puede eliminar un preset predefinido'}), 400
            cur.execute('DELETE FROM presets WHERE id = %s AND builtin = 0', (preset_id,))
            conn.commit()
    return jsonify({'ok': True})


# ---------- Update API (Tauri Updater) ----------

@app.route('/api/update/<target>/<arch>/<current_version>')
def check_update(target, arch, current_version):
    latest = load_latest()
    if not latest:
        return '', 204

    try:
        current = Version(current_version.lstrip('v'))
        server = Version(latest['version'].lstrip('v'))
    except Exception:
        return '', 204

    if server <= current:
        return '', 204

    platform_key = target
    platforms = latest.get('platforms', {})
    if platform_key not in platforms:
        return '', 204

    plat = platforms[platform_key]
    if not plat.get('url') or not plat.get('signature'):
        return '', 204

    return jsonify({
        'version': latest['version'],
        'notes': latest.get('notes', ''),
        'pub_date': latest.get('pub_date', ''),
        'url': plat['url'],
        'signature': plat['signature'],
    })


# ---------- Download Page ----------

@app.route('/')
def download_page():
    latest = load_latest()
    version = latest['version'] if latest else '---'
    pub_date = latest.get('pub_date', '')[:10] if latest else ''
    notes = latest.get('notes', '') if latest else ''

    platforms = {}
    if latest:
        for key, val in latest.get('platforms', {}).items():
            platforms[key] = val.get('url', '')

    return render_template('download.html',
                           version=version,
                           pub_date=pub_date,
                           notes=notes,
                           platforms=platforms)


@app.route('/downloads/<filename>')
def serve_download(filename):
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
