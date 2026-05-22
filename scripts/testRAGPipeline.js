// scripts/testRAGPipeline.js
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

        const headers = {
            Host: hostHeader,
            Authorization: `Bearer ${token}`
        };

        // 2. Probar Caso 1: Pregunta válida (Respuesta existe en base de conocimientos)
        const q1 = 'cómo es el flujo para restablecer la contraseña si un usuario la olvida';
        console.log(`\n💬 [Pregunta 1 (VÁLIDA)]: "${q1}"`);
        const r1 = await axios.post(`${baseURL}/api/operia/knowledge-chat`, { question: q1 }, { headers });
        console.log('📥 Respuesta recibida:');
        console.log(JSON.stringify(r1.data, null, 2));

        console.log('\n' + '='.repeat(60) + '\n');

        // 3. Probar Caso 2: Pregunta inválida (Respuesta no existe -> Alucinación / Falta de info)
        const q2 = 'cómo configuro mi cuenta de Operia para programar un viaje espacial a Júpiter';
        console.log(`💬 [Pregunta 2 (FUERA DE CONTEXTO)]: "${q2}"`);
        const r2 = await axios.post(`${baseURL}/api/operia/knowledge-chat`, { question: q2 }, { headers });
        console.log('📥 Respuesta recibida:');
        console.log(JSON.stringify(r2.data, null, 2));

    } catch (error) {
        console.error('❌ Error en la prueba del pipeline RAG:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

run();
