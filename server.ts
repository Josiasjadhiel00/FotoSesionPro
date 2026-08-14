import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import cookieParser from 'cookie-parser';

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;
const COOKIE_SECRET = 'admin_photogest_secret_key_2026';

const UPLOADS_DIR = path.join(process.cwd(), 'static', 'uploads');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'estudiantes.json');
const INSTITUCIONES_FILE = path.join(DATA_DIR, 'instituciones.json');
const ADMIN_CREDENTIALS_FILE = path.join(DATA_DIR, 'admin_credentials.json');
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
}

// Admin credentials helpers
interface AdminCredentials {
  usuario: string;
  password: string;
}

function getAdminCredentials(): AdminCredentials {
  try {
    if (fs.existsSync(ADMIN_CREDENTIALS_FILE)) {
      const content = fs.readFileSync(ADMIN_CREDENTIALS_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (data.usuario && data.password) {
        return data;
      }
    }
  } catch (err) {
    console.error('Error leyendo credenciales admin:', err);
  }
  const defaultCreds = { usuario: 'admin', password: 'admin' };
  saveAdminCredentials(defaultCreds.usuario, defaultCreds.password);
  return defaultCreds;
}

function saveAdminCredentials(usuario: string, password: string): void {
  try {
    fs.writeFileSync(ADMIN_CREDENTIALS_FILE, JSON.stringify({ usuario, password }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando credenciales admin:', err);
  }
}

// Institutions data model
export interface Institucion {
  id: string;
  nombre: string;
  codigo: string;
  logo_url: string;
  fondo_url: string;
  color_primario: string;
  diseno_carnet: string; // 'clasico' | 'esmeralda' | 'elegante_dorado' | 'rojo_corporativo' | 'moderno_oscuro'
  descripcion?: string;
  fecha_creacion: string;
}

function getDefaultInstituciones(): Record<string, Institucion> {
  return {
    'inst_1': {
      id: 'inst_1',
      nombre: 'Liceo Panamericano',
      codigo: 'LP-2026',
      logo_url: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=300&auto=format&fit=crop&q=80',
      fondo_url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&auto=format&fit=crop&q=80',
      color_primario: '#0284c7',
      diseno_carnet: 'clasico',
      descripcion: 'Institución Educativa Secundaria y Bachillerato',
      fecha_creacion: new Date().toISOString()
    },
    'inst_2': {
      id: 'inst_2',
      nombre: 'Colegio Internacional San Juan',
      codigo: 'CISJ',
      logo_url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=300&auto=format&fit=crop&q=80',
      fondo_url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&auto=format&fit=crop&q=80',
      color_primario: '#16a34a',
      diseno_carnet: 'esmeralda',
      descripcion: 'Educación Básica y Media Primaria/Secundaria',
      fecha_creacion: new Date().toISOString()
    },
    'inst_3': {
      id: 'inst_3',
      nombre: 'Instituto Tecnológico Central',
      codigo: 'ITC',
      logo_url: 'https://images.unsplash.com/photo-1562774053-701939374585?w=300&auto=format&fit=crop&q=80',
      fondo_url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&auto=format&fit=crop&q=80',
      color_primario: '#7c3aed',
      diseno_carnet: 'elegante_dorado',
      descripcion: 'Educación Técnica y Tecnológica Superior',
      fecha_creacion: new Date().toISOString()
    }
  };
}

function loadInstituciones(): Record<string, Institucion> {
  try {
    if (!fs.existsSync(INSTITUCIONES_FILE)) {
      const defaults = getDefaultInstituciones();
      saveInstituciones(defaults);
      return defaults;
    }
    const content = fs.readFileSync(INSTITUCIONES_FILE, 'utf-8');
    const parsed = JSON.parse(content || '{}');
    if (Object.keys(parsed).length === 0) {
      const defaults = getDefaultInstituciones();
      saveInstituciones(defaults);
      return defaults;
    }
    return parsed;
  } catch (err) {
    console.error('Error cargando instituciones:', err);
    return getDefaultInstituciones();
  }
}

function saveInstituciones(data: Record<string, Institucion>): void {
  try {
    fs.writeFileSync(INSTITUCIONES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando instituciones:', err);
  }
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen.'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));
app.use('/static', express.static(path.join(process.cwd(), 'static')));

// Helper to set auth cookies with cross-site compatibility
function setAuthCookies(res: Response) {
  res.cookie('admin_session', 'authenticated', {
    signed: true,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 24 * 60 * 60 * 1000
  });
  res.cookie('admin_session_lax', 'authenticated', {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  });
}

// Authentication middleware
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const isAuthCookie = 
    (req.signedCookies && req.signedCookies.admin_session === 'authenticated') ||
    (req.cookies && req.cookies.admin_session === 'authenticated') ||
    (req.cookies && req.cookies.admin_session_lax === 'authenticated');
  
  const tokenHeader = req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const isAuthHeader = tokenHeader === 'authenticated';
  const isAuthQuery = req.query.token === 'authenticated' || req.query.auth === 'authenticated';

  if (isAuthCookie || isAuthHeader || isAuthQuery) {
    return next();
  }

  // Check if API or AJAX request
  if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado. Inicie sesión como administrador.'
    });
  }

  const redirectUrl = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/login?redirect=${redirectUrl}`);
}

// Database helper functions
interface Estudiante {
  id: string;
  numero_orden: number;
  nombre: string;
  telefono: string;
  tanda?: string;
  curso?: string;
  institucion_id?: string;
  institucion_nombre?: string;
  foto_url: string;
  estado: 'Pendiente' | 'Presente';
  hora_llegada: string | null;
  fotos_extras: boolean;
  cantidad_fotos_extras: number;
  fecha_registro: string;
}

function loadEstudiantes(): Record<string, Estudiante> {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.error('Error cargando estudiantes:', err);
    return {};
  }
}

function saveEstudiantes(data: Record<string, Estudiante>): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando estudiantes:', err);
  }
}

function getNextOrderNumber(): number {
  const students = Object.values(loadEstudiantes());
  if (students.length === 0) return 1;
  const maxOrder = Math.max(...students.map(s => s.numero_orden || 0));
  return maxOrder + 1;
}

// Helper template replacement for simple HTML render
function renderTemplate(filename: string, data: Record<string, any> = {}): string {
  const filePath = path.join(TEMPLATES_DIR, filename);
  let html = fs.readFileSync(filePath, 'utf-8');

  // 1. Error blocks: {% if error %}...{% endif %}
  if (data.error) {
    html = html.replace(/{%\s*if error\s*%}([\s\S]*?){%\s*endif\s*%}/g, (match, p1) => {
      return p1.replace(/\{\{\s*error\s*\}\}/g, data.error);
    });
  } else {
    html = html.replace(/{%\s*if error\s*%}([\s\S]*?){%\s*endif\s*%}/g, '');
  }

  // 2. Redirect param: {% if redirect %}...{% endif %}
  if (data.redirect) {
    html = html
      .replace(/{%\s*if redirect\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1')
      .replace(/\{\{\s*redirect\s*\}\}/g, data.redirect);
  } else {
    html = html
      .replace(/{%\s*if redirect\s*%}([\s\S]*?){%\s*endif\s*%}/g, '')
      .replace(/\{\{\s*redirect\s*\}\}/g, '');
  }

  // 3. Institutions JSON payload for client script
  const instsList = data.instituciones || Object.values(loadInstituciones());
  html = html.replace(/\{\{\s*instituciones_json\s*\}\}/g, JSON.stringify(instsList));

  // 4. Selected Institution in registro.html
  const sel = data.selectedInstitucion;
  const hasSelectedInst = Boolean(sel && sel.id);

  // Selected Inst Conditionals
  if (hasSelectedInst) {
    html = html
      .replace(/{%\s*if selected_inst_id\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1')
      .replace(/{%\s*if not selected_inst_id\s*%}([\s\S]*?){%\s*endif\s*%}/g, '');
  } else {
    html = html
      .replace(/{%\s*if selected_inst_id\s*%}([\s\S]*?){%\s*endif\s*%}/g, '')
      .replace(/{%\s*if not selected_inst_id\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1');
  }

  if (sel && sel.fondo_url) {
    html = html.replace(/{%\s*if selectedInstitucion\.fondo_url\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1');
  } else {
    html = html.replace(/{%\s*if selectedInstitucion\.fondo_url\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$2');
  }

  if (sel && sel.logo_url) {
    html = html.replace(/{%\s*if selectedInstitucion\.logo_url\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1');
  } else {
    html = html.replace(/{%\s*if selectedInstitucion\.logo_url\s*%}([\s\S]*?){%\s*endif\s*%}/g, '');
  }

  // Selected Inst Variables
  html = html
    .replace(/\{\{\s*selectedInstitucion\.id\s*\}\}/g, sel ? sel.id : '')
    .replace(/\{\{\s*selectedInstitucion\.nombre\s*\}\}/g, sel ? sel.nombre : '')
    .replace(/\{\{\s*selectedInstitucion\.codigo\s*\}\}/g, sel ? sel.codigo : '')
    .replace(/\{\{\s*selectedInstitucion\.logo_url\s*\}\}/g, sel ? sel.logo_url : '')
    .replace(/\{\{\s*selectedInstitucion\.fondo_url\s*\}\}/g, sel ? sel.fondo_url : '')
    .replace(/\{\{\s*selectedInstitucion\.color_primario\s*\}\}/g, sel ? (sel.color_primario || '#0284c7') : '#0284c7')
    .replace(/\{\{\s*selectedInstitucion\.diseno_carnet\s*\}\}/g, sel ? (sel.diseno_carnet || 'clasico') : 'clasico')
    .replace(/\{\{\s*selected_inst_id\s*\}\}/g, sel ? sel.id : '');

  // 5. Institution in carnet.html
  const inst = data.institucion || {
    id: 'default',
    nombre: 'Institución Educativa',
    codigo: 'INST',
    logo_url: '',
    fondo_url: '',
    color_primario: '#0284c7',
    diseno_carnet: 'clasico'
  };

  if (inst.logo_url) {
    html = html.replace(/{%\s*if institucion\.logo_url\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1');
  } else {
    html = html.replace(/{%\s*if institucion\.logo_url\s*%}([\s\S]*?){%\s*endif\s*%}/g, '');
  }

  html = html
    .replace(/\{\{\s*institucion\.id\s*\}\}/g, inst.id || '')
    .replace(/\{\{\s*institucion\.nombre\s*\}\}/g, inst.nombre || '')
    .replace(/\{\{\s*institucion\.codigo\s*\}\}/g, inst.codigo || '')
    .replace(/\{\{\s*institucion\.logo_url\s*\}\}/g, inst.logo_url || '')
    .replace(/\{\{\s*institucion\.fondo_url\s*\}\}/g, inst.fondo_url || '')
    .replace(/\{\{\s*institucion\.color_primario\s*\}\}/g, inst.color_primario || '#0284c7')
    .replace(/\{\{\s*institucion\.diseno_carnet\s*\}\}/g, inst.diseno_carnet || 'clasico');

  // 6. Student data in carnet.html
  if (data.estudiante) {
    const s: Estudiante = data.estudiante;
    const safeName = s.nombre.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');

    html = html
      .replace(/\{\{\s*estudiante\.numero_orden\s*\}\}/g, s.numero_orden.toString())
      .replace(/\{\{\s*estudiante\.nombre\s*\}\}/g, s.nombre)
      .replace(/\{\{\s*estudiante\.id\s*\}\}/g, s.id)
      .replace(/\{\{\s*estudiante\.telefono\s*\}\}/g, s.telefono)
      .replace(/\{\{\s*estudiante\.tanda\s*\}\}/g, s.tanda || 'No especificada')
      .replace(/\{\{\s*estudiante\.curso\s*\}\}/g, s.curso || 'No especificado')
      .replace(/\{\{\s*estudiante\.institucion_id\s*\}\}/g, s.institucion_id || '')
      .replace(/\{\{\s*estudiante\.institucion_nombre\s*\}\}/g, s.institucion_nombre || 'Sin Institución')
      .replace(/\{\{\s*estudiante\.foto_url\s*\}\}/g, s.foto_url)
      .replace(/\{\{\s*estudiante\.estado\s*\}\}/g, s.estado)
      .replace(/\{\{\s*estudiante\.hora_llegada\s*\}\}/g, s.hora_llegada || '')
      .replace(/\{\{\s*estudiante\.nombre_safe\s*\}\}/g, safeName)
      .replace(/\{\{\s*estudiante\.nombre\|replace\([^)]*\)\s*\}\}/g, safeName);

    if (s.estado === 'Presente') {
      html = html.replace(/{%\s*if estudiante\.estado == 'Presente'\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$1');
    } else {
      html = html.replace(/{%\s*if estudiante\.estado == 'Presente'\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, '$2');
    }
  }

  // 7. Admin table & Stats
  if (data.estudiantes && Array.isArray(data.estudiantes)) {
    const list: Estudiante[] = data.estudiantes;
    const stats = data.stats || { total: 0, presentes: 0, pendientes: 0, total_fotos_extras: 0 };

    html = html
      .replace(/\{\{\s*stats\.total\s*\}\}/g, stats.total.toString())
      .replace(/\{\{\s*stats\.presentes\s*\}\}/g, stats.presentes.toString())
      .replace(/\{\{\s*stats\.pendientes\s*\}\}/g, stats.pendientes.toString())
      .replace(/\{\{\s*stats\.total_fotos_extras\s*\}\}/g, stats.total_fotos_extras.toString());

    let rowsHtml = '';
    if (list.length > 0) {
      list.forEach(s => {
        const horaText = s.hora_llegada ? `<div class="text-secondary small mt-1" style="font-size: 0.7rem;">${s.hora_llegada}</div>` : '';
        const badgeStatus = s.estado === 'Presente'
          ? `<span class="badge bg-success bg-opacity-20 text-success border border-success px-2 py-1 rounded-pill"><i class="bi bi-check-circle-fill me-1"></i> Presente</span>${horaText}`
          : `<span class="badge bg-warning bg-opacity-20 text-warning border border-warning px-2 py-1 rounded-pill"><i class="bi bi-clock me-1"></i> Pendiente</span>`;

        const tandaVal = s.tanda || 'No especificada';
        const cursoVal = s.curso || 'No especificado';
        const instVal = s.institucion_nombre || 'Sin Institución';
        const instIdVal = s.institucion_id || '';

        rowsHtml += `
          <tr data-status="${s.estado}" data-institucion="${instIdVal}" data-name="${s.nombre.toLowerCase()}" data-order="${s.numero_orden}" data-phone="${s.telefono}" data-tanda="${tandaVal.toLowerCase()}" data-curso="${cursoVal.toLowerCase()}">
            <td class="text-center fw-bold fs-5 text-info">#${s.numero_orden}</td>
            <td><img src="${s.foto_url}" alt="${s.nombre}" class="avatar-mini" onclick="openStudentModal('${s.id}')" title="Ampliar"></td>
            <td>
              <div class="fw-bold text-white">${s.nombre}</div>
              <div class="d-flex align-items-center gap-1 mt-1 flex-wrap">
                <span class="badge bg-primary bg-opacity-20 text-info border border-primary border-opacity-30 rounded-pill px-2" style="font-size: 0.7rem;">
                  <i class="bi bi-building me-1"></i>${instVal}
                </span>
                <span class="badge bg-info bg-opacity-15 text-info border border-info border-opacity-20 rounded-pill px-2" style="font-size: 0.7rem;">
                  <i class="bi bi-mortarboard me-1"></i>${cursoVal}
                </span>
                <span class="badge bg-secondary bg-opacity-20 text-light border border-secondary border-opacity-20 rounded-pill px-2" style="font-size: 0.7rem;">
                  <i class="bi bi-sun me-1"></i>${tandaVal}
                </span>
              </div>
              <div class="text-secondary small mt-1" style="font-size: 0.7rem;">ID: ${s.id}</div>
            </td>
            <td>
              <a href="tel:${s.telefono}" class="text-light text-decoration-none">
                <i class="bi bi-telephone text-secondary me-1"></i> ${s.telefono}
              </a>
            </td>
            <td class="text-center">${badgeStatus}</td>
            <td class="text-center">
              <div class="d-flex align-items-center justify-content-center gap-2">
                <div class="form-check form-switch m-0" title="Activar Fotos Extras">
                  <input class="form-check-input" type="checkbox" id="switch_${s.id}" ${s.fotos_extras ? 'checked' : ''} onchange="toggleExtrasInput('${s.id}')">
                </div>
                <input type="number" min="0" max="50" id="cant_${s.id}" class="form-control form-control-sm-custom ${!s.fotos_extras ? 'd-none' : ''}" value="${s.cantidad_fotos_extras}">
                <button class="btn btn-sm btn-outline-info rounded-3" onclick="saveExtras('${s.id}')" title="Guardar">
                  <i class="bi bi-floppy"></i>
                </button>
              </div>
            </td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-light rounded-pill px-2 me-1" onclick="openStudentModal('${s.id}')" title="Ver Ficha">
                <i class="bi bi-eye-fill me-1"></i> Ficha
              </button>
              <a href="/carnet/${s.id}" class="btn btn-sm btn-outline-secondary rounded-pill px-2 text-white me-1" target="_blank" title="Ver Carnet">
                <i class="bi bi-person-badge"></i>
              </a>
              <button class="btn btn-sm btn-outline-danger rounded-pill px-2" onclick="confirmDeleteStudent('${s.id}', '${s.nombre.replace(/'/g, "\\'")}')" title="Eliminar Estudiante">
                <i class="bi bi-trash-fill"></i>
              </button>
            </td>
          </tr>
        `;
      });

      html = html.replace(/{%\s*if estudiantes\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, rowsHtml);
    } else {
      const emptyHtml = `
        <tr>
          <td colspan="7" class="text-center py-5 text-secondary">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            No hay estudiantes registrados aún. <a href="/registro" class="text-info">Registrar el primero</a>
          </td>
        </tr>
      `;
      html = html.replace(/{%\s*if estudiantes\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, emptyHtml);
    }
  }

  // Final Cleanup: remove any unparsed {% ... %} or {{ ... }} block leftover
  html = html
    .replace(/{%\s*[\s\S]*?%}/g, '')
    .replace(/\{\{\s*[^}]*?\s*\}\}/g, '');

  return html;
}

// Routes
app.get('/', (req: Request, res: Response) => {
  res.redirect('/registro');
});

app.get('/registro', (req: Request, res: Response) => {
  const instId = (req.query.inst_id as string) || '';
  const institucionesMap = loadInstituciones();
  const institucionesList = Object.values(institucionesMap);

  let selectedInst = instId ? institucionesMap[instId] : undefined;

  // If no specific inst_id parameter and only 1 institution exists, auto-select it
  if (!selectedInst && instId === '' && institucionesList.length === 1) {
    selectedInst = institucionesList[0];
  }

  const html = renderTemplate('registro.html', {
    instituciones: institucionesList,
    selectedInstitucion: selectedInst
  });
  res.send(html);
});

app.post('/registro', upload.single('foto'), (req: Request, res: Response) => {
  const nombre = (req.body.nombre || '').trim();
  const telefono = (req.body.telefono || '').trim();
  const tanda = (req.body.tanda || 'No especificada').trim();
  const curso = (req.body.curso || 'No especificado').trim();
  const institucionId = (req.body.institucion_id || '').trim();
  const file = req.file;

  const institucionesMap = loadInstituciones();
  const institucionesList = Object.values(institucionesMap);
  const selectedInst = institucionesMap[institucionId] || (institucionesList.length > 0 ? institucionesList[0] : undefined);

  if (!nombre || !telefono) {
    const html = renderTemplate('registro.html', {
      error: 'Por favor completa todos los campos requeridos.',
      instituciones: institucionesList,
      selectedInstitucion: selectedInst
    });
    return res.status(400).send(html);
  }

  if (!file) {
    const html = renderTemplate('registro.html', {
      error: 'La foto del rostro es obligatoria.',
      instituciones: institucionesList,
      selectedInstitucion: selectedInst
    });
    return res.status(400).send(html);
  }

  const fotoUrl = `/static/uploads/${file.filename}`;
  const numeroOrden = getNextOrderNumber();
  const estudianteId = `EST-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const now = new Date();
  const fechaRegistro = now.toISOString().replace('T', ' ').substring(0, 19);

  const instNombre = selectedInst ? selectedInst.nombre : 'General';

  const nuevoEstudiante: Estudiante = {
    id: estudianteId,
    numero_orden: numeroOrden,
    nombre,
    telefono,
    tanda,
    curso,
    institucion_id: selectedInst ? selectedInst.id : '',
    institucion_nombre: instNombre,
    foto_url: fotoUrl,
    estado: 'Pendiente',
    hora_llegada: null,
    fotos_extras: false,
    cantidad_fotos_extras: 0,
    fecha_registro: fechaRegistro
  };

  const dbData = loadEstudiantes();
  dbData[estudianteId] = nuevoEstudiante;
  saveEstudiantes(dbData);

  res.redirect(`/carnet/${estudianteId}`);
});

