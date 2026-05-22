// backend/routes/knowledgeRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// POST /api/operia/knowledge-search - Búsqueda Semántica
router.post('/operia/knowledge-search', authenticateToken, async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ error: 'El campo "query" es requerido y debe ser de tipo texto.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: GEMINI_API_KEY no está configurada.');
        return res.status(500).json({ error: 'Error de configuración en el servidor. Falta la API Key de Gemini.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Función auxiliar con fallback robusto para generar embedding de la consulta
        async function getQueryEmbeddingWithFallback(text) {
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
                    // Continuar al siguiente modelo
                }
            }
            throw new Error(`Todos los modelos de embeddings fallaron. Último error: ${lastError ? lastError.message : 'Desconocido'}`);
        }

        // Generar vector de consulta (768 dimensiones)
        const vectorArray = await getQueryEmbeddingWithFallback(query.trim());

        // Formatear a sintaxis compatible con pgvector: '[val1,val2,...]'
        const vectorStr = `[${vectorArray.join(',')}]`;

        // Realizar la consulta de similitud coseno con pgvector
        // El operador <=> calcula la distancia coseno. 
        // Similitud coseno se calcula como: 1 - (distancia_coseno)
        const sql = `
            SELECT id, document_name, content, 1 - (embedding <=> $1::vector) as similarity
            FROM knowledge_base_chunks
            WHERE (embedding <=> $1::vector) < 0.6
            ORDER BY embedding <=> $1::vector
            LIMIT 3;
        `;

        const dbResult = await pool.query(sql, [vectorStr]);
        
        return res.status(200).json({
            query: query,
            results: dbResult.rows.map(row => ({
                id: row.id,
                document_name: row.document_name,
                content: row.content,
                similarity: parseFloat(row.similarity)
            }))
        });

    } catch (error) {
        console.error('❌ Error en búsqueda semántica:', error);
        return res.status(500).json({ error: 'Error al procesar la búsqueda semántica en la base de conocimientos.' });
    }
});

module.exports = router;
