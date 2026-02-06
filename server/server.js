const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

const server = http.createServer((req, res) => {
    // Enable CORS for the extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === ('/points')) {
        if (req.method === 'GET') {
            fs.readFile(DB_FILE, (err, data) => {
                if (err) {
                    res.writeHead(500);
                    res.end('Error reading DB');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const newPoints = JSON.parse(body);
                    // Read existing
                    const existingData = fs.readFileSync(DB_FILE);
                    let currentPoints = JSON.parse(existingData);

                    // Merge logic: Add new ones, update existing? 
                    // Simple logic: Overwrite or Append? 
                    // Let's assume the client sends the FULL list to sync generally, 
                    // OR we just append uniqued by ID. 
                    // Let's do a smart merge: union by ID.

                    const idMap = new Map();
                    currentPoints.forEach(p => idMap.set(p.id, p));
                    newPoints.forEach(p => idMap.set(p.id, p)); // Client overwrites server or vice versa?
                    // Let's trust the POST as "latest" for those IDs.

                    const merged = Array.from(idMap.values());

                    fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2));

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: merged.length }));
                } catch (e) {
                    res.writeHead(400);
                    res.end('Invalid JSON');
                }
            });
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

console.log(`Sync Server running at http://localhost:${PORT}/points`);
console.log('To use: Enable "Sync" in the Chrome Extension.');
server.listen(PORT);