app.get('/carnet/:estudiante_id', (req: Request, res: Response) => {
  const { estudiante_id } = req.params;
  const dbData = loadEstudiantes();
  const estudiante = dbData[estudiante_id];

  if (!estudiante) {
    const html = renderTemplate('registro.html', { error: 'Estudiante no encontrado.' });
    return res.status(404).send(html);
  }

  const insts = loadInstituciones();
  const instList = Object.values(insts);
  const institucion = (estudiante.institucion_id && insts[estudiante.institucion_id])
    ? insts[estudiante.institucion_id]
    : (instList.length > 0 ? instList[0] : {
        id: 'default',
        nombre: 'Institución Educativa',
        codigo: 'INST',
        logo_url: '',
        fondo_url: '',
        color_primario: '#0284c7',
        diseno_carnet: 'clasico',
        fecha_creacion: new Date().toISOString()
      });

  const html = renderTemplate('carnet.html', { estudiante, institucion });
  res.send(html);
});

// Login & Auth Routes
app.get('/login', (req: Request, res: Response) => {
  const isAuth = 
    (req.signedCookies && req.signedCookies.admin_session === 'authenticated') ||
    (req.cookies && req.cookies.admin_session === 'authenticated') ||
    (req.cookies && req.cookies.admin_session_lax === 'authenticated') ||
    req.query.token === 'authenticated';

  if (isAuth) {
    const redirectTarget = (req.query.redirect as string) || '/admin';
    return res.redirect(redirectTarget);
  }
  const redirect = (req.query.redirect as string) || '';
  const html = renderTemplate('login.html', { redirect });
  res.send(html);
});

