// services/taskService.js
// Asume que `API` (de api.js) está disponible globalmente. En la refactorización final a módulos completos, API también se importaría idealmente.

export const taskService = {
    async getTasks() {
        return API.get('/api/tasks');
    },

    async getTask(id) {
        return API.get(`/api/tasks/${id}`);
    },

    async createTask(payload) {
        return API.post('/api/tasks', payload);
    },

    async updateTask(id, payload) {
        return API.put(`/api/tasks/${id}`, payload);
    },

    async deleteTask(id) {
        return API.delete(`/api/tasks/${id}`);
    },

    async getSummary() {
        return API.get('/api/tasks/resumen');
    },

    async checkDueToday() {
        return API.post('/api/tasks/check-due-today');
    },

    async changeStatus(id, newStatus) {
        return API.put(`/api/tasks/${id}/status`, { status: newStatus });
    },

    async advanceStep(id, currentStatus) {
        const nextStatus = currentStatus === 'pendiente' ? 'en_camino' : 'completada';
        return this.changeStatus(id, nextStatus);
    },

    async rewindStep(id, currentStatus) {
        const nextStatus = currentStatus === 'completada' ? 'en_camino' : 'pendiente';
        return this.changeStatus(id, nextStatus);
    }
};
