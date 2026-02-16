const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        data: body ? JSON.parse(body) : {}
                    });
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                    resolve({ statusCode: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function run() {
    try {
        // 1. Login
        const loginRes = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, {
            email: 'admin@operia.cl',
            password: '1234'
        });

        const token = loginRes.data.token;
        console.log('Got token:', token ? 'YES' : 'NO');

        if (!token) {
            console.error('Login failed:', loginRes.data);
            return;
        }

        // 2. Get Comments for Task 5
        const commentsRes = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/tasks/5/comments',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Comments Response:', JSON.stringify(commentsRes.data, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