app.post('/login', (req: Request, res: Response) => {
  const usuario = (req.body.usuario || '').trim();
  const password = (req.body.password || '').trim();
  const redirectTarget = (req.query.redirect as string) || (req.body.redirect as string) || '/admin';

  const creds = getAdminCredentials();

  if (usuario === creds.usuario && password === creds.password) {
    setAuthCookies(res);
    return res.redirect(redirectTarget);
  } else {
    const html = renderTemplate('login.html', {
      error: 'Usuario o contraseña incorrectos.',
      redirect: redirectTarget
    });
    return res.status(401).send(html);
  }
});

app.post('/api/login', (req: Request, res: Response) => {
  const usuario = (req.body.usuario || '').trim();
  const password = (req.body.password || '').trim();

  const creds = getAdminCredentials();

  if (usuario === creds.usuario && password === creds.password) {
    setAuthCookies(res);
    return res.json({
      success: true,
      token: 'authenticated',
      message: 'Inicio de sesión exitoso.'
    });
  } else {
    return res.status(401).json({
      success: false,
      message: 'Usuario o contraseña incorrectos.'
    });
  }
});

app.get('/logout', (req: Request, res: Response) => {
  res.clearCookie('admin_session', { sameSite: 'none', secure: true });
  res.clearCookie('admin_session_lax');
  res.redirect('/login?logout=1');
});

