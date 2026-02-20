// utils/helpers.js

export const formatDate = (dateString) => {
    if (!dateString) return 'Sin fecha';
    try {
        const defaultDate = new Date(dateString);
        if (!isNaN(defaultDate.getTime()) && dateString.length > 10) {
            return defaultDate.toLocaleString('es-CL', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '');
        }
    } catch (e) { }

    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return 'Fecha inválida';
    return dateObj.toLocaleDateString('es-CL', options);
};

export const hasClientData = (task) => {
    return task && !task.is_internal && task.client_snapshot;
};

export const hasClientInfo = (snapshot) => {
    if (!snapshot) return false;
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        return !!(client.name && client.name.trim() !== '');
    } catch { return false; }
};

export const getClientName = (snapshot) => {
    if (!snapshot) return '';
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        return client.name || '';
    } catch { return ''; }
};

export const getClientPhone = (snapshot) => {
    if (!snapshot) return '';
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        return client.phone || '';
    } catch { return ''; }
};

export const getClientAddress = (snapshot) => {
    if (!snapshot) return '';
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        return `${client.address_street || ''} ${client.commune || ''}`.trim();
    } catch { return ''; }
};

export const getClientReference = (snapshot) => {
    if (!snapshot) return '';
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        return client.reference || '';
    } catch { return ''; }
};

export const getGoogleMapsLink = (snapshot) => {
    if (!snapshot) return null;
    try {
        const client = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        if (!client || !client.address_street) return null;
        const fullAddress = `${client.address_street || ''}, ${client.commune || ''}, ${client.region || ''}, Chile`;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress.trim())}`;
    } catch { return null; }
};

export const esTareaParaHoy = (dueDateStr) => {
    if (!dueDateStr) return false;
    const hoy = new Date();
    const fechaTarea = new Date(dueDateStr);
    return hoy.getFullYear() === fechaTarea.getFullYear() &&
        hoy.getMonth() === fechaTarea.getMonth() &&
        hoy.getDate() === fechaTarea.getDate();
};

export const esTareaVencida = (dueDateStr, titulo) => {
    if (!dueDateStr) return false;
    const hoy = new Date();
    const fechaTarea = new Date(dueDateStr);
    return fechaTarea < hoy && !esTareaParaHoy(dueDateStr);
};

export const getLabelsArray = (labelsData) => {
    if (!labelsData) return [];
    if (Array.isArray(labelsData)) return labelsData.map(l => l.name);
    if (typeof labelsData === 'string') return labelsData.split(',').map(s => s.trim());
    return [];
};


export const formatCommentContent = (text) => {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/@([A-Za-z0-9_ Á-Úá-ú]+)/g, '<strong class="mention">@$1</strong>');
};

export const getColor = (labelName) => {
    if (!labelName) return '#7F8C8D';
    const predefinedColors = {
        'Entrega': '#049DD9', 'Express': '#3498DB', 'Factura': '#97BF04',
        'Valparaíso': '#F39C12', 'Viña del Mar': '#E67E22', 'Quilpué': '#16A085',
        'Prioritaria': '#E74C3C', 'Urgente': '#C0392B'
    };
    if (predefinedColors[labelName]) return predefinedColors[labelName];
    const defaultColors = ['#2980B9', '#27AE60', '#8E44AD', '#2C3E50', '#7F8C8D'];
    let hash = 0;
    for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return defaultColors[Math.abs(hash) % defaultColors.length];
};

export const getPriorityText = (priority) => ({ 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' }[priority] || priority);

export const getFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
