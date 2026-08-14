import os
import json
import uuid
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'desarrollador-senior-flask-firebase-2026')
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Max 16MB

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'), exist_ok=True)

LOCAL_DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'estudiantes.json')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- FIREBASE SETUP ---
firebase_db = None
firebase_bucket = None
FIREBASE_INITIALIZED = False

try:
    import firebase_admin
    from firebase_admin import credentials, db, storage

    cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'serviceAccountKey.json')
    database_url = os.environ.get('FIREBASE_DATABASE_URL')
    storage_bucket = os.environ.get('FIREBASE_STORAGE_BUCKET')

    if os.path.exists(cred_path) and database_url:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': database_url,
            'storageBucket': storage_bucket
        })
        firebase_db = db.reference('/estudiantes')
        if storage_bucket:
            firebase_bucket = storage.bucket()
        FIREBASE_INITIALIZED = True
        print("Firebase Admin SDK inicializado exitosamente.")
    else:
        print("Modo Firebase deshabilitado (no se encontraron credenciales válidas). Usando almacenamiento de respaldo local.")
except Exception as e:
    print(f"Advertencia Firebase: {e}. Usando almacenamiento local.")

# --- HELPERS DATA STORAGE ---
def load_local_data():
    if not os.path.exists(LOCAL_DB_FILE):
        return {}
    try:
        with open(LOCAL_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_local_data(data):
    with open(LOCAL_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_all_students():
    if FIREBASE_INITIALIZED and firebase_db:
        try:
            data = firebase_db.get()
            if not data:
                return {}
            return data
        except Exception as e:
            print(f"Error leyendo de Firebase: {e}")
            return load_local_data()
    return load_local_data()

def get_student_by_id(estudiante_id):
    if FIREBASE_INITIALIZED and firebase_db:
        try:
            data = firebase_db.child(estudiante_id).get()
            if data:
                return data
        except Exception as e:
            print(f"Error consultando Firebase: {e}")
    all_data = load_local_data()
    return all_data.get(estudiante_id)

def save_student(estudiante_id, student_data):
    # Guardar en Firebase si está activo
    if FIREBASE_INITIALIZED and firebase_db:
        try:
            firebase_db.child(estudiante_id).set(student_data)
        except Exception as e:
            print(f"Error guardando en Firebase: {e}")
    
    # Guardar siempre copia local de respaldo
    local_data = load_local_data()
    local_data[estudiante_id] = student_data
    save_local_data(local_data)

def get_next_order_number():
    students = get_all_students()
    if not students:
        return 1
    orders = [s.get('numero_orden', 0) for s in students.values() if isinstance(s, dict)]
    return max(orders) + 1 if orders else 1

# --- ROUTES ---

@app.route('/')
def index():
    return redirect(url_for('registro'))

@app.route('/registro', methods=['GET', 'POST'])
def registro():
    if request.method == 'POST':
        nombre = request.form.get('nombre', '').strip()
        telefono = request.form.get('telefono', '').strip()
        file = request.files.get('foto')

        if not nombre or not telefono:
            return render_template('registro.html', error="Por favor completa todos los campos requeridos.")

        if not file or file.filename == '':
            return render_template('registro.html', error="La foto del rostro es obligatoria.")

        if not allowed_file(file.filename):
            return render_template('registro.html', error="Formato de imagen no permitido. Usa JPG, PNG o WEBP.")

        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"
        
        foto_url = ""

        # Intentar subir a Firebase Storage si está disponible
        if FIREBASE_INITIALIZED and firebase_bucket:
            try:
                blob = firebase_bucket.blob(f"rostros/{unique_filename}")
                blob.upload_from_file(file, content_type=file.content_type)
                blob.make_public()
                foto_url = blob.public_url
            except Exception as e:
                print(f"Error subiendo a Firebase Storage: {e}")

        # Fallback de guardado local si no se pudo subir a Firebase
        if not foto_url:
            local_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            file.seek(0)
            file.save(local_path)
            foto_url = url_for('static', filename=f'uploads/{unique_filename}')

        # Asignar Número de Orden Secuencial (#1, #2, #3...)
        numero_orden = get_next_order_number()
        estudiante_id = f"EST-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"

        nuevo_estudiante = {
            'id': estudiante_id,
            'numero_orden': numero_orden,
            'nombre': nombre,
            'telefono': telefono,
            'foto_url': foto_url,
            'estado': 'Pendiente',
            'hora_llegada': None,
            'fotos_extras': False,
            'cantidad_fotos_extras': 0,
            'fecha_registro': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        save_student(estudiante_id, nuevo_estudiante)

        return redirect(url_for('carnet', estudiante_id=estudiante_id))

    return render_template('registro.html')

@app.route('/carnet/<estudiante_id>')
def carnet(estudiante_id):
    estudiante = get_student_by_id(estudiante_id)
    if not estudiante:
        return render_template('registro.html', error="Estudiante no encontrado. Por favor regístrate nuevamente.")
    
    return render_template('carnet.html', estudiante=estudiante)

@app.route('/admin')
def admin():
    students_dict = get_all_students()
    students_list = list(students_dict.values()) if isinstance(students_dict, dict) else []
    
    # Ordenar por número de orden ascendente
    students_list.sort(key=lambda x: x.get('numero_orden', 0))

    # Calcular estadísticas rápidas
    total = len(students_list)
    presentes = sum(1 for s in students_list if s.get('estado') == 'Presente')
    pendientes = total - presentes
    total_fotos_extras = sum(s.get('cantidad_fotos_extras', 0) for s in students_list if s.get('fotos_extras'))

    stats = {
        'total': total,
        'presentes': presentes,
        'pendientes': pendientes,
        'total_fotos_extras': total_fotos_extras
    }

    return render_template('admin.html', estudiantes=students_list, stats=stats)

@app.route('/escanear')
def escanear():
    return render_template('escanear.html')

# --- APIS JSON ---

@app.route('/api/checkin', methods=['POST'])
def api_checkin():
    data = request.get_json() or {}
    estudiante_id = data.get('estudiante_id', '').strip()

    if not estudiante_id:
        return jsonify({'success': False, 'code': 'NO_ID', 'message': 'Código QR no proporcionado.'}), 400

    estudiante = get_student_by_id(estudiante_id)

    if not estudiante:
        return jsonify({
            'success': False, 
            'code': 'NOT_FOUND', 
            'message': f'Código no registrado ({estudiante_id}). Verifique los datos.'
        }), 404

    if estudiante.get('estado') == 'Presente':
        return jsonify({
            'success': False,
            'code': 'ALREADY_CHECKED_IN',
            'message': f'¡Atención! {estudiante.get("nombre")} ya ingresó a las {estudiante.get("hora_llegada")}.',
            'estudiante': estudiante
        }), 200

    # Cambiar estado a Presente
    hora_actual = datetime.now().strftime("%I:%M:%S %p")
    estudiante['estado'] = 'Presente'
    estudiante['hora_llegada'] = hora_actual

    save_student(estudiante_id, estudiante)

    return jsonify({
        'success': True,
        'code': 'SUCCESS',
        'message': f'¡Check-In exitoso! Bienvenido/a {estudiante.get("nombre")}.',
        'estudiante': estudiante
    }), 200

@app.route('/api/actualizar_fotos_extras', methods=['POST'])
def api_actualizar_fotos_extras():
    data = request.get_json() or {}
    estudiante_id = data.get('estudiante_id')
    fotos_extras = bool(data.get('fotos_extras', False))
    cantidad = int(data.get('cantidad_fotos_extras', 0))

    if not estudiante_id:
        return jsonify({'success': False, 'message': 'ID de estudiante no enviado.'}), 400

    estudiante = get_student_by_id(estudiante_id)
    if not estudiante:
        return jsonify({'success': False, 'message': 'Estudiante no encontrado.'}), 404

    estudiante['fotos_extras'] = fotos_extras
    estudiante['cantidad_fotos_extras'] = cantidad if fotos_extras else 0

    save_student(estudiante_id, estudiante)

    return jsonify({
        'success': True, 
        'message': f'Fotos extras actualizadas para {estudiante.get("nombre")}.',
        'estudiante': estudiante
    })

@app.route('/api/estudiantes', methods=['GET'])
def api_estudiantes():
    students_dict = get_all_students()
    students_list = list(students_dict.values()) if isinstance(students_dict, dict) else []
    students_list.sort(key=lambda x: x.get('numero_orden', 0))
    return jsonify(students_list)

@app.route('/api/estudiante/<estudiante_id>', methods=['GET'])
def api_estudiante_detail(estudiante_id):
    estudiante = get_student_by_id(estudiante_id)
    if not estudiante:
        return jsonify({'success': False, 'message': 'Estudiante no encontrado.'}), 404
    return jsonify({'success': True, 'estudiante': estudiante})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"Iniciando servidor de gestión fotográfica en http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
