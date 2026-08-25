const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const SESSION_COOKIE_NAME = 'boxxed.sid';
const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    'boxxed-development-secret-change-this-value';
const SESSION_SECURE = process.env.SESSION_SECURE === 'true';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 20, fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        callback(null, file.mimetype.startsWith('image/'));
    }
});

// Middlewares generales
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (SESSION_SECURE) {
    app.set('trust proxy', 1);
}

app.use(
    session({
        name: SESSION_COOKIE_NAME,
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: SESSION_SECURE,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// Servir archivos estaticos sin entregar index.html automaticamente
app.use(
    express.static(path.join(__dirname, 'public'), {
        index: false
    })
);

app.use(
    '/vendor',
    express.static(path.join(__dirname, 'node_modules'))
);

// Base de datos
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'boxxed.db');
const db = new sqlite3.Database(dbPath, err => {
    if (err) {
        console.error('Error abriendo la base de datos:', err);
        process.exit(1);
    }

    console.log(`Base de datos SQLite: ${dbPath}`);
});

// Creacion de tablas
db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    db.run(`
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            group_id INTEGER,
            is_superuser BOOLEAN DEFAULT 0,
            FOREIGN KEY (group_id) REFERENCES groups(id)
                ON DELETE SET NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            group_id INTEGER,
            FOREIGN KEY (group_id) REFERENCES groups(id)
                ON DELETE SET NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            quantity INTEGER DEFAULT 1,
            category_id INTEGER,
            group_id INTEGER,
            tags TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            modified_by TEXT,
            modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
                ON DELETE SET NULL,
            FOREIGN KEY (group_id) REFERENCES groups(id)
                ON DELETE SET NULL
        )
    `);

    db.run(`ALTER TABLE items ADD COLUMN barcode_value TEXT`, () => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS item_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    db.all(
        `SELECT id, tags FROM items WHERE COALESCE(tags, '') <> ''`,
        [],
        (err, rows) => {
            if (err) return;
            rows.forEach(row => syncItemTags(row.id, row.tags, () => {}));
        }
    );
});

// Funciones auxiliares
function normalizeOptionalId(value) {
    if (
        value === undefined ||
        value === null ||
        value === '' ||
        value === 'null'
    ) {
        return null;
    }

    const parsedValue = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        return null;
    }

    return parsedValue;
}

function handleDatabaseError(res, err, defaultMessage) {
    console.error(defaultMessage, err);

    if (
        err &&
        (err.code === 'SQLITE_CONSTRAINT' ||
            err.code === 'SQLITE_CONSTRAINT_UNIQUE')
    ) {
        return res.status(409).json({
            error: 'Ya existe un registro con esos datos'
        });
    }

    return res.status(500).json({ error: defaultMessage });
}

function normalizeTagNames(value) {
    const values = Array.isArray(value)
        ? value
        : String(value || '').split(',');

    return [...new Set(values
        .map(tag => String(tag).trim())
        .filter(Boolean))].slice(0, 50);
}

function syncItemTags(itemId, tagNames, callback) {
    const normalizedTags = normalizeTagNames(tagNames);

    db.run('DELETE FROM item_tags WHERE item_id = ?', [itemId], deleteErr => {
        if (deleteErr) return callback(deleteErr);

        let index = 0;
        const next = () => {
            if (index >= normalizedTags.length) return callback(null);

            const tagName = normalizedTags[index++];
            db.run(
                'INSERT OR IGNORE INTO tags (name) VALUES (?)',
                [tagName],
                insertErr => {
                    if (insertErr) return callback(insertErr);

                    db.get(
                        'SELECT id FROM tags WHERE name = ? COLLATE NOCASE',
                        [tagName],
                        (findErr, tag) => {
                            if (findErr || !tag) return callback(findErr || new Error('Etiqueta no encontrada'));

                            db.run(
                                'INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)',
                                [itemId, tag.id],
                                linkErr => {
                                    if (linkErr) return callback(linkErr);
                                    next();
                                }
                            );
                        }
                    );
                }
            );
        };

        next();
    });
}

// Autenticacion
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }

    return res.redirect('/login.html');
}

function isApiAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }

    return res.status(401).json({
        error: 'Sesion no valida o caducada'
    });
}

