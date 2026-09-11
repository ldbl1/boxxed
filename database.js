const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDirectory = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new sqlite3.Database(path.join(dataDirectory, 'boxxed.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        FOREIGN KEY(parent_id) REFERENCES locations(id)
    )`);



    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        FOREIGN KEY(parent_id) REFERENCES categories(id)
    )`);

    // Dentro de db.serialize en database.js...
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        location_id INTEGER,
        category_id INTEGER,
        FOREIGN KEY(location_id) REFERENCES locations(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);

    db.run('ALTER TABLE categories ADD COLUMN image TEXT', () => {});
    db.run('ALTER TABLE locations ADD COLUMN image TEXT', () => {});
    db.run('ALTER TABLE items ADD COLUMN image TEXT', () => {});
    db.run('ALTER TABLE categories ADD COLUMN images TEXT', () => {});
    db.run('ALTER TABLE categories ADD COLUMN primary_image TEXT', () => {});
    db.run('ALTER TABLE categories ADD COLUMN image_regions TEXT', () => {});
    db.run('ALTER TABLE locations ADD COLUMN images TEXT', () => {});
    db.run('ALTER TABLE locations ADD COLUMN primary_image TEXT', () => {});
    db.run('ALTER TABLE locations ADD COLUMN image_regions TEXT', () => {});
    db.run('ALTER TABLE items ADD COLUMN images TEXT', () => {});
    db.run('ALTER TABLE items ADD COLUMN primary_image TEXT', () => {});
    db.run('ALTER TABLE items ADD COLUMN image_regions TEXT', () => {});
});

module.exports = db;