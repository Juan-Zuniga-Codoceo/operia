// services/coreDataService.js

export const coreDataService = {
    async getUsers() {
        return API.get('/api/users');
    },

    async getLabels() {
        return API.get('/api/labels');
    },

    async createLabel(name, color) {
        return API.post('/api/labels', { name, color });
    },

    async getNotifications() {
        return API.get('/api/notifications');
    }
};
