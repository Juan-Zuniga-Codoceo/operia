const fs = require('fs');
const html = fs.readFileSync('frontend/tablero.html', 'utf8');
const js = fs.readFileSync('frontend/js/tasks.js', 'utf8');
const nameMatches = html.match(/[a-zA-Z0-9_]+\.name/g) || [];
console.log("Found .name in HTML:", new Set(nameMatches));
const jsMatches = js.match(/[a-zA-Z0-9_]+\.name/g) || [];
console.log("Found .name in JS:", new Set(jsMatches));