app.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('admin_session', { sameSite: 'none', secure: true });
  res.clearCookie('admin_session_lax');
  res.redirect('/login?logout=1');
});

app.post('/api/cambiar_clave', requireAdminAuth, (req: Request, res: Response) => {
  const { currentPassword, newUsuario, newPassword } = req.body;
  const creds = getAdminCredentials();

  if (currentPassword !== creds.password) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña actual no es correcta.'
    });
  }

  if (!newUsuario || !newPassword || newUsuario.trim().length < 3 || newPassword.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'El nuevo usuario y contraseña deben tener al menos 3 caracteres.'
    });
  }

  saveAdminCredentials(newUsuario.trim(), newPassword.trim());

  return res.json({
    success: true,
    message: 'Credenciales de administrador actualizadas correctamente.'
  });
});

app.get('/admin', requireAdminAuth, (req: Request, res: Response) => {
  const dbData = loadEstudiantes();
  const list = Object.values(dbData).sort((a, b) => a.numero_orden - b.numero_orden);

  const total = list.length;
  const presentes = list.filter(s => s.estado === 'Presente').length;
  const pendientes = total - presentes;
  const total_fotos_extras = list.reduce((acc, curr) => acc + (curr.fotos_extras ? curr.cantidad_fotos_extras || 0 : 0), 0);

  const instsMap = loadInstituciones();
  const instsList = Object.values(instsMap);

  const html = renderTemplate('admin.html', {
    estudiantes: list,
    instituciones: instsList,
    stats: { total, presentes, pendientes, total_fotos_extras }
  });

  res.send(html);
});

