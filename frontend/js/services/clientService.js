// services/clientService.js

export const clientService = {
    async getClients() {
        return API.get('/api/clients');
    },

    async createClient(payload) {
        return API.post('/api/clients', payload);
    }
};
