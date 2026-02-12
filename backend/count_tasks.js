const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.get("SELECT COUNT(*) as total FROM tasks", (err, row) => {
        if (err) console.error(err);
        else console.log('Total tasks:', row.total);
    });

    db.get("SELECT COUNT(*) as active FROM tasks WHERE is_archived = 0", (err, row) => {
        if (err) console.error(err);
        else console.log('Active tasks:', row.active);
    });

    db.get("SELECT COUNT(*) as archived FROM tasks WHERE is_archived = 1", (err, row) => {
        if (err) console.error(err);
        else console.log('Archived tasks:', row.archived);
    });
});

setTimeout(() => db.close(), 1000);
