// services/taskService.js
// Asume que `API` (de api.js) está disponible globalmente. En la refactorización final a módulos completos, API también se importaría idealmente.

export const taskService = {
    async getTasks(projectId = null) {
        const url = projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks';
        return API.get(url);
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

    async getSummary(projectId = null) {
        const url = projectId ? `/api/tasks/resumen?projectId=${projectId}` : '/api/tasks/resumen';
        return API.get(url);
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