function isSuperuser(req, res, next) {
    if (
        req.session &&
        req.session.user &&
        req.session.user.is_superuser
    ) {
        return next();
    }

    return res.status(403).json({
        error: 'Se requieren permisos de administrador'
    });
}

function isItemVisibleToUser(item, user) {
    return Boolean(
        user &&
        (user.is_superuser ||
            item.group_id === null ||
            Number(item.group_id) === Number(user.group_id))
    );
}

function requireItemAccess(itemId, req, res, callback) {
    db.get(
        'SELECT id, group_id FROM items WHERE id = ?',
        [itemId],
        (err, item) => {
            if (err) return handleDatabaseError(res, err, 'No se pudo comprobar el articulo');
            if (!item || !isItemVisibleToUser(item, req.session.user)) {
                return res.status(404).json({ error: 'Articulo no encontrado' });
            }
            return callback(item);
        }
    );
}

// Rutas de paginas
app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/settings', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Estado de la sesion
app.get('/api/session', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ authenticated: false });
    }

    return res.json({
        authenticated: true,
        user: req.session.user
    });
});

app.get('/api/loc/:lang', (req, res) => {
    const allowedLanguages = new Set(['es-ES', 'en-GB']);
    const language = String(req.params.lang || '');

    if (!allowedLanguages.has(language)) {
        return res.status(404).json({ error: 'Idioma no encontrado' });
    }

    const filePath = path.join(__dirname, 'loc', `${language}.json`);
    return res.sendFile(filePath);
});

// Comprobacion del setup inicial
app.get('/api/check-setup', (req, res) => {
    db.get(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE is_superuser = 1`,
        [],
        (err, row) => {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo comprobar la configuracion inicial'
                );
            }

            return res.json({ needsSetup: !row || row.count === 0 });
        }
    );
});

// Creacion del primer superusuario
app.post('/api/setup', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
        return res.status(400).json({
            error: 'El usuario y la contrasena son obligatorios'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: 'La contrasena debe tener al menos 6 caracteres'
        });
    }

    db.get(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE is_superuser = 1`,
        [],
        async (err, row) => {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo comprobar el superusuario'
                );
            }

            if (row && row.count > 0) {
                return res.status(403).json({
                    error: 'Ya existe un superusuario'
                });
            }

            try {
                const hashedPassword = await bcrypt.hash(password, 10);

                db.run(
                    `INSERT INTO users (username, password, is_superuser)
                     VALUES (?, ?, 1)`,
                    [username, hashedPassword],
                    function insertSuperuser(insertErr) {
                        if (insertErr) {
                            return handleDatabaseError(
                                res,
                                insertErr,
                                'No se pudo crear el superusuario'
                            );
                        }

                        req.session.user = {
                            id: this.lastID,
                            username,
                            group_id: null,
                            is_superuser: true
                        };

                        req.session.save(sessionErr => {
                            if (sessionErr) {
                                console.error(
                                    'Error guardando la sesion:',
                                    sessionErr
                                );
                                return res.status(500).json({
                                    error: 'No se pudo iniciar la sesion'
                                });
                            }

                            return res.status(201).json({
                                success: true,
                                user: req.session.user
                            });
                        });
                    }
                );
            } catch (hashErr) {
                console.error('Error cifrando la contrasena:', hashErr);
                return res.status(500).json({
                    error: 'No se pudo crear el superusuario'
                });
            }
        }
    );
});

// Login
app.post('/api/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
        return res.status(400).json({
            error: 'El usuario y la contrasena son obligatorios'
        });
    }

    db.get(
        `SELECT * FROM users WHERE username = ?`,
        [username],
        async (err, user) => {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo realizar el inicio de sesion'
                );
            }

            if (!user) {
                return res.status(401).json({
                    error: 'Credenciales invalidas'
                });
            }

            try {
                const passwordMatches = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!passwordMatches) {
                    return res.status(401).json({
                        error: 'Credenciales invalidas'
                    });
                }

                req.session.user = {
                    id: user.id,
                    username: user.username,
                    group_id: user.group_id,
                    is_superuser: user.is_superuser === 1
                };

                req.session.save(sessionErr => {
                    if (sessionErr) {
                        console.error('Error guardando la sesion:', sessionErr);
                        return res.status(500).json({
                            error: 'No se pudo iniciar la sesion'
                        });
                    }

                    return res.json({
                        success: true,
                        user: req.session.user
                    });
                });
            } catch (compareErr) {
                console.error('Error comprobando la contrasena:', compareErr);
                return res.status(500).json({
                    error: 'No se pudo realizar el inicio de sesion'
                });
            }
        }
    );
});

