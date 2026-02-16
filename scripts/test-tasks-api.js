require('dotenv').config(); const http = require('http');

const PORT = process.env.PORT || 3000;

function makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    try {
        console.log('🔐 1. Logging in as juan.perez@operia.cl...');
        const loginRes = await makeRequest('POST', '/api/login', {}, {
            email: 'juan.perez@operia.cl',
            password: 'demo2024'
        });

        if (!loginRes.token) {
            console.error('❌ Login failed:', loginRes);
            return;
        }

        console.log('✅ Login successful');
        console.log('   User ID:', loginRes.user.id);
        console.log('   Tenant ID:', loginRes.user.tenant_id);

        console.log('\n📋 2. Fetching tasks...');
        const tasksRes = await makeRequest('GET', '/api/tasks', {
            'Authorization': `Bearer ${loginRes.token}`
        });

        if (Array.isArray(tasksRes)) {
            console.log(`✅ Tasks endpoint returned: ${tasksRes.length} tasks`);
            if (tasksRes.length > 0) {
                console.log('\n📝 First task sample:');
                console.log('   ID:', tasksRes[0].id);
                console.log('   Title:', tasksRes[0].title);
                console.log('   Created by:', tasksRes[0].created_by);
                console.log('   Assigned IDs:', tasksRes[0].assigned_ids);
                console.log('   Status:', tasksRes[0].status);
            } else {
                console.log('⚠️  Array is empty - no tasks returned!');
            }
        } else {
            console.log('❌ Unexpected response:', tasksRes);
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

test();
