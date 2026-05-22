// scripts/seedKnowledge.js
// Script de Ingesta y Vectorización de Base de Conocimientos para Operia
// Utiliza Google Gemini 'text-embedding-004' (768 dimensiones) y PostgreSQL pgvector

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Configuración de Base de Datos PostgreSQL
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

// 2. Configuración de Gemini API
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('❌ Error: La variable de entorno GEMINI_API_KEY no está configurada.');
    console.error('Por favor, agrégala en tu archivo .env local antes de continuar.');
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// Algoritmo de Ventana Deslizante (Sliding Window Chunker)
function chunkText(text, chunkSize = 500, overlap = 100) {
    if (text.length <= chunkSize) {
        return [text];
    }
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        const chunk = text.slice(i, i + chunkSize);
        chunks.push(chunk);
        i += (chunkSize - overlap);
        // Si el siguiente fragmento comienza muy cerca del final, salimos para evitar duplicación residual
        if (i >= text.length - overlap) {
            break;
        }
    }
    return chunks;
}

async function run() {
    const dataDir = path.join(__dirname, '../data');
    const filePath = path.join(dataDir, 'knowledge.txt');

    console.log('📂 Leyendo base de conocimientos...');
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: El archivo ${filePath} no existe.`);
        process.exit(1);
    }

    const textContent = fs.readFileSync(filePath, 'utf-8');
    
    // Segmentar el texto usando el algoritmo de ventana deslizante
    console.log('✂️  Segmentando texto en fragmentos (chunks) con ventana deslizante...');
    const chunks = chunkText(textContent, 500, 100);
    console.log(`📊 Total de fragmentos generados: ${chunks.length}\n`);

    const client = await pool.connect();
    
    try {
        // Verificar si la tabla existe en la base de datos
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'knowledge_base_chunks'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.error('❌ Error: La tabla "knowledge_base_chunks" no existe en la base de datos.');
            console.error('Asegúrate de ejecutar la inicialización de la base de datos (node backend/db-postgres.js) primero, o de habilitar la extensión pgvector y crear la tabla manualmente.');
            process.exit(1);
        }

        // Limpiar registros antiguos para evitar duplicados en el demo
        await client.query('DELETE FROM knowledge_base_chunks WHERE document_name = $1', ['knowledge.txt']);

        // Instanciar el modelo de embeddings
        const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx].trim();
            if (!chunk) continue;

            console.log(`🤖 Generando embedding para el fragmento ${idx + 1}/${chunks.length}...`);
            console.log(`📝 Contenido: "${chunk.substring(0, 60)}..."`);
            
            // Llamar a la API de Gemini para generar el vector
            const result = await model.embedContent(chunk);
            const embedding = result.embedding.values;

            if (!embedding || embedding.length !== 768) {
                throw new Error(`El vector devuelto no tiene la dimensión esperada de 768. Dimensión recibida: ${embedding ? embedding.length : 0}`);
            }

            // Formatear el array a sintaxis de pgvector: [val1, val2, ...]
            const embeddingStr = JSON.stringify(embedding);

            // Insertar en la base de datos
            await client.query(`
                INSERT INTO knowledge_base_chunks (document_name, content, embedding)
                VALUES ($1, $2, $3)
            `, ['knowledge.txt', chunk, embeddingStr]);

            console.log(`✅ Fragmento ${idx + 1} insertado con éxito en la base de datos.\n`);
        }

        console.log('🎉 ¡Proceso de ingesta y vectorización completado con éxito!');

    } catch (error) {
        console.error('❌ Error crítico en el proceso de ingesta:', error.message || error);
        if (error.status === 403 || (error.message && error.message.includes('leaked'))) {
            console.error('\n⚠️  ALERTA: Tu GEMINI_API_KEY ha sido bloqueada por seguridad. Crea una nueva clave en Google AI Studio y actualiza tu .env.');
        }
    } finally {
        client.release();
        await pool.end();
    }
}

run();