// Logout
app.post('/api/logout', (req, res) => {
    if (!req.session) {
        res.clearCookie(SESSION_COOKIE_NAME);
        return res.json({ success: true });
    }

    req.session.destroy(err => {
        if (err) {
            console.error('Error destruyendo la sesion:', err);
            return res.status(500).json({
                error: 'No se pudo cerrar la sesion'
            });
        }

        res.clearCookie(SESSION_COOKIE_NAME, {
            httpOnly: true,
            sameSite: 'lax',
            secure: SESSION_SECURE
        });

        return res.json({ success: true });
    });
});

// API de grupos
app.get('/api/groups', isApiAuthenticated, (req, res) => {
    const sql = `
        SELECT
            groups.id,
            groups.name,
            (SELECT COUNT(*) FROM users
             WHERE users.group_id = groups.id) AS user_count,
            (SELECT COUNT(*) FROM categories
             WHERE categories.group_id = groups.id) AS category_count,
            (SELECT COUNT(*) FROM items
             WHERE items.group_id = groups.id) AS item_count
        FROM groups
        ORDER BY groups.name COLLATE NOCASE ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudieron cargar los grupos'
            );
        }
        return res.json(rows);
    });
});

app.post('/api/groups', isApiAuthenticated, isSuperuser, (req, res) => {
    const name = String(req.body.name || '').trim();

    if (!name) {
        return res.status(400).json({
            error: 'El nombre del grupo es obligatorio'
        });
    }

    db.run(
        `INSERT INTO groups (name) VALUES (?)`,
        [name],
        function insertGroup(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo crear el grupo'
                );
            }

            return res.status(201).json({
                success: true,
                group: {
                    id: this.lastID,
                    name,
                    user_count: 0,
                    category_count: 0,
                    item_count: 0
                }
            });
        }
    );
});

app.put('/api/groups/:id', isApiAuthenticated, isSuperuser, (req, res) => {
    const groupId = Number.parseInt(req.params.id, 10);
    const name = String(req.body.name || '').trim();

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({
            error: 'Identificador de grupo no valido'
        });
    }

    if (!name) {
        return res.status(400).json({
            error: 'El nombre del grupo es obligatorio'
        });
    }

    db.run(
        `UPDATE groups SET name = ? WHERE id = ?`,
        [name, groupId],
        function updateGroup(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo actualizar el grupo'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Grupo no encontrado' });
            }

            return res.json({
                success: true,
                group: { id: groupId, name }
            });
        }
    );
});

app.delete('/api/groups/:id', isApiAuthenticated, isSuperuser, (req, res) => {
    const groupId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({
            error: 'Identificador de grupo no valido'
        });
    }

    db.run(
        `DELETE FROM groups WHERE id = ?`,
        [groupId],
        function deleteGroup(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo eliminar el grupo'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Grupo no encontrado' });
            }

            return res.json({ success: true });
        }
    );
});

// API de categorias
app.get('/api/categories', isApiAuthenticated, (req, res) => {
    const sql = `
        SELECT
            categories.id,
            categories.name,
            categories.group_id,
            groups.name AS group_name,
            (SELECT COUNT(*) FROM items
             WHERE items.category_id = categories.id) AS item_count
        FROM categories
        LEFT JOIN groups ON groups.id = categories.group_id
        ORDER BY categories.name COLLATE NOCASE ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudieron cargar las categorias'
            );
        }
        return res.json(rows);
    });
});

app.post('/api/categories', isApiAuthenticated, (req, res) => {
    const name = String(req.body.name || '').trim();
    const groupId = normalizeOptionalId(req.body.group_id);

    if (!name) {
        return res.status(400).json({
            error: 'El nombre de la categoria es obligatorio'
        });
    }

    db.run(
        `INSERT INTO categories (name, group_id) VALUES (?, ?)`,
        [name, groupId],
        function insertCategory(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo crear la categoria'
                );
            }

            return res.status(201).json({
                success: true,
                category: {
                    id: this.lastID,
                    name,
                    group_id: groupId,
                    item_count: 0
                }
            });
        }
    );
});

