export function useWebSocket(onTaskRestored, onTasksUpdated) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = wsProtocol + window.location.host;

    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('✅ Conectado al servidor WebSocket en tiempo real.');
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        };

        ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'TASK_RESTORED') {
                    console.log(`✨ Tarea ${message.taskId} restaurada, actualizando y resaltando...`);
                    if (onTaskRestored) onTaskRestored(message.taskId);
                } else if (message.type === 'TASKS_UPDATED') {
                    console.log('🔄 Recibida actualización genérica, recargando tablero...');
                    if (onTasksUpdated) onTasksUpdated();
                }
            } catch (e) {
                console.error('Error al procesar mensaje de WebSocket:', e);
            }
        };

        ws.onclose = () => {
            console.log('🔌 Desconectado del servidor WebSocket. Intentando reconectar en 5 segundos...');
            reconnectTimeout = setTimeout(connect, 5000);
        };

        ws.onerror = (error) => {
            console.error('❌ Error de WebSocket:', error);
            ws.close(); // Forzará la ejecución de onclose
        };
    };

    const disconnect = () => {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
        if (ws) {
            ws.onclose = null; // Prevenir reconexión al forzar cierre manual
            ws.close();
            ws = null;
        }
    };

    return { connect, disconnect };
}
