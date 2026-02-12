const path = require('path');

// Configuration
const API_URL = 'http://localhost:3000/api';

async function login() {
    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@biocare.cl',
                password: '1234'
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Login failed: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

async function runTests() {
    console.log('--- Starting Verification (using fetch) ---');

    // 1. Login
    const token = await login();
    console.log('✅ Login successful');
    const authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. Create Client
    const newClient = {
        rut: `12345678-${Math.floor(Math.random() * 9)}`,
        name: 'Test Client',
        email: 'test@client.com',
        phone: '987654321',
        address_street: 'Calle Falsa 123',
        commune: 'Valparaíso',
        region: 'Valparaíso'
    };

    try {
        const clientRes = await fetch(`${API_URL}/clients`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(newClient)
        });

        if (clientRes.status === 409) {
            console.log('⚠️ Client already exists (Expected if re-running)');
        } else if (!clientRes.ok) {
            const text = await clientRes.text();
            console.error(`❌ Client creation failed: ${clientRes.status} ${text}`);
        } else {
            const data = await clientRes.json();
            console.log('✅ Client created:', data.success);
        }
    } catch (error) {
        console.error('❌ Client creation error:', error.message);
    }

    // 3. Search Client
    try {
        const searchRes = await fetch(`${API_URL}/clients?search=Test`, {
            headers: authHeaders
        });
        const data = await searchRes.json();
        console.log('✅ Client search found:', data.length > 0);
    } catch (error) {
        console.error('❌ Client search error:', error.message);
    }

    // 4. Create Task with Origin 'Valparaíso'
    const newTask = {
        title: 'Test Task Sequence',
        description: 'Testing ID generation',
        origin: 'Valparaíso',
        client_snapshot: JSON.stringify(newClient)
    };

    try {
        const taskRes = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(newTask)
        });

        if (!taskRes.ok) {
            const text = await taskRes.text();
            console.error(`❌ Task creation failed: ${taskRes.status} ${text}`);
        } else {
            const data = await taskRes.json();
            console.log('✅ Task created:', data.success);
            console.log('   Human ID:', data.human_id);

            if (data.human_id && data.human_id.startsWith('BV-')) {
                console.log('✅ ID format correct (BV-...)');
            } else {
                console.error('❌ ID format incorrect');
            }
        }

    } catch (error) {
        console.error('❌ Task creation error:', error.message);
    }

    // 5. Create Task with Origin 'Quilpué'
    const newTask2 = {
        title: 'Test Task Sequence 2',
        description: 'Testing ID generation BQ',
        origin: 'Quilpué',
        client_snapshot: JSON.stringify(newClient)
    };

    try {
        const taskRes2 = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(newTask2)
        });

        if (!taskRes2.ok) {
            const text = await taskRes2.text();
            console.error(`❌ Task 2 creation failed: ${taskRes2.status} ${text}`);
        } else {
            const data = await taskRes2.json();
            console.log('✅ Task 2 created:', data.success);
            console.log('   Human ID:', data.human_id);
            if (data.human_id && data.human_id.startsWith('BQ-')) {
                console.log('✅ ID format correct (BQ-...)');
            } else {
                console.error('❌ ID format incorrect');
            }
        }
    } catch (error) {
        console.error('❌ Task 2 creation error:', error.message);
    }
}

runTests();
