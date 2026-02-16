const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('--- Verifying Schema ---');

    // Check sequences table
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sequences'", (err, row) => {
        if (err) console.error(err);
        console.log('Table sequences exists:', !!row);
        if (row) {
            db.all("PRAGMA table_info(sequences)", (err, cols) => {
                console.log('sequences columns:', cols.map(c => c.name).join(', '));
            });
        }
    });

    // Check clients table
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'", (err, row) => {
        if (err) console.error(err);
        console.log('Table clients exists:', !!row);
        if (row) {
            db.all("PRAGMA table_info(clients)", (err, cols) => {
                console.log('clients columns:', cols.map(c => c.name).join(', '));
            });
        }
    });

    // Check tasks table columns
    db.all("PRAGMA table_info(tasks)", (err, cols) => {
        if (err) console.error(err);
        const colNames = cols.map(c => c.name);
        const expectedCols = ['human_id', 'origin', 'shipping_type', 'payment_status', 'client_snapshot'];
        const missing = expectedCols.filter(c => !colNames.includes(c));
        console.log('Tasks table columns:', colNames.join(', '));
        console.log('Missing new columns in tasks:', missing.length === 0 ? 'None' : missing.join(', '));
    });
});

// Close after a short delay to allow queries to finish
setTimeout(() => {
    db.close();
}, 2000);