// APIs para Gestión de Instituciones
app.get('/api/instituciones', (req: Request, res: Response) => {
  const insts = loadInstituciones();
  const students = Object.values(loadEstudiantes());

  const list = Object.values(insts).map(inst => {
    const count = students.filter(s => s.institucion_id === inst.id).length;
    return { ...inst, estudiantes_count: count };
  });

  res.json(list);
});

app.post('/api/institucion', requireAdminAuth, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'fondo', maxCount: 1 }]), (req: Request, res: Response) => {
  try {
    const { id, nombre, codigo, color_primario, diseno_carnet, descripcion, logo_url_text, fondo_url_text } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre de la institución es obligatorio.' });
    }

    const insts = loadInstituciones();
    const instId = id && insts[id] ? id : `inst_${Date.now()}`;
    const isNew = !insts[instId];

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    let logoUrl = insts[instId]?.logo_url || 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=300&auto=format&fit=crop&q=80';
    if (files && files['logo'] && files['logo'][0]) {
      logoUrl = `/static/uploads/${files['logo'][0].filename}`;
    } else if (logo_url_text && logo_url_text.trim()) {
      logoUrl = logo_url_text.trim();
    }

    let fondoUrl = insts[instId]?.fondo_url || 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&auto=format&fit=crop&q=80';
    if (files && files['fondo'] && files['fondo'][0]) {
      fondoUrl = `/static/uploads/${files['fondo'][0].filename}`;
    } else if (fondo_url_text && fondo_url_text.trim()) {
      fondoUrl = fondo_url_text.trim();
    }

    const updatedInst: Institucion = {
      id: instId,
      nombre: nombre.trim(),
      codigo: (codigo || '').trim() || 'INST',
      logo_url: logoUrl,
      fondo_url: fondoUrl,
      color_primario: color_primario || '#0284c7',
      diseno_carnet: diseno_carnet || 'clasico',
      descripcion: (descripcion || '').trim(),
      fecha_creacion: insts[instId]?.fecha_creacion || new Date().toISOString()
    };

    insts[instId] = updatedInst;
    saveInstituciones(insts);

    // Update students records if institution name changed
    if (!isNew) {
      const students = loadEstudiantes();
      let updatedStudents = false;
      Object.values(students).forEach(s => {
        if (s.institucion_id === instId && s.institucion_nombre !== updatedInst.nombre) {
          s.institucion_nombre = updatedInst.nombre;
          updatedStudents = true;
        }
      });
      if (updatedStudents) {
        saveEstudiantes(students);
      }
    }

    return res.json({
      success: true,
      message: isNew ? 'Institución creada exitosamente.' : 'Institución actualizada correctamente.',
      institucion: updatedInst
    });
  } catch (err: any) {
    console.error('Error guardando institución:', err);
    return res.status(500).json({ success: false, message: 'Error interno al guardar la institución.' });
  }
});

