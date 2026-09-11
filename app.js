const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');

const accentThemes = {
    rose: '#e8a4b8',
    mint: '#9acfc0',
    sky: '#9fc5e8',
    peach: '#f2bd9b'
};
const accentStrongColors = {
    '#e8a4b8': '#9f4f6b',
    '#9acfc0': '#347d6d',
    '#9fc5e8': '#3d70a3',
    '#f2bd9b': '#a45f37'
};
const defaultSettings = { accentColor: accentThemes.sky, language: 'es' };
const settings = { ...defaultSettings };
const translations = {
    es: {
        items: 'Items', locations: 'Ubicaciones', categories: 'Categorías', settings: 'Configuración',
        accentColor: 'Color de acento', language: 'Idioma', spanish: 'Español', english: 'Inglés',
        settingsSaved: 'Configuración guardada',
        rose: 'Rosa suave', mint: 'Menta', sky: 'Azul cielo', peach: 'Melocotón',
        inventory: 'Inventario', newItem: 'Nuevo item', searchBy: 'Buscar por nombre, categoría o ubicación',
        searchItems: 'Buscar items...', allCategories: 'Todas las categorías', allLocations: 'Todas las ubicaciones',
        searchCategory: 'Buscar categoría...', searchLocation: 'Buscar ubicación...', clearFilters: 'Limpiar filtros',
        noMatchingItems: 'No hay items que coincidan con la búsqueda.', newCategory: 'Nueva categoría',
        newLocation: 'Nueva ubicación', search: 'Buscar', edit: 'Editar', delete: 'Eliminar',
        save: 'Guardar', cancel: 'Cancelar', update: 'Actualizar', name: 'Nombre', images: 'Imágenes',
        image: 'Imagen', quantity: 'Cantidad', location: 'Ubicación', category: 'Categoría',
        noLocation: 'Sin asignar', noCategory: 'Sin categoría', rootUnassigned: '-- Raíz (Sin asignar) --',
        newItemTitle: 'Registrar nuevo item', itemName: 'Nombre del item', itemExample: 'Ej: Disco Duro SSD 1TB',
        newCategoryTitle: 'Nueva categoría', editCategoryTitle: 'Editar categoría', categoryName: 'Nombre de la categoría',
        categoryExample: 'Ej: Discos Duros', newLocationTitle: 'Nueva ubicación', editLocationTitle: 'Editar ubicación',
        locationName: 'Nombre', locationExample: 'Ej: Cajón 1', belongsTo: 'Pertenece a (Jerarquía)',
        mainCategory: '-- Categoría principal --', mainLocation: '-- Ubicación principal --',
        deleteItemConfirm: '¿Eliminar este ítem?', deleteCategoryConfirm: '¿Eliminar esta categoría? Sus hijos pasarán a ser principales.',
        deleteLocationConfirm: '¿Eliminar esta ubicación? Sus hijos pasarán a ser principales.',
        back: 'Volver', itemLocation: 'Ubicación de', locationPath: 'Ruta de ubicación',
        uploadedImage: 'Imagen subida', deletePhoto: 'Eliminar foto', deletePhotoConfirm: '¿Eliminar esta foto?', primaryPhoto: 'Foto principal',
        preview: 'Vista previa', primary: 'Principal',
        selectZone: 'Seleccionar dentro de esta zona', markZone: 'Marcar zona', noPhoto: 'Sin foto',
        selectZoneTitle: 'Seleccionar zona', saveZone: 'Guardar zona', selectedLocation: 'Ver ubicación y zonas',
        selectedCount: 'seleccionada', selectedCountPlural: 'seleccionadas'
    },
    en: {
        items: 'Items', locations: 'Locations', categories: 'Categories', settings: 'Settings',
        accentColor: 'Accent color', language: 'Language', spanish: 'Spanish', english: 'English',
        settingsSaved: 'Settings saved',
        rose: 'Soft rose', mint: 'Mint', sky: 'Sky blue', peach: 'Peach',
        inventory: 'Inventory', newItem: 'New item', searchBy: 'Search by name, category or location',
        searchItems: 'Search items...', allCategories: 'All categories', allLocations: 'All locations',
        searchCategory: 'Search category...', searchLocation: 'Search location...', clearFilters: 'Clear filters',
        noMatchingItems: 'No items match your search.', newCategory: 'New category', newLocation: 'New location',
        search: 'Search', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', update: 'Update',
        name: 'Name', images: 'Images', image: 'Image', quantity: 'Quantity', location: 'Location', category: 'Category',
        noLocation: 'Unassigned', noCategory: 'No category', rootUnassigned: '-- Root (Unassigned) --',
        newItemTitle: 'Register new item', itemName: 'Item name', itemExample: 'E.g. 1TB SSD hard drive',
        newCategoryTitle: 'New category', editCategoryTitle: 'Edit category', categoryName: 'Category name',
        categoryExample: 'E.g. Hard drives', newLocationTitle: 'New location', editLocationTitle: 'Edit location',
        locationName: 'Name', locationExample: 'E.g. Drawer 1', belongsTo: 'Belongs to (Hierarchy)',
        mainCategory: '-- Main category --', mainLocation: '-- Main location --',
        deleteItemConfirm: 'Delete this item?', deleteCategoryConfirm: 'Delete this category? Its children will become top-level.',
        deleteLocationConfirm: 'Delete this location? Its children will become top-level.',
        back: 'Back', itemLocation: 'Location of', locationPath: 'Location path',
        uploadedImage: 'Uploaded image', deletePhoto: 'Delete photo', deletePhotoConfirm: 'Delete this photo?', primaryPhoto: 'Primary photo',
        preview: 'Preview', primary: 'Primary',
        selectZone: 'Select within this zone', markZone: 'Mark zone', noPhoto: 'No photo',
        selectZoneTitle: 'Select zone', saveZone: 'Save zone', selectedLocation: 'View location and zones',
        selectedCount: 'selected', selectedCountPlural: 'selected'
    }
};

