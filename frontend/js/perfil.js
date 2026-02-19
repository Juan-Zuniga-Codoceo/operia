
const { createApp, ref, computed, onMounted, watch, reactive } = Vue;

createApp({
  setup() {
    // --- ESTADO ---
    const user = ref({});
    const tareasAsignadas = ref([]);
    const historial = ref({ creadas: 0, asignadas: 0, completadas: 0 });
    const uploading = ref(false);
    const showDropdown = ref(false);
    const passwords = ref({ current: '', new: '', confirm: '' });
    const notificationsEnabled = ref(false);

    // Nuevo Estado para UI
    const activeTab = ref('resumen');
    const editMode = ref(false);
    const editForm = reactive({ name: '', phone: '' });

    // Estado para visibilidad de contraseñas
    const showCurrentPassword = ref(false);
    const showNewPassword = ref(false);
    const showConfirmPassword = ref(false);

    // --- FUNCIONES DE CARGA ---
    const loadUserAndSyncToggle = async () => {
      try {
        const localData = sessionStorage.getItem('biocare_user');
        if (localData) {
          user.value = JSON.parse(localData);
          notificationsEnabled.value = !!user.value.email_notifications;
        }

        const freshUser = await API.get('/api/me');

        user.value = freshUser;
        notificationsEnabled.value = !!freshUser.email_notifications;
        sessionStorage.setItem('biocare_user', JSON.stringify(freshUser));

      } catch (error) {
        console.error("Error al cargar datos de usuario:", error);
        if (!user.value.id) {
          sessionStorage.clear();
          window.location.href = '/login';
        }
      }
    };

    const cargarTareas = async () => {
      if (!user.value.id) return;
      try {
        const [asignadasRes, creadasRes] = await Promise.all([
          API.get(`/api/tasks?assigned_to=${user.value.id}`),
          API.get(`/api/tasks?created_by=${user.value.id}`)
        ]);
        tareasAsignadas.value = asignadasRes || [];
        const tareasCreadas = creadasRes || [];
        historial.value.asignadas = tareasAsignadas.value.length;
        historial.value.creadas = tareasCreadas.length;
        historial.value.completadas = tareasAsignadas.value.filter(t => t.status === 'completada').length;
      } catch (error) {
        API.showNotification('No se pudo cargar el historial de tareas.', 'error');
      }
    };

    // --- FUNCIONES DE EDICIÓN DE PERFIL ---
    const toggleEditMode = () => {
      editForm.name = user.value.name;
      editForm.phone = user.value.phone || '';
      editMode.value = true;
    };

    const cancelEdit = () => {
      editMode.value = false;
    };

    const saveProfile = async () => {
      if (!editForm.name.trim() || editForm.name.length < 2) {
        return API.showNotification('El nombre es obligatorio y debe tener al menos 2 caracteres.', 'error');
      }

      try {
        await API.put('/api/user/profile', {
          name: editForm.name,
          phone: editForm.phone
        });

        // Actualizar estado local
        user.value.name = editForm.name;
        user.value.phone = editForm.phone;
        sessionStorage.setItem('biocare_user', JSON.stringify(user.value));

        API.showNotification('Perfil actualizado correctamente.', 'success');
        editMode.value = false;
      } catch (error) {
        API.showNotification(error.message || 'Error al actualizar el perfil.', 'error');
      }
    };

    // --- FUNCIONES EXISTENTES (Avatar, Password, Preferencias) ---
    const updatePreferences = async (isEnabled) => {
      try {
        const payload = { email_notifications: isEnabled ? 1 : 0 };
        await API.put('/api/user/preferences', payload);

        const localUser = JSON.parse(sessionStorage.getItem('biocare_user'));
        if (localUser) {
          localUser.email_notifications = payload.email_notifications;
          user.value.email_notifications = payload.email_notifications;
          sessionStorage.setItem('biocare_user', JSON.stringify(localUser));
        }
        API.showNotification('Preferencias guardadas.', 'success');
      } catch (error) {
        API.showNotification('No se pudieron guardar las preferencias.', 'error');
        notificationsEnabled.value = !isEnabled;
      }
    };

    watch(notificationsEnabled, (newValue, oldValue) => {
      if (typeof oldValue === 'boolean') {
        updatePreferences(newValue);
      }
    });

    const handleAvatarUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      uploading.value = true;
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        const result = await API.upload('/api/user/avatar', formData);
        user.value.avatar_url = result.avatar_url;
        sessionStorage.setItem('biocare_user', JSON.stringify(user.value));
        API.showNotification('Imagen de perfil actualizada', 'success');
      } catch (error) {
        API.showNotification(error.message || 'Error al subir la imagen', 'error');
      } finally {
        uploading.value = false;
      }
    };

    const changePassword = async () => {
      if (!passwords.value.current || !passwords.value.new || !passwords.value.confirm) {
        return API.showNotification('Por favor, completa todos los campos.', 'error');
      }
      if (passwords.value.new !== passwords.value.confirm) {
        return API.showNotification('Las nuevas contraseñas no coinciden.', 'error');
      }
      if (passwords.value.new.length < 6) {
        return API.showNotification('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
      }
      try {
        await API.put('/api/user/password', {
          currentPassword: passwords.value.current,
          newPassword: passwords.value.new
        });
        API.showNotification('Contraseña actualizada con éxito.', 'success');
        passwords.value = { current: '', new: '', confirm: '' };
      } catch (error) {
        API.showNotification(error.message || 'Error al cambiar la contraseña.', 'error');
      }
    };

    // --- UTILIDADES ---
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
    };

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const avatarStyle = computed(() => ({
      'background-image': user.value.avatar_url ? `url('${user.value.avatar_url}')` : 'none',
    }));

    const formatStatus = (status) => {
      const map = { 'pendiente': 'Pendiente', 'en_camino': 'En Camino', 'completada': 'Completada' };
      return map[status] || status;
    };

    const formatPriority = (priority) => {
      const map = { 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' };
      return map[priority] || priority;
    };

    const formatDate = (isoDate) => {
      if (!isoDate) return '-';
      return new Date(isoDate).toLocaleDateString('es-CL');
    };

    // --- ELIMINAR ORGANIZACIÓN ---
    const showDeleteModal = ref(false);
    const deleteConfirmationInput = ref('');
    const tenant = ref(null);

    // Cargar info del tenant al montar
    const loadTenantInfo = () => {
      try {
        const t = localStorage.getItem('tenant');
        if (t) {
          tenant.value = JSON.parse(t);
        }
      } catch (e) {
        console.error("Error al leer tenant info", e);
      }
    };

    const deleteOrganization = async () => {
      if (deleteConfirmationInput.value !== tenant.value?.subdomain) {
        return;
      }

      try {
        await API.delete('/api/tenants/current', {
          confirmation_subdomain: deleteConfirmationInput.value
        });

        // Limpiar todo y redirigir
        localStorage.clear();
        sessionStorage.clear();

        // Redirigir a la landing page genérica
        window.location.href = 'https://operia.cl?deleted=true';

      } catch (error) {
        API.showNotification(error.message || 'Error al eliminar la organización', 'error');
        showDeleteModal.value = false;
      }
    };

    onMounted(() => {
      loadUserAndSyncToggle();
      loadTenantInfo();
      cargarTareas();
    });

    return {
      user, tareasAsignadas, historial, uploading, avatarStyle, showDropdown,
      toggleDropdown, logout, passwords, changePassword, handleAvatarUpload,
      notificationsEnabled,
      // Nuevos
      activeTab, editMode, editForm, toggleEditMode, cancelEdit, saveProfile,
      formatStatus, formatPriority, formatDate,
      // Visibilidad Password
      showCurrentPassword, showNewPassword, showConfirmPassword,
      // Eliminación
      showDeleteModal, deleteConfirmationInput, deleteOrganization, tenant
    };
  }
}).mount('#app');