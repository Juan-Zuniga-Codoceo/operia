// scripts/testSearchEndpoint.js
const axios = require('axios');

async function run() {
    const baseURL = 'http://127.0.0.1:4000';
    const hostHeader = 'demo.operia.cl';

    console.log(`📡 Iniciando sesión de prueba en http://127.0.0.1:4000 (Tenant: ${hostHeader})...`);
    
    try {
        // 1. Obtener Token JWT mediante login
        const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
            email: 'juan.perez@operia.cl',
            password: 'demo2024'
        }, {
            headers: {
                Host: hostHeader
            }
        });

        const token = loginResponse.data.token;
        console.log('✅ Autenticación exitosa! Token JWT obtenido.');

        // 2. Ejecutar búsqueda semántica
        const queryText = 'cómo se recupera la contraseña o qué pasa si la olvido';
        console.log(`🔎 Enviando consulta semántica: "${queryText}"`);

        const searchResponse = await axios.post(`${baseURL}/api/operia/knowledge-search`, {
            query: queryText
        }, {
            headers: {
                Host: hostHeader,
                Authorization: `Bearer ${token}`
            }
        });

        console.log('\n📥 Respuesta del endpoint /api/operia/knowledge-search:');
        console.log(JSON.stringify(searchResponse.data, null, 2));

    } catch (error) {
        console.error('❌ Error en la prueba del endpoint:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

run();