app.put('/api/categories/:id', isApiAuthenticated, (req, res) => {
    const categoryId = Number.parseInt(req.params.id, 10);
    const name = String(req.body.name || '').trim();
    const groupId = normalizeOptionalId(req.body.group_id);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
            error: 'Identificador de categoria no valido'
        });
    }

    if (!name) {
        return res.status(400).json({
            error: 'El nombre de la categoria es obligatorio'
        });
    }

    db.run(
        `UPDATE categories SET name = ?, group_id = ? WHERE id = ?`,
        [name, groupId, categoryId],
        function updateCategory(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo actualizar la categoria'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: 'Categoria no encontrada'
                });
            }

            return res.json({
                success: true,
                category: { id: categoryId, name, group_id: groupId }
            });
        }
    );
});

app.delete('/api/categories/:id', isApiAuthenticated, (req, res) => {
    const categoryId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
            error: 'Identificador de categoria no valido'
        });
    }

    db.run(
        `DELETE FROM categories WHERE id = ?`,
        [categoryId],
        function deleteCategory(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo eliminar la categoria'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: 'Categoria no encontrada'
                });
            }

            return res.json({ success: true });
        }
    );
});

// API de etiquetas
app.get('/api/tags', isApiAuthenticated, (req, res) => {
    db.all(
        `SELECT tags.id, tags.name,
                (SELECT COUNT(*) FROM item_tags WHERE item_tags.tag_id = tags.id) AS item_count
         FROM tags
         ORDER BY tags.name COLLATE NOCASE ASC`,
        [],
        (err, rows) => {
            if (err) return handleDatabaseError(res, err, 'No se pudieron cargar las etiquetas');
            return res.json(rows);
        }
    );
});

app.post('/api/tags', isApiAuthenticated, (req, res) => {
    const name = String(req.body.name || '').trim();

    if (!name) return res.status(400).json({ error: 'El nombre de la etiqueta es obligatorio' });

    db.run(
        'INSERT OR IGNORE INTO tags (name) VALUES (?)',
        [name],
        function createTag(err) {
            if (err) return handleDatabaseError(res, err, 'No se pudo crear la etiqueta');

            db.get('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE', [name], (findErr, tag) => {
                if (findErr || !tag) return handleDatabaseError(res, findErr, 'No se pudo cargar la etiqueta');
                return res.status(this.changes ? 201 : 200).json({ success: true, tag });
            });
        }
    );
});

// API de articulos
app.get('/api/items', isApiAuthenticated, (req, res) => {
    const search = String(req.query.search || '').trim();
    const searchPattern = `%${search}%`;
    const categoryFilter = normalizeOptionalId(req.query.category_id);
    const groupFilter = normalizeOptionalId(req.query.group_id);

    const sql = `
        SELECT
            items.id,
            items.name,
            items.description,
            items.quantity,
            items.category_id,
            items.group_id,
            COALESCE(
                (SELECT group_concat(tags.name, ', ')
                 FROM item_tags
                 INNER JOIN tags ON tags.id = item_tags.tag_id
                 WHERE item_tags.item_id = items.id),
                items.tags,
                ''
            ) AS tags,
            items.created_by,
            items.created_at,
            items.modified_by,
            items.modified_at,
            items.barcode_value,
            (SELECT COUNT(*) FROM item_photos
             WHERE item_photos.item_id = items.id) AS photo_count,
            (SELECT item_photos.id FROM item_photos
             WHERE item_photos.item_id = items.id
             ORDER BY item_photos.id ASC LIMIT 1) AS first_photo_id,
            categories.name AS category_name,
            groups.name AS group_name
        FROM items
        LEFT JOIN categories ON categories.id = items.category_id
        LEFT JOIN groups ON groups.id = items.group_id
        WHERE
            (? = '' OR items.name LIKE ?
             OR COALESCE(items.description, '') LIKE ?
             OR COALESCE(items.tags, '') LIKE ?
             OR EXISTS (
                 SELECT 1 FROM item_tags
                 INNER JOIN tags ON tags.id = item_tags.tag_id
                 WHERE item_tags.item_id = items.id
                   AND tags.name LIKE ?
             )
             OR COALESCE(categories.name, '') LIKE ?
             OR COALESCE(groups.name, '') LIKE ?
             OR COALESCE(items.barcode_value, '') LIKE ?)
            AND (? IS NULL OR items.category_id = ?)
            AND (? IS NULL OR items.group_id = ?)
            AND (? = 1 OR items.group_id IS NULL OR items.group_id = ?)
        ORDER BY items.id DESC
    `;

    const params = [
        search,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        categoryFilter,
        categoryFilter,
        groupFilter,
        groupFilter,
        req.session.user.is_superuser ? 1 : 0,
        req.session.user.group_id || 0
    ];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudieron cargar los articulos'
            );
        }
        return res.json(rows);
    });
});

