// backend/services/flow.service.js
// Flow Payment Gateway Integration for Chile
const axios = require('axios');
const crypto = require('crypto');

class FlowService {
    constructor() {
        this.apiKey = process.env.FLOW_API_KEY;
        this.secretKey = process.env.FLOW_SECRET_KEY;
        this.apiUrl = process.env.FLOW_API_URL || 'https://sandbox.flow.cl/api';
        this.webhookUrl = process.env.FLOW_WEBHOOK_URL;
    }

    /**
     * Genera la firma para autenticar las peticiones a Flow
     * @param {Object} params - Parámetros a firmar
     * @returns {string} Firma generada
     */
    generateSignature(params) {
        // Ordenar parámetros alfabéticamente
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}${params[key]}`)
            .join('');

        // Crear firma HMAC SHA256
        const signature = crypto
            .createHmac('sha256', this.secretKey)
            .update(sortedParams)
            .digest('hex');

        return signature;
    }

    /**
     * Valida la firma de un webhook de Flow
     * @param {Object} params - Parámetros recibidos del webhook
     * @param {string} receivedSignature - Firma recibida
     * @returns {boolean} True si la firma es válida
     */
    validateSignature(params, receivedSignature) {
        const calculatedSignature = this.generateSignature(params);
        return calculatedSignature === receivedSignature;
    }

    /**
     * Crea una orden de pago en Flow
     * @param {Object} paymentData - Datos del pago
     * @returns {Promise<Object>} Respuesta de Flow con URL de pago y token
     */
    async createPayment(paymentData) {
        try {
            const {
                commerceOrder,
                subject,
                amount,
                email,
                urlConfirmation,
                urlReturn,
                optional = {}
            } = paymentData;

            // Parámetros requeridos por Flow
            const params = {
                apiKey: this.apiKey,
                commerceOrder: commerceOrder,
                subject: subject,
                currency: 'CLP',
                amount: amount,
                email: email,
                urlConfirmation: urlConfirmation || this.webhookUrl,
                urlReturn: urlReturn
            };

            // Agregar parámetros opcionales si existen
            if (optional.paymentMethod) params.paymentMethod = optional.paymentMethod;
            if (optional.timeout) params.timeout = optional.timeout;
            if (optional.merchantId) params.merchantId = optional.merchantId;

            // Generar firma
            params.s = this.generateSignature(params);

            // Hacer petición a Flow
            const response = await axios.post(
                `${this.apiUrl}/payment/create`,
                null,
                { params }
            );

            if (response.data && response.data.url && response.data.token) {
                return {
                    success: true,
                    url: response.data.url + '?token=' + response.data.token,
                    token: response.data.token,
                    flowOrder: response.data.flowOrder
                };
            } else {
                throw new Error('Respuesta inválida de Flow');
            }
        } catch (error) {
            console.error('❌ Error al crear pago en Flow:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Obtiene el estado de una orden de pago
     * @param {string} token - Token de la orden
     * @returns {Promise<Object>} Estado de la orden
     */
    async getPaymentStatus(token) {
        try {
            const params = {
                apiKey: this.apiKey,
                token: token
            };

            // Generar firma
            params.s = this.generateSignature(params);

            const response = await axios.get(
                `${this.apiUrl}/payment/getStatus`,
                { params }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error al obtener estado de pago:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Obtiene el estado de una orden por commerceOrder
     * @param {string} commerceOrder - ID de la orden del comercio
     * @returns {Promise<Object>} Estado de la orden
     */
    async getPaymentByCommerceOrder(commerceOrder) {
        try {
            const params = {
                apiKey: this.apiKey,
                commerceOrder: commerceOrder
            };

            // Generar firma
            params.s = this.generateSignature(params);

            const response = await axios.get(
                `${this.apiUrl}/payment/getStatusByCommerceId`,
                { params }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error al obtener pago por commerceOrder:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Genera un commerceOrder único
     * @param {number} tenantId - ID del tenant
     * @param {string} plan - Plan seleccionado
     * @returns {string} commerceOrder único
     */
    generateCommerceOrder(tenantId, plan) {
        const timestamp = Date.now();
        return `OPERIA-${tenantId}-${plan.toUpperCase()}-${timestamp}`;
    }

    /**
     * Calcula el monto según el plan
     * @param {string} plan - Plan seleccionado
     * @returns {number} Monto en CLP
     */
    getPlanAmount(plan) {
        const plans = {
            starter: 0, // Gratis
            professional: 29990, // $29.990 CLP/mes
            business: 59990, // $59.990 CLP/mes
            enterprise: 99990 // $99.990 CLP/mes
        };

        return plans[plan.toLowerCase()] || 0;
    }

    /**
     * Obtiene los límites según el plan
     * @param {string} plan - Plan seleccionado
     * @returns {Object} Límites del plan
     */
    getPlanLimits(plan) {
        const limits = {
            starter: {
                max_users: 5,
                max_clients: 100,
                storage_limit_mb: 500
            },
            professional: {
                max_users: 25,
                max_clients: 500,
                storage_limit_mb: 5000
            },
            business: {
                max_users: 100,
                max_clients: 2000,
                storage_limit_mb: 20000
            },
            enterprise: {
                max_users: 999999,
                max_clients: 999999,
                storage_limit_mb: 100000
            }
        };

        return limits[plan.toLowerCase()] || limits.starter;
    }

    /**
     * Obtiene la descripción del plan
     * @param {string} plan - Plan seleccionado
     * @returns {string} Descripción del plan
     */
    getPlanDescription(plan) {
        const descriptions = {
            starter: 'Plan Starter - Gratis',
            professional: 'Plan Professional - Mensual',
            business: 'Plan Business - Mensual',
            enterprise: 'Plan Enterprise - Mensual'
        };

        return descriptions[plan.toLowerCase()] || 'Plan Operia';
    }
}

module.exports = new FlowService();
