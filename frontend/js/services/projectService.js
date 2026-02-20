export const projectService = {
    async getProjects() {
        return await API.get('/api/projects');
    },
    async createProject(projectData) {
        return await API.post('/api/projects', projectData);
    },
    async getProjectMembers(projectId) {
        return await API.get(`/api/projects/${projectId}/members`);
    },
    async addProjectMember(projectId, userId) {
        return await API.post(`/api/projects/${projectId}/members`, { user_id: userId });
    },
    async removeProjectMember(projectId, userId) {
        return await API.delete(`/api/projects/${projectId}/members/${userId}`);
    }
};