app.delete('/api/institucion/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const insts = loadInstituciones();
  if (!insts[id]) {
    return res.status(404).json({ success: false, message: 'Institución no encontrada.' });
  }

  delete insts[id];
  saveInstituciones(insts);
  return res.json({ success: true, message: 'Institución eliminada correctamente.' });
});

app.get('/escanear', requireAdminAuth, (req: Request, res: Response) => {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'escanear.html'), 'utf-8');
  res.send(html);
});

// APIs JSON
app.post('/api/checkin', requireAdminAuth, (req: Request, res: Response) => {
  const estudiante_id = (req.body.estudiante_id || '').trim();

  if (!estudiante_id) {
    return res.status(400).json({
      success: false,
      code: 'NO_ID',
      message: 'Código QR no proporcionado.'
    });
  }

  const dbData = loadEstudiantes();
  const estudiante = dbData[estudiante_id];

  if (!estudiante) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `Código no registrado (${estudiante_id}). Verifique los datos.`
    });
  }

  if (estudiante.estado === 'Presente') {
    return res.status(200).json({
      success: false,
      code: 'ALREADY_CHECKED_IN',
      message: `¡Atención! ${estudiante.nombre} ya ingresó a las ${estudiante.hora_llegada}.`,
      estudiante
    });
  }

  // Update check-in status
  const now = new Date();
  const horaActual = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  estudiante.estado = 'Presente';
  estudiante.hora_llegada = horaActual;

  dbData[estudiante_id] = estudiante;
  saveEstudiantes(dbData);

  return res.status(200).json({
    success: true,
    code: 'SUCCESS',
    message: `¡Check-In exitoso! Bienvenido/a ${estudiante.nombre}.`,
    estudiante
  });
});