function readCookie(header, name) {
    const match = String(header || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function currentLanguage(req) {
    const language = readCookie(req.headers.cookie, 'boxxed_lang');
    return language === 'en' || language === 'es' ? language : settings.language;
}

db.all('SELECT key, value FROM settings', (error, rows) => {
    if (!error) rows.forEach(row => { if (row.key in settings && (row.key !== 'accentColor' || Object.values(accentThemes).includes(row.value))) settings[row.key] = row.value; });
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use((req, res, next) => {
    const language = currentLanguage(req);
    res.locals.settings = settings;
    res.locals.accentStrong = accentStrongColors[settings.accentColor] || accentStrongColors[defaultSettings.accentColor];
    res.locals.language = language;
    res.locals.t = key => translations[language][key] || translations.es[key] || key;
    next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'views', 'partials')));
app.get('/logo.svg', (req, res) => res.sendFile(path.join(__dirname, 'views', 'logo.svg')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => callback(null, file.mimetype.startsWith('image/'))
});

function removeUpload(filename) {
    if (filename) fs.unlink(path.join(__dirname, 'uploads', filename), () => {});
}

function removeUploadIfUnused(filename, callback) {
    const tables = ['items', 'categories', 'locations'];
    let index = 0;
    function checkNext() {
        if (index === tables.length) return removeUpload(filename), callback();
        const table = tables[index++];
        db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE image = ? OR images LIKE ?`, [filename, `%${filename}%`], (err, result) => {
            if (result && result.count) return callback();
            checkNext();
        });
    }
    checkNext();
}

function galleryFor(record) {
    if (!record) return { images: [], primary: null, regions: {} };
    let images = [];
    try { images = record.images ? JSON.parse(record.images) : []; } catch (error) { images = []; }
    if (!images.length && record.image) images = [record.image];
    let regions = {};
    try { regions = record.image_regions ? JSON.parse(record.image_regions) : {}; } catch (error) { regions = {}; }
    return { images, primary: record.primary_image || images[0] || null, regions };
}

function saveGallery(table, id, record, uploaded, primaryImage, callback) {
    const gallery = galleryFor(record);
    const images = gallery.images.concat(uploaded);
    const primary = primaryImage && images.includes(primaryImage) ? primaryImage : gallery.primary || images[0] || null;
    db.run(`UPDATE ${table} SET images = ?, primary_image = ?, image = ? WHERE id = ?`,
        [JSON.stringify(images), primary, primary, id], callback);
}

function removeFromGallery(table, id, record, filename, callback) {
    const gallery = galleryFor(record);
    const images = gallery.images.filter(image => image !== filename);
    const primary = gallery.primary === filename ? (images[0] || null) : gallery.primary;
    delete gallery.regions[filename];
    db.run(`UPDATE ${table} SET images = ?, primary_image = ?, image = ?, image_regions = ? WHERE id = ?`,
        [JSON.stringify(images), primary, primary, JSON.stringify(gallery.regions), id], () => {
            removeUploadIfUnused(filename, callback);
        });
}

const mediaTables = { items: 'items', categories: 'categories', locations: 'locations' };

function mediaRecord(type, id, callback) {
    const table = mediaTables[type];
    if (!table) return callback(null, null, null);
    db.get(`SELECT * FROM ${table} WHERE id = ?`, [id], (err, record) => callback(table, record, err));
}

// --- FUNCIÓN MAESTRA DE JERARQUÍAS ---
function buildHierarchy(rows) {
    let map = {};
    // 1. Crear mapa inicial
    rows.forEach(r => map[r.id] = { ...r, children: [] });

    let tree = [];
    // 2. Resolver rutas y armar el árbol
    for (let id in map) {
        let item = map[id];
        let path = [];
        let pathIds = [];
        let curr = item;

        while (curr) {
            path.unshift(curr.name);
            pathIds.unshift(curr.id);
            curr = map[curr.parent_id];
        }
        item.fullPath = path.join(' > '); // Ej: Sótano > Cajón 1
        item.depth = path.length - 1;
        item.ancestorIds = pathIds;

        if (item.parent_id && map[item.parent_id]) {
            map[item.parent_id].children.push(item);
        } else {
            tree.push(item);
        }
    }
    // 3. Lista plana ordenada alfabéticamente por ruta (ideal para desplegables)
    let flatList = Object.values(map).sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    flatList.forEach(item => {
        const descendantIds = [];
        const collect = node => node.children.forEach(child => {
            descendantIds.push(child.id);
            collect(child);
        });
        collect(item);
        item.descendantIds = [item.id, ...descendantIds];
    });
    return { flatList, tree, map };
}

// Helper para no repetir código en cada ruta
function getHierarchies(callback) {
    db.all('SELECT * FROM locations', [], (err, locs) => {
        db.all('SELECT * FROM categories', [], (err, cats) => {
            callback(buildHierarchy(locs), buildHierarchy(cats));
        });
    });
}

// --- RUTAS DE ITEMS ---
app.get('/items', (req, res) => {
    getHierarchies((locs, cats) => {
        db.all('SELECT * FROM items', [], (err, items) => {
            items.forEach(item => {
                item.location_name = locs.map[item.location_id] ? locs.map[item.location_id].fullPath : 'Sin asignar';
                item.category_name = cats.map[item.category_id] ? cats.map[item.category_id].fullPath : 'Sin categoría';
                item.location_filter_ids = locs.map[item.location_id] ? locs.map[item.location_id].ancestorIds : [];
                item.category_filter_ids = cats.map[item.category_id] ? cats.map[item.category_id].ancestorIds : [];
            });
            res.render('items/index', { items, locations: locs.flatList, categories: cats.flatList });
        });
    });
});

app.get('/items/new', (req, res) => {
    getHierarchies((locs, cats) => res.render('items/new', { locations: locs.flatList, categories: cats.flatList }));
});

app.get('/items/:id/location', (req, res) => {
    getHierarchies((locs, cats) => {
        db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (err, item) => {
            if (!item || !item.location_id || !locs.map[item.location_id]) return res.sendStatus(404);
            const trail = locs.map[item.location_id].ancestorIds.map(id => locs.map[id]).map((location, index, locations) => ({
                ...location,
                gallery: galleryFor(location),
                parentGallery: index ? galleryFor(locations[index - 1]) : null
            }));
            res.render('items/location', { item, trail });
        });
    });
});

app.post('/items', upload.array('images', 12), (req, res) => {
    const { name, quantity, location_id, category_id } = req.body;
    const images = (req.files || []).map(file => file.filename);
    const primary = images[Number(req.body.primary_index)] || images[0] || null;
    db.run('INSERT INTO items (name, quantity, location_id, category_id, image, images, primary_image, image_regions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, quantity || 1, location_id || null, category_id || null, primary, JSON.stringify(images), primary, '{}'], () => res.redirect('/items'));
});

app.get('/items/:id/edit', (req, res) => {
    getHierarchies((locs, cats) => {
        db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (err, item) => {
            if (!item) return res.sendStatus(404);
            item.gallery = galleryFor(item);
            res.render('items/edit', { item, locations: locs.flatList, categories: cats.flatList });
        });
    });
});

app.post('/items/:id/edit', upload.array('images', 12), (req, res) => {
    const { name, quantity, location_id, category_id } = req.body;
    db.get('SELECT image FROM items WHERE id = ?', [req.params.id], (err, item) => {
        db.run('UPDATE items SET name = ?, quantity = ?, location_id = ?, category_id = ? WHERE id = ?', [name, quantity, location_id || null, category_id || null, req.params.id], () => {
            db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (error, current) => saveGallery('items', req.params.id, current, (req.files || []).map(file => file.filename), req.body.primary_image, () => res.redirect('/items')));
        });
    });
});

app.post('/items/:id/delete', (req, res) => {
    db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (err, item) => {
        db.run('DELETE FROM items WHERE id = ?', [req.params.id], () => {
            if (!item) return res.redirect('/items');
            let remaining = galleryFor(item).images.length;
            galleryFor(item).images.forEach(filename => removeUploadIfUnused(filename, () => {
                if (!--remaining) res.redirect('/items');
            }));
        });
    });
});

// --- RUTAS DE UBICACIONES Y CATEGORÍAS ---
app.get('/locations', (req, res) => getHierarchies((locs, cats) => res.render('locations/index', { tree: locs.tree })));
app.get('/locations/new', (req, res) => getHierarchies((locs, cats) => res.render('locations/new', { locations: locs.flatList })));
app.post('/locations', upload.single('image'), (req, res) => {
    const images = req.file ? [req.file.filename] : [];
    const primary = images[0] || null;
    db.run('INSERT INTO locations (name, parent_id, image, images, primary_image, image_regions) VALUES (?, ?, ?, ?, ?, ?)', [req.body.name, req.body.parent_id || null, primary, JSON.stringify(images), primary, '{}'], () => res.redirect('/locations'));
});

app.get('/locations/:id/edit', (req, res) => {
    getHierarchies((locs, cats) => db.get('SELECT * FROM locations WHERE id = ?', [req.params.id], (err, location) => {
        if (!location) return res.sendStatus(404);
        location.gallery = galleryFor(location);
        db.get('SELECT * FROM locations WHERE id = ?', [location.parent_id], (parentErr, parent) => {
            res.render('locations/edit', { location, locations: locs.flatList, sharedGallery: parent ? galleryFor(parent) : null });
        });
    }));
});
app.post('/locations/:id/edit', upload.single('image'), (req, res) => {
    db.get('SELECT image FROM locations WHERE id = ?', [req.params.id], (err, location) => {
        const hasImage = galleryFor(location).images.length > 0;
        const uploaded = !req.body.parent_id && !hasImage && req.file ? [req.file.filename] : [];
        if (req.file && !uploaded.length) removeUpload(req.file.filename);
        db.run('UPDATE locations SET name = ?, parent_id = ? WHERE id = ?', [req.body.name, req.body.parent_id || null, req.params.id], () => {
            db.get('SELECT * FROM locations WHERE id = ?', [req.params.id], (error, current) => saveGallery('locations', req.params.id, current, uploaded, req.body.primary_image, () => res.redirect('/locations')));
        });
    });
});

app.post('/locations/:id/delete', (req, res) => {
    db.get('SELECT * FROM locations WHERE id = ?', [req.params.id], (err, location) => {
        db.run('UPDATE locations SET parent_id = NULL WHERE parent_id = ?', [req.params.id], () => {
            db.run('UPDATE items SET location_id = NULL WHERE location_id = ?', [req.params.id], () => {
                db.run('DELETE FROM locations WHERE id = ?', [req.params.id], () => {
                    if (!location) return res.redirect('/locations');
                    let remaining = galleryFor(location).images.length;
                    if (!remaining) return res.redirect('/locations');
                    galleryFor(location).images.forEach(filename => removeUploadIfUnused(filename, () => {
                        if (!--remaining) res.redirect('/locations');
                    }));
                });
            });
        });
    });
});

app.get('/categories', (req, res) => getHierarchies((locs, cats) => res.render('categories/index', { tree: cats.tree })));
app.get('/categories/new', (req, res) => getHierarchies((locs, cats) => res.render('categories/new', { categories: cats.flatList })));
app.post('/categories', upload.single('image'), (req, res) => {
    const images = req.file ? [req.file.filename] : [];
    const primary = images[Number(req.body.primary_index)] || images[0] || null;
    db.run('INSERT INTO categories (name, parent_id, image, images, primary_image, image_regions) VALUES (?, ?, ?, ?, ?, ?)', [req.body.name, req.body.parent_id || null, primary, JSON.stringify(images), primary, '{}'], () => res.redirect('/categories'));
});

app.get('/categories/:id/edit', (req, res) => {
    getHierarchies((locs, cats) => db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (err, category) => {
        if (!category) return res.sendStatus(404);
        category.gallery = galleryFor(category);
        category.gallery.images = category.gallery.primary ? [category.gallery.primary] : category.gallery.images.slice(0, 1);
        res.render('categories/edit', { category, categories: cats.flatList });
    }));
});
app.post('/categories/:id/edit', upload.single('image'), (req, res) => {
    db.get('SELECT image FROM categories WHERE id = ?', [req.params.id], (err, category) => {
        db.run('UPDATE categories SET name = ?, parent_id = ? WHERE id = ?', [req.body.name, req.body.parent_id || null, req.params.id], () => {
            db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (error, current) => {
                if (!req.file || galleryFor(current).images.length) {
                    if (req.file) removeUpload(req.file.filename);
                    return res.redirect('/categories');
                }
                const oldImages = galleryFor(current).images;
                db.run('UPDATE categories SET images = ?, primary_image = ?, image = ?, image_regions = ? WHERE id = ?', [JSON.stringify([req.file.filename]), req.file.filename, req.file.filename, '{}', req.params.id], () => {
                    oldImages.forEach(filename => removeUploadIfUnused(filename, () => {}));
                    res.redirect('/categories');
                });
            });
        });
    });
});

app.post('/categories/:id/delete', (req, res) => {
    db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (err, category) => {
        db.run('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', [req.params.id], () => {
            db.run('UPDATE items SET category_id = NULL WHERE category_id = ?', [req.params.id], () => {
                db.run('DELETE FROM categories WHERE id = ?', [req.params.id], () => {
                    if (!category) return res.redirect('/categories');
                    let remaining = galleryFor(category).images.length;
                    if (!remaining) return res.redirect('/categories');
                    galleryFor(category).images.forEach(filename => removeUploadIfUnused(filename, () => {
                        if (!--remaining) res.redirect('/categories');
                    }));
                });
            });
        });
    });
});

app.post('/media/:type/:id/delete', (req, res) => {
    mediaRecord(req.params.type, req.params.id, (table, record) => {
        if (!table || !record) return res.sendStatus(404);
        removeFromGallery(table, req.params.id, record, req.body.filename, () => res.json({ ok: true }));
    });
});

app.post('/media/:type/:id/primary', (req, res) => {
    mediaRecord(req.params.type, req.params.id, (table, record) => {
        if (!table || !record) return res.sendStatus(404);
        const gallery = galleryFor(record);
        if (!gallery.images.includes(req.body.filename)) return res.sendStatus(400);
        db.run(`UPDATE ${table} SET primary_image = ?, image = ? WHERE id = ?`, [req.body.filename, req.body.filename, req.params.id], () => res.json({ ok: true }));
    });
});

app.post('/media/:type/:id/region', (req, res) => {
    mediaRecord(req.params.type, req.params.id, (table, record) => {
        if (!table || !record) return res.sendStatus(404);
        const gallery = galleryFor(record);
        const { filename, x, y, width, height } = req.body;
        const clip = req.body.clip || { x: 0, y: 0, width: 1, height: 1 };
        if ([x, y, width, height, clip.x, clip.y, clip.width, clip.height].some(value => typeof value !== 'number' || value < 0 || value > 1) || !gallery.images.includes(filename) && table !== 'locations') return res.sendStatus(400);
        const region = {
            x: clip.x + x * clip.width,
            y: clip.y + y * clip.height,
            width: width * clip.width,
            height: height * clip.height
        };
        gallery.regions[filename] = region;
        const save = () => db.run(`UPDATE ${table} SET image_regions = ? WHERE id = ?`, [JSON.stringify(gallery.regions), req.params.id], () => res.json({ ok: true }));
        if (gallery.images.includes(filename)) return save();
        if (table !== 'locations') return res.sendStatus(400);
        db.get('SELECT * FROM locations WHERE id = ?', [record.parent_id], (parentErr, parent) => {
            if (!parent || !galleryFor(parent).images.includes(filename)) return res.sendStatus(400);
            gallery.images.push(filename);
            gallery.primary = gallery.primary || filename;
            db.run('UPDATE locations SET images = ?, primary_image = ?, image = ? WHERE id = ?', [JSON.stringify(gallery.images), gallery.primary, gallery.primary, req.params.id], save);
        });
    });
});

app.post('/media/locations/:id/link', (req, res) => {
    db.get('SELECT * FROM locations WHERE id = ?', [req.params.id], (err, location) => {
        if (!location) return res.sendStatus(404);
        db.get('SELECT * FROM locations WHERE id = ?', [location.parent_id], (parentErr, parent) => {
            if (!parent || !galleryFor(parent).images.includes(req.body.filename)) return res.sendStatus(400);
            const gallery = galleryFor(location);
            if (!gallery.images.includes(req.body.filename)) gallery.images.push(req.body.filename);
            const primary = gallery.primary || req.body.filename;
            db.run('UPDATE locations SET images = ?, primary_image = ?, image = ? WHERE id = ?', [JSON.stringify(gallery.images), primary, primary, req.params.id], () => res.json({ ok: true }));
        });
    });
});

app.get('/settings', (req, res) => res.render('settings', { query: req.query }));

app.post('/settings', (req, res) => {
    const accentColor = Object.values(accentThemes).includes(req.body.accentColor) ? req.body.accentColor : defaultSettings.accentColor;
    const language = req.body.language === 'en' ? 'en' : 'es';
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['accentColor', accentColor]);
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['language', language], () => {
        settings.accentColor = accentColor;
        settings.language = language;
        res.setHeader('Set-Cookie', `boxxed_lang=${language}; Path=/; Max-Age=31536000; SameSite=Lax`);
        res.redirect('/settings?saved=1');
    });
});

// --- ARRANQUE ---
app.get('/', (req, res) => res.redirect('/items'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`Servidor corriendo en http://${host}:${port}`));