app.post('/api/items', isApiAuthenticated, (req, res) => {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const tagNames = normalizeTagNames(req.body.tag_names ?? req.body.tags);
    const tags = tagNames.join(', ');
    const parsedQuantity = Number.parseInt(req.body.quantity, 10);
    const quantity = Number.isInteger(parsedQuantity) ? parsedQuantity : 1;
    const categoryId = normalizeOptionalId(req.body.category_id);
    const groupId = normalizeOptionalId(req.body.group_id);
    const barcodeValue = String(req.body.barcode_value || '').trim();
    const username = req.session.user.username;

    if (!name) {
        return res.status(400).json({
            error: 'El nombre del articulo es obligatorio'
        });
    }

    if (quantity < 0) {
        return res.status(400).json({
            error: 'La cantidad no puede ser negativa'
        });
    }

    const sql = `
        INSERT INTO items (
            name, description, quantity, category_id,
            group_id, tags, barcode_value, created_by, modified_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        name,
        description,
        quantity,
        categoryId,
        groupId,
        tags,
        barcodeValue,
        username,
        username
    ];

    db.run(sql, params, function insertItem(err) {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudo guardar el articulo'
            );
        }

        const itemId = this.lastID;
        syncItemTags(itemId, tagNames, syncErr => {
            if (syncErr) return handleDatabaseError(res, syncErr, 'No se pudieron guardar las etiquetas');

            return res.status(201).json({
                success: true,
                item: {
                    id: itemId,
                    name,
                    description,
                    quantity,
                    category_id: categoryId,
                    group_id: groupId,
                    tags,
                    barcode_value: barcodeValue,
                    created_by: username,
                    modified_by: username
                }
            });
        });
    });
});

app.put('/api/items/:id', isApiAuthenticated, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const tagNames = normalizeTagNames(req.body.tag_names ?? req.body.tags);
    const tags = tagNames.join(', ');
    const parsedQuantity = Number.parseInt(req.body.quantity, 10);
    const categoryId = normalizeOptionalId(req.body.category_id);
    const groupId = normalizeOptionalId(req.body.group_id);
    const barcodeValue = String(req.body.barcode_value || '').trim();
    const username = req.session.user.username;

    if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({
            error: 'Identificador de articulo no valido'
        });
    }

    if (!name) {
        return res.status(400).json({
            error: 'El nombre del articulo es obligatorio'
        });
    }

    if (!Number.isInteger(parsedQuantity)) {
        return res.status(400).json({
            error: 'La cantidad debe ser un numero entero'
        });
    }

    if (parsedQuantity < 0) {
        return res.status(400).json({
            error: 'La cantidad no puede ser negativa'
        });
    }

    const sql = `
        UPDATE items
        SET
            name = ?,
            description = ?,
            quantity = ?,
            category_id = ?,
            group_id = ?,
            tags = ?,
            barcode_value = ?,
            modified_by = ?,
            modified_at = CURRENT_TIMESTAMP
                WHERE id = ?
                    AND (? = 1 OR group_id IS NULL OR group_id = ?)
    `;

    const params = [
        name,
        description,
        parsedQuantity,
        categoryId,
        groupId,
        tags,
        barcodeValue,
        username,
        itemId,
        req.session.user.is_superuser ? 1 : 0,
        req.session.user.group_id || 0
    ];

    db.run(sql, params, function updateItem(err) {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudo actualizar el articulo'
            );
        }

        if (this.changes === 0) {
            return res.status(404).json({
                error: 'Articulo no encontrado'
            });
        }

        syncItemTags(itemId, tagNames, syncErr => {
            if (syncErr) return handleDatabaseError(res, syncErr, 'No se pudieron guardar las etiquetas');

            return res.json({
                success: true,
                item: {
                    id: itemId,
                    name,
                    description,
                    quantity: parsedQuantity,
                    category_id: categoryId,
                    group_id: groupId,
                    tags,
                    barcode_value: barcodeValue,
                    modified_by: username
                }
            });
        });
    });
});

app.post(
    '/api/items/:id/photos',
    isApiAuthenticated,
    upload.array('photos', 20),
    (req, res) => {
        const itemId = Number.parseInt(req.params.id, 10);
        const files = req.files || [];

        if (!Number.isInteger(itemId) || itemId <= 0) {
            return res.status(400).json({ error: 'Identificador de articulo no valido' });
        }

        if (files.length === 0) {
            return res.status(400).json({ error: 'Selecciona al menos una imagen' });
        }

        requireItemAccess(itemId, req, res, () => {
            const statement = db.prepare(
                `INSERT INTO item_photos (item_id, filename, mimetype, data)
                 VALUES (?, ?, ?, ?)`
            );
            let insertError = null;
            files.forEach(file => {
                statement.run(itemId, file.originalname, file.mimetype, file.buffer, err => {
                    if (err) insertError = err;
                });
            });
            statement.finalize(err => {
                if (insertError || err) {
                    return handleDatabaseError(res, insertError || err, 'No se pudieron guardar las fotos');
                }
                return res.status(201).json({ success: true, count: files.length });
            });
        });
    }
);

app.get('/api/items/:itemId/photos/:photoId', isApiAuthenticated, (req, res) => {
    const itemId = Number.parseInt(req.params.itemId, 10);
    const photoId = Number.parseInt(req.params.photoId, 10);

    requireItemAccess(itemId, req, res, () => {
        db.get(
            `SELECT mimetype, data FROM item_photos WHERE id = ? AND item_id = ?`,
            [photoId, itemId],
            (err, photo) => {
                if (err) return handleDatabaseError(res, err, 'No se pudo cargar la foto');
                if (!photo) return res.status(404).send('Foto no encontrada');
                res.type(photo.mimetype).send(photo.data);
            }
        );
    });
});

app.get('/api/items/:itemId/photos', isApiAuthenticated, (req, res) => {
    const itemId = Number.parseInt(req.params.itemId, 10);

    if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Identificador de articulo no valido' });
    }

    requireItemAccess(itemId, req, res, () => {
        db.all(
            `SELECT id, filename, mimetype, created_at
             FROM item_photos
             WHERE item_id = ?
             ORDER BY id ASC`,
            [itemId],
            (err, photos) => {
                if (err) return handleDatabaseError(res, err, 'No se pudieron cargar las fotos');

                return res.json(photos.map(photo => ({
                    ...photo,
                    url: `/api/items/${itemId}/photos/${photo.id}`
                })));
            }
        );
    });
});

app.delete('/api/items/:itemId/photos/:photoId', isApiAuthenticated, (req, res) => {
    const itemId = Number.parseInt(req.params.itemId, 10);
    const photoId = Number.parseInt(req.params.photoId, 10);

    if (!Number.isInteger(itemId) || !Number.isInteger(photoId) || itemId <= 0 || photoId <= 0) {
        return res.status(400).json({ error: 'Identificador de foto no valido' });
    }

    requireItemAccess(itemId, req, res, () => {
        db.run(
            'DELETE FROM item_photos WHERE id = ? AND item_id = ?',
            [photoId, itemId],
            function deletePhoto(err) {
                if (err) return handleDatabaseError(res, err, 'No se pudo eliminar la foto');
                if (this.changes === 0) return res.status(404).json({ error: 'Foto no encontrada' });
                return res.json({ success: true });
            }
        );
    });
});

app.delete('/api/items/:id', isApiAuthenticated, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({
            error: 'Identificador de articulo no valido'
        });
    }

    db.run(
        `DELETE FROM items
         WHERE id = ?
           AND (? = 1 OR group_id IS NULL OR group_id = ?)`,
        [
            itemId,
            req.session.user.is_superuser ? 1 : 0,
            req.session.user.group_id || 0
        ],
        function deleteItem(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo eliminar el articulo'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: 'Articulo no encontrado'
                });
            }

            return res.json({
                success: true
            });
        }
    );
});

// API de usuarios
app.get('/api/users', isApiAuthenticated, isSuperuser, (req, res) => {
    const sql = `
        SELECT
            users.id,
            users.username,
            users.group_id,
            users.is_superuser,
            groups.name AS group_name
        FROM users
        LEFT JOIN groups ON groups.id = users.group_id
        ORDER BY users.username COLLATE NOCASE ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return handleDatabaseError(
                res,
                err,
                'No se pudieron cargar los usuarios'
            );
        }
        return res.json(rows);
    });
});

