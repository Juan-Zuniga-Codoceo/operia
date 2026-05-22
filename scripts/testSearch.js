// scripts/testSearch.js
require('dotenv').config();
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const poolConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
} : {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);
const apiKey = process.env.GEMINI_API_KEY;

async function getEmbeddingWithFallback(text, genAI) {
    const modelsToTry = ['text-embedding-004', 'gemini-embedding-2', 'gemini-embedding-001'];
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.embedContent({
                content: { parts: [{ text }] },
                outputDimensionality: 768
            });
            if (result.embedding && result.embedding.values) {
                console.log(`🤖 Consulta vectorizada con éxito usando: ${modelName}`);
                return result.embedding.values;
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw new Error(`Todos los modelos de embeddings fallaron. Último error: ${lastError ? lastError.message : 'Desconocido'}`);
}

async function testSearch(queryText) {
    console.log(`🔎 Realizando búsqueda semántica para: "${queryText}"`);
    const genAI = new GoogleGenerativeAI(apiKey);
    
    let vectorArray;
    try {
        vectorArray = await getEmbeddingWithFallback(queryText, genAI);
    } catch (err) {
        console.error('❌ Error generando embedding de consulta:', err.message);
        return;
    }

    const vectorStr = `[${vectorArray.join(',')}]`;
    const client = await pool.connect();

    try {
        const sql = `
            SELECT id, document_name, content, 1 - (embedding <=> $1::vector) as similarity
            FROM knowledge_base_chunks
            WHERE (embedding <=> $1::vector) < 0.6
            ORDER BY embedding <=> $1::vector
            LIMIT 3;
        `;
        
        const res = await client.query(sql, [vectorStr]);
        console.log(`\n📊 Resultados (Encontrados: ${res.rows.length}):`);
        res.rows.forEach((row, i) => {
            console.log(`\n[Resultado ${i + 1}] (Similitud: ${(row.similarity * 100).toFixed(2)}%)`);
            console.log(`Contenido: "${row.content.substring(0, 150)}..."`);
        });
    } catch (err) {
        console.error('❌ Error ejecutando búsqueda en DB:', err.message || err);
    } finally {
        client.release();
    }
}

async function run() {
    if (!apiKey) {
        console.error('❌ Falta GEMINI_API_KEY');
        process.exit(1);
    }
    
    // Probar dos consultas distintas
    await testSearch('cómo puedo restablecer mi contraseña');
    console.log('\n' + '='.repeat(50) + '\n');
    await testSearch('cuáles son los estados de las tareas del kanban');
    
    await pool.end();
}

run();
