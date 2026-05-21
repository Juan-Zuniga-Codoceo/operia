// backend/routes/operiaIntakeRoutes.js
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticateToken } = require('../middleware/auth');

// 📋 Esquema de Datos Estrictos con Zod
const IntakeSchema = z.object({
  cliente_rut: z.string().min(1, "El RUT del cliente es obligatorio"),
  nombre_empresa: z.string().min(1, "El nombre de la empresa es obligatorio"),
  direccion_despacho: z.string().min(1, "La dirección de despacho es obligatoria"),
  descripcion_tarea: z.string().min(1, "La descripción de la tarea es obligatoria"),
  urgencia: z.enum(["Baja", "Media", "Alta"], {
    errorMap: () => ({ message: "La urgencia debe ser Baja, Media o Alta" })
  }),
  fecha_limite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha límite debe estar en formato YYYY-MM-DD")
});

/**
 * Función auxiliar para limpiar y validar el RUT chileno mediante el algoritmo de Módulo 11.
 * @param {string} rutCompleto
 * @returns {boolean}
 */
function validarRutChileno(rutCompleto) {
  if (!rutCompleto || typeof rutCompleto !== 'string') return false;
  
  // Limpiar puntos y guión, convertir a mayúsculas
  const cleanRut = rutCompleto.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 2) return false;
  
  const cuerpo = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  
  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  
  const dvEsperado = 11 - (suma % 11);
  let dvCalculado;
  if (dvEsperado === 11) {
    dvCalculado = '0';
  } else if (dvEsperado === 10) {
    dvCalculado = 'K';
  } else {
    dvCalculado = dvEsperado.toString();
  }
  
  return dv === dvCalculado;
}

// 🤖 POST /api/operia/ai-intake
router.post('/operia/ai-intake', authenticateToken, async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'El campo "text" (texto de correo o chat) es requerido y debe ser de tipo texto.' });
  }

  // Verificar que la API Key de Gemini esté configurada
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY no está configurada en las variables de entorno.');
    return res.status(500).json({ error: 'Error de configuración en el servidor. Falta la API Key de Gemini.' });
  }

  try {
    // Inicializar el SDK de Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Obtener la fecha de hoy para enviarla en la instrucción del sistema
    const hoy = new Date().toISOString().split('T')[0];

    // Definición de System Instructions detalladas para el modelo
    const systemInstruction = `Eres un asistente de inteligencia artificial experto en extracción de datos operativos para la plataforma Operia.
Analizarás textos desestructurados (como correos o chats de clientes) y extraerás la información relevante.
Debes formatear la salida estrictamente como un objeto JSON según el esquema de respuesta especificado.

Instrucciones de negocio:
1. cliente_rut: Busca y extrae el RUT de la empresa o cliente chileno. Si el RUT tiene puntos o guion (por ejemplo: 12.345.678-9 o 12345678-9), mantén el formato original que encuentres, pero asegúrate de extraerlo.
2. nombre_empresa: Identifica el nombre de la empresa, negocio o cliente solicitante.
3. direccion_despacho: Ubica la dirección donde se debe despachar o realizar el soporte/servicio. Si no se especifica explícitamente, intenta inferirla del contexto o déjala vacía.
4. descripcion_tarea: Haz un resumen claro e informativo del requerimiento técnico o tarea que solicita el cliente.
5. urgencia: Infiere la urgencia según el tono, palabras clave ("urgente", "inmediato", "ayer", "con calma") o plazos indicados. Debe ser exactamente una de estas tres opciones: "Baja", "Media" o "Alta".
6. fecha_limite: Identifica la fecha límite de entrega/soporte. Hoy es ${hoy}. Si el mensaje contiene plazos relativos (ej: "para mañana", "en 3 días", "el próximo viernes"), calcula la fecha ISO (YYYY-MM-DD) usando como base el día de hoy (${hoy}). Si no hay fecha límite, estima una fecha razonable basada en la urgencia (ej: Alta -> hoy + 1 día, Media -> hoy + 3 días, Baja -> hoy + 7 días) o usa hoy como fallback.

Responde únicamente el objeto JSON sin envoltorios de código markdown (\`\`\`json) ni texto adicional.`;

    // Obtener el modelo gemini-2.5-flash y configurar Structured Outputs
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction
    });

    // Definir el esquema JSON OpenAPI-compliant para Gemini
    const responseSchema = {
      type: "OBJECT",
      properties: {
        cliente_rut: { 
          type: "STRING", 
          description: "RUT chileno del cliente (por ejemplo, 12.345.678-9)." 
        },
        nombre_empresa: { 
          type: "STRING", 
          description: "Nombre o razón social de la empresa cliente." 
        },
        direccion_despacho: { 
          type: "STRING", 
          description: "Dirección física de despacho, soporte o servicio." 
        },
        descripcion_tarea: { 
          type: "STRING", 
          description: "Resumen técnico detallado de la tarea requerida." 
        },
        urgencia: { 
          type: "STRING", 
          enum: ["Baja", "Media", "Alta"],
          description: "Nivel de urgencia deducido del texto: Baja, Media o Alta." 
        },
        fecha_limite: { 
          type: "STRING", 
          description: "Fecha límite de resolución estimada en formato ISO YYYY-MM-DD." 
        }
      },
      required: [
        "cliente_rut",
        "nombre_empresa",
        "direccion_despacho",
        "descripcion_tarea",
        "urgencia",
        "fecha_limite"
      ]
    };

    // Llamar a Gemini con la configuración estructurada
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: text }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1 // Temperatura baja para mayor precisión determinista
      }
    });

    const outputText = response.response.text();
    console.log('🤖 Gemini 2.5 Raw JSON Response:', outputText);

    // Intentar parsear el JSON retornado
    let extractedData;
    try {
      extractedData = JSON.parse(outputText);
    } catch (parseError) {
      console.error('❌ Error parseando JSON de Gemini:', parseError);
      return res.status(500).json({ error: 'La IA no devolvió un JSON válido.' });
    }

    // 🛡️ Validación Determinista con Zod
    const validationResult = IntakeSchema.safeParse(extractedData);
    if (!validationResult.success) {
      console.error('❌ Error de validación Zod:', validationResult.error.errors);
      return res.status(400).json({
        error: 'Los datos extraídos por la IA no pasaron la validación del esquema.',
        details: validationResult.error.errors
      });
    }

    const validatedData = validationResult.data;

    // 🧮 Algoritmo de Validación del RUT (Módulo 11)
    const isRutValido = validarRutChileno(validatedData.cliente_rut);
    if (!isRutValido) {
      console.warn(`⚠️ RUT extraído inválido: ${validatedData.cliente_rut}`);
      return res.status(400).json({
        error: `El RUT extraído (${validatedData.cliente_rut}) es inválido.`,
        details: {
          field: 'cliente_rut',
          value: validatedData.cliente_rut,
          message: 'El RUT no cumple con el dígito verificador bajo el algoritmo Módulo 11.'
        }
      });
    }

    // Simular la inserción exitosa en la base de datos relacional de Operia
    return res.status(200).json({
      message: 'Ingesta procesada y validada correctamente.',
      simulated_insert: {
        ...validatedData,
        tenant_id: req.tenantId, // Mantenemos el aislamiento multi-tenant
        creador_id: req.userId,
        estado: 'Pendiente',
        created_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error en el endpoint de AI Intake:', error);
    return res.status(500).json({ error: 'Error interno al procesar la ingesta inteligente con IA.' });
  }
});

module.exports = router;
