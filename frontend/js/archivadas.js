const { createApp, ref, onMounted, computed } = Vue;

createApp({
  setup() {
    // Estado principal
    const user = ref(null);
    const archivedTasks = ref([]);
    const loading = ref(true);
    const showDropdown = ref(false);
    const searchTerm = ref('');
    const sortBy = ref('newest');
    const restoring = ref(null);
    const restoredCount = ref(0);
    const viewMode = ref('grid'); // 'grid' o 'list'

    // Estado para el modal de detalles
    const tareaSeleccionada = ref(null);
    const loadingDetails = ref(false);

    // --- FUNCIONES ---

    const cargarArchivadas = async () => {
      try {
        loading.value = true;
        const data = await API.get('/api/tasks/archived');
        archivedTasks.value = data || [];
      } catch (error) {
        API.showNotification('No se pudo cargar el historial archivado.', 'error');
        console.error('Error al cargar tareas archivadas:', error);
      } finally {
        loading.value = false;
      }
    };

    // Función para restaurar una tarea archivada
    const restoreTask = async (taskId) => {
      if (!taskId) {
        API.showNotification('ID de tarea inválido', 'error');
        return;
      }

      try {
        restoring.value = taskId;

        const response = await API.put(`/api/tasks/${taskId}/unarchive`);

        if (response.success) {
          restoredCount.value++;
          sessionStorage.setItem('restoredCount', restoredCount.value.toString());

          API.showNotification('✅ Tarea restaurada exitosamente', 'success');

          archivedTasks.value = archivedTasks.value.filter(t => t.id !== taskId);

          if (tareaSeleccionada.value?.id === taskId) {
            tareaSeleccionada.value = null;
          }

          setTimeout(() => {
            window.location.href = `/tablero.html?highlight_task=${taskId}`;
          }, 1000);

        } else {
          throw new Error(response.error || 'No se pudo restaurar la tarea');
        }
      } catch (error) {
        console.error('Error al restaurar tarea:', error);
        API.showNotification('❌ Error al restaurar: ' + (error.message || 'Error desconocido'), 'error');
        restoring.value = null;
        await cargarArchivadas();
      }
    };


    // Función para ver los detalles de una tarea archivada
    const verDetalles = async (task) => {
      try {
        loadingDetails.value = true;
        // Mostramos el modal con la info básica primero
        tareaSeleccionada.value = { ...task, loading: true };

        // Obtenemos los detalles completos del nuevo endpoint
        const fullTask = await API.get(`/api/tasks/${task.id}`);

        // Actualizamos la tarea seleccionada con la info completa
        tareaSeleccionada.value = { ...fullTask, loading: false };

      } catch (error) {
        API.showNotification('Error al cargar los detalles completos.', 'error');
        console.error('Error al cargar detalles:', error);
        // Mantenemos la info básica pero quitamos el loading
        if (tareaSeleccionada.value) {
          tareaSeleccionada.value.loading = false;
        }
      } finally {
        loadingDetails.value = false;
      }
    };

    const downloadAttachment = (filename, originalName) => {
      const token = sessionStorage.getItem('auth_token');
      const downloadUrl = `${API_BASE_URL}/api/download/${filename}`;

      fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (res.status === 403) throw new Error('No tienes permiso para descargar este archivo.');
          if (!res.ok) throw new Error('Error al descargar el archivo.');
          return res.blob();
        })
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = originalName;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
        })
        .catch(err => API.showNotification(err.message, 'error'));
    };

    // --- FUNCIONES DE UTILIDAD ---

    const formatDate = (isoDate) => {
      if (!isoDate) return 'Fecha no disponible';
      const date = new Date(isoDate);
      return date.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // --- FUNCIONES DEL HEADER ---
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      if (showDropdown.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('restoredCount');
      window.location.href = '/login.html';
    };

    const closeModalOnSelf = (event, modalName) => {
      if (event.target === event.currentTarget) {
        if (modalName === 'tareaSeleccionada') tareaSeleccionada.value = null;
      }
    };
    // --- COMPUTED PROPERTIES ---
    const filteredTasks = computed(() => {
      let filtered = archivedTasks.value;

      // Filtrar por término de búsqueda
      if (searchTerm.value) {
        const term = searchTerm.value.toLowerCase();
        filtered = filtered.filter(task =>
          task.title.toLowerCase().includes(term) ||
          (task.description && task.description.toLowerCase().includes(term))
        );
      }

      // Ordenar
      switch (sortBy.value) {
        case 'newest':
          return filtered.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
        case 'oldest':
          return filtered.sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
        case 'title':
          return filtered.sort((a, b) => a.title.localeCompare(b.title));
        default:
          return filtered;
      }
    });

    const completedThisWeek = computed(() => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      return archivedTasks.value.filter(task => {
        if (!task.completed_at) return false;
        return new Date(task.completed_at) >= oneWeekAgo;
      }).length;
    });

    onMounted(() => {
      const userData = sessionStorage.getItem('biocare_user');
      if (!userData) {
        window.location.href = '/login.html';
      } else {
        user.value = JSON.parse(userData);
      }

      // Leer el contador guardado al cargar la página
      const savedCount = sessionStorage.getItem('restoredCount');
      if (savedCount) {
        restoredCount.value = parseInt(savedCount, 10);
      }

      cargarArchivadas();
    });

    return {
      user,
      archivedTasks,
      loading,
      searchTerm,
      sortBy,
      filteredTasks,
      completedThisWeek,
      restoredCount,
      restoring,
      formatDate,
      showDropdown,
      toggleDropdown,
      logout,
      // Variables y funciones para el modal
      tareaSeleccionada,
      loadingDetails,
      verDetalles,
      restoreTask,
      viewMode, // <-- AÑADIDO
      downloadAttachment,
      closeModalOnSelf // <-- AÑADIDO
    };
  }
}).mount('#app');