app.post('/api/users', isApiAuthenticated, isSuperuser, async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const groupId = normalizeOptionalId(req.body.group_id);

    if (!username || !password) {
        return res.status(400).json({
            error: 'El usuario y la contrasena son obligatorios'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: 'La contrasena debe tener al menos 6 caracteres'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (username, password, group_id, is_superuser)
             VALUES (?, ?, ?, 0)`,
            [username, hashedPassword, groupId],
            function insertUser(err) {
                if (err) {
                    return handleDatabaseError(
                        res,
                        err,
                        'No se pudo crear el usuario'
                    );
                }

                return res.status(201).json({
                    success: true,
                    user: {
                        id: this.lastID,
                        username,
                        group_id: groupId,
                        is_superuser: false
                    }
                });
            }
        );
    } catch (hashErr) {
        console.error('Error cifrando la contrasena:', hashErr);
        return res.status(500).json({ error: 'No se pudo crear el usuario' });
    }
});

app.put('/api/users/:id', isApiAuthenticated, isSuperuser, async (req, res) => {
    const userId = Number.parseInt(req.params.id, 10);
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const groupId = normalizeOptionalId(req.body.group_id);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
            error: 'Identificador de usuario no valido'
        });
    }

    if (!username) {
        return res.status(400).json({
            error: 'El nombre de usuario es obligatorio'
        });
    }

    try {
        let sql;
        let params;

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    error: 'La contrasena debe tener al menos 6 caracteres'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            sql = `
                UPDATE users
                SET username = ?, password = ?, group_id = ?
                WHERE id = ?
            `;
            params = [username, hashedPassword, groupId, userId];
        } else {
            sql = `
                UPDATE users
                SET username = ?, group_id = ?
                WHERE id = ?
            `;
            params = [username, groupId, userId];
        }

        db.run(sql, params, function updateUser(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo actualizar el usuario'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: 'Usuario no encontrado'
                });
            }

            if (userId === req.session.user.id) {
                req.session.user.username = username;
            }

            return res.json({ success: true });
        });
    } catch (updateErr) {
        console.error('Error actualizando el usuario:', updateErr);
        return res.status(500).json({
            error: 'No se pudo actualizar el usuario'
        });
    }
});

app.delete('/api/users/:id', isApiAuthenticated, isSuperuser, (req, res) => {
    const userId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
            error: 'Identificador de usuario no valido'
        });
    }

    if (userId === req.session.user.id) {
        return res.status(400).json({
            error: 'No puedes eliminar tu propio usuario'
        });
    }

    db.run(
        `DELETE FROM users
         WHERE id = ? AND is_superuser = 0`,
        [userId],
        function deleteUser(err) {
            if (err) {
                return handleDatabaseError(
                    res,
                    err,
                    'No se pudo eliminar el usuario'
                );
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: 'Usuario no encontrado o protegido'
                });
            }

            return res.json({ success: true });
        }
    );
});

// Respuesta JSON para rutas API inexistentes
app.use('/api', (req, res) => {
    return res.status(404).json({ error: 'Ruta API no encontrada' });
});

// Pagina no encontrada
app.use((req, res) => {
    return res.status(404).send('Pagina no encontrada');
});

// Arranque del servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Boxxed ejecutandose en el puerto ${PORT}`);
});

// Cierre limpio
function closeApplication(signal) {
    console.log(`Recibida senal ${signal}. Cerrando Boxxed...`);

    server.close(() => {
        db.close(err => {
            if (err) {
                console.error('Error cerrando SQLite:', err);
                process.exit(1);
            }

            console.log('Base de datos cerrada correctamente');
            process.exit(0);
        });
    });
}

process.on('SIGINT', () => closeApplication('SIGINT'));
process.on('SIGTERM', () => closeApplication('SIGTERM'));