app.post('/api/actualizar_fotos_extras', requireAdminAuth, (req: Request, res: Response) => {
  const { estudiante_id, fotos_extras, cantidad_fotos_extras } = req.body;

  if (!estudiante_id) {
    return res.status(400).json({ success: false, message: 'ID de estudiante no enviado.' });
  }

  const dbData = loadEstudiantes();
  const estudiante = dbData[estudiante_id];

  if (!estudiante) {
    return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
  }

  estudiante.fotos_extras = Boolean(fotos_extras);
  estudiante.cantidad_fotos_extras = estudiante.fotos_extras ? Number(cantidad_fotos_extras || 0) : 0;

  dbData[estudiante_id] = estudiante;
  saveEstudiantes(dbData);

  return res.json({
    success: true,
    message: `Fotos extras actualizadas para ${estudiante.nombre}.`,
    estudiante
  });
});

app.get('/api/estudiantes', requireAdminAuth, (req: Request, res: Response) => {
  const dbData = loadEstudiantes();
  const list = Object.values(dbData).sort((a, b) => a.numero_orden - b.numero_orden);
  res.json(list);
});

app.get('/api/estudiante/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const dbData = loadEstudiantes();
  const estudiante = dbData[id];

  if (!estudiante) {
    return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
  }

  res.json({ success: true, estudiante });
});

