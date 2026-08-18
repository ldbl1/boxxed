const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'boxxed_secure_session_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Servir estáticos
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Base de datos (asegurar carpeta)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'boxxed.db');
const db = new sqlite3.Database(dbPath);

// Tablas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, group_id INTEGER, is_superuser BOOLEAN DEFAULT 0, FOREIGN KEY(group_id) REFERENCES groups(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, group_id INTEGER, FOREIGN KEY(group_id) REFERENCES groups(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, quantity INTEGER DEFAULT 1, category_id INTEGER, group_id INTEGER, tags TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, modified_by TEXT, modified_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(category_id) REFERENCES categories(id), FOREIGN KEY(group_id) REFERENCES groups(id))`);
});

// Autenticación web
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login.html');
}

// Rutas de Páginas
app.get('/', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/settings', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// API Setup y Login
app.get('/api/check-setup', (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM users WHERE is_superuser = 1`, (err, row) => {
        if (err || !row || row.count === 0) {
            return res.json({ needsSetup: true });
        }
        res.json({ needsSetup: false });
    });
});

app.post('/api/setup', async (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT COUNT(*) as count FROM users WHERE is_superuser = 1`, async (err, row) => {
        if (!err && row && row.count > 0) return res.status(403).json({ error: 'Ya existe un superusuario' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, is_superuser) VALUES (?, ?, 1)`, [username, hashedPassword], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Forzar guardado de sesión antes de responder
            req.session.user = { id: this.lastID, username, is_superuser: true };
            req.session.save(() => {
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Credenciales inválidas' });
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
        
        // Forzar guardado de sesión antes de responder
        req.session.user = { id: user.id, username: user.username, is_superuser: user.is_superuser === 1 };
        req.session.save(() => {
            res.json({ success: true, user: req.session.user });
        });
    });
});

// API Ítems de ejemplo
app.get('/api/items', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM items ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor Boxxed ejecutándose en el puerto ${PORT}`);
});