// Delete student API
app.post('/api/eliminar_estudiante', requireAdminAuth, (req: Request, res: Response) => {
  const estudiante_id = (req.body.estudiante_id || '').trim();

  if (!estudiante_id) {
    return res.status(400).json({ success: false, message: 'ID de estudiante no proporcionado.' });
  }

  const dbData = loadEstudiantes();
  const student = dbData[estudiante_id];

  if (!student) {
    return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
  }

  // Delete photo if exists
  if (student.foto_url && student.foto_url.startsWith('/static/uploads/')) {
    const filename = path.basename(student.foto_url);
    const photoPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(photoPath)) {
      try {
        fs.unlinkSync(photoPath);
      } catch (err) {
        console.error('Error al eliminar archivo de foto:', err);
      }
    }
  }

  delete dbData[estudiante_id];
  saveEstudiantes(dbData);

  return res.json({
    success: true,
    message: `Estudiante ${student.nombre} eliminado exitosamente.`
  });
});

app.delete('/api/estudiante/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const dbData = loadEstudiantes();
  const student = dbData[id];

  if (!student) {
    return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
  }

  if (student.foto_url && student.foto_url.startsWith('/static/uploads/')) {
    const filename = path.basename(student.foto_url);
    const photoPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(photoPath)) {
      try {
        fs.unlinkSync(photoPath);
      } catch (err) {
        console.error('Error al eliminar archivo de foto:', err);
      }
    }
  }

  delete dbData[id];
  saveEstudiantes(dbData);

  return res.json({
    success: true,
    message: `Estudiante ${student.nombre} eliminado exitosamente.`
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de Gestión Fotográfica corriendo en http://0.0.0.0:${PORT}`);
});
