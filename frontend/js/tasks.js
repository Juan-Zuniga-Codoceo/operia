import { useWebSocket } from './composables/useWebSocket.js?v=1.5.6';
import { taskService } from './services/taskService.js?v=1.5.6';
import { clientService } from './services/clientService.js?v=1.5.6';
import { coreDataService } from './services/coreDataService.js?v=1.5.6';
import {
  formatDate, hasClientData, hasClientInfo, getClientName,
  getClientPhone, getClientAddress, getClientReference,
  getGoogleMapsLink, esTareaParaHoy, esTareaVencida, getLabelsArray,
  getColor, getPriorityText, getFileSize, formatCommentContent
} from './utils/helpers.js?v=1.5.6';
import TaskCard from './components/TaskCard.js?v=1.5.6';

const { createApp, ref, computed, onMounted, watch, reactive } = Vue;

createApp({
  components: {
    'update-modal': UpdateModal,
    'task-card': TaskCard
  },
  setup() {
    // ======================================================
    // 1. ESTADO REACTIVO (refs)
    // ======================================================
    const user = ref(null);
    const projects = ref([]);
    const selectedProjectId = ref(null);
    const showNewProjectModal = ref(false);
    const newProject = ref({ name: '', description: '' });
    const tasks = ref([]);
    const users = ref([]);
    const labels = ref([]);
    const resumen = ref({ vencidas: 0, proximas: 0, total_pendientes: 0 });
    const misTareas = ref(false);
    const filtroFecha = ref('');
    const showModal = ref(false);
    const showConfigModal = ref(false); // Nuevo modal de configuración
    const tareaSeleccionada = ref(null);

    // Configuración del Remitente (Cargar desde API)
    const defaultSender = {
      name: 'IMPORTADORA BIOCARE LTDA.',
      rut: '76.143.373-3',
      address: 'BLANCO 1023, L3',
      commune: 'QUILPUE',
      region: 'REGIÓN DE VALPARAÍSO',
      contactPerson: 'PATRICIO HERNÁNDEZ',
      contactRut: '10.738.733-1',
      phone: '322 922 506',
      email: 'ventas@ibiocare.cl',
      website: 'www.ibiocare.cl',
      thankYouMessage: 'GRACIAS POR PREFERIRNOS!!!!',
      logoUrl: ''
    };

    const senderConfig = ref({ ...defaultSender });

    // Cargar configuración desde el servidor
    const loadSenderConfig = async () => {
      try {
        const response = await API.get('/api/sender-config');
        if (response && response.name) {
          // Mapear logo_path a logoUrl para compatibilidad
          senderConfig.value = {
            ...response,
            logoUrl: response.logo_path || ''
          };
        }
      } catch (err) {
        console.warn('No se pudo cargar configuración del remitente, usando valores por defecto:', err);
      }
    };

    const handleLogoUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // Validar que sea una imagen
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
      }

      // Subir logo al servidor
      try {
        const formData = new FormData();
        formData.append('logo', file);

        const response = await API.upload('/api/sender-config/logo', formData);

        if (response && response.logoPath) {
          senderConfig.value.logoUrl = response.logoPath;
          alert('Logo actualizado exitosamente');
        }
      } catch (err) {
        console.error('Error al subir logo:', err);
        alert('Error al subir el logo. Por favor intenta nuevamente.');
      }
    };

    const saveSenderConfig = async () => {
      try {
        const configToSave = {
          name: senderConfig.value.name,
          rut: senderConfig.value.rut,
          address: senderConfig.value.address,
          commune: senderConfig.value.commune,
          region: senderConfig.value.region,
          phone: senderConfig.value.phone,
          email: senderConfig.value.email,
          website: senderConfig.value.website,
          contact_person: senderConfig.value.contactPerson,
          contact_rut: senderConfig.value.contactRut,
          thank_you_message: senderConfig.value.thankYouMessage
        };

        const response = await API.post('/api/sender-config', configToSave);

        if (response && response.success) {
          showConfigModal.value = false;
          Object.assign(SENDER_INFO, senderConfig.value);
          alert('Configuración guardada exitosamente');
        }
      } catch (err) {
        console.error('Error al guardar configuración:', err);
        alert('Error al guardar la configuración. Por favor intenta nuevamente.');
      }
    };

    // Variable global para usar en impresión (reactiva a cambios)
    const SENDER_INFO = reactive({ ...senderConfig.value });

    // Watch para mantener sincronizado SENDER_INFO si cambia senderConfig
    watch(senderConfig, (newVal) => {
      Object.assign(SENDER_INFO, newVal);
    }, { deep: true });
    const creandoTarea = ref(false);
    const loading = ref(true);
    const error = ref('');
    const showEditModal = ref(false);
    const editTask = ref({});
    const showDeleteConfirm = ref(false);
    const suggestedLabels = ref([]);
    const showDropdown = ref(false);
    const showNewLabelDropdown = ref(false);
    const showLabelDropdown = ref(false);
    const nuevaEtiqueta = ref('');
    const nuevoComentario = ref('');
    const archivosAdjuntos = ref([]);
    const commentAttachments = ref([]);
    const notificaciones = ref([]);
    const mostrarNotificaciones = ref(false);
    const newTaskFp = ref(null);
    const editTaskFp = ref(null);
    const showStateDropdown = ref(false);
    const archivosParaSubirEnEdicion = ref([]);
    const adjuntosParaBorrar = ref([]);
    const labelSearchTerm = ref('');
    const clientSearchTerm = ref('');
    const suggestedClients = ref([]);
    const saveAsFrequent = ref(false);

    // ======================================================
    // 2. PROPIEDADES COMPUTADAS (computed)
    // ======================================================
    const notificacionesPendientes = computed(() => notificaciones.value.filter(n => !n.leida).length);
    // ... (otras computed) ...

    const newTask = ref({
      title: '', description: '', due_date: '', priority: 'media',
      assigned_to: [], label_ids: [], comentario_inicial: '',
      responsible_user_id: null,
      origin: 'Valparaíso', shipping_type: 'Starken', payment_status: 'por_pagar',
      is_internal: false,
      client: {
        rut: '', name: '', email: '', phone: '',
        address_street: '', commune: '', region: '', reference: ''
      }
    });
    const keywordToLabelMap = {
      'factura': 'Factura', 'facturas': 'Factura', 'boleta': 'Factura',
      'enviar': 'Entrega', 'entrega': 'Entrega', 'despacho': 'Entrega',
      'express': 'Express', 'urgente': 'Urgente', 'prioridad': 'Prioritaria',
      'valparaíso': 'Valparaíso', 'valpo': 'Valparaíso', 'valparaiso': 'Valparaíso',
      'viña': 'Viña del Mar', 'vina': 'Viña del Mar',
      'quilpué': 'Quilpué', 'quilpue': 'Quilpué',
      'santiago': 'Santiago', 'stgo': 'Santiago',
      'pedido web': 'Pedido Web', 'starken': 'Starken', 'blueexpress': 'BlueExpress',
      'chileexpress': 'ChileExpress', 'bodega': 'Bodega'
    };
    const mostrandoSelectorCreador = ref(false);
    const nuevoCreadorId = ref(null);
    const showMentionList = ref(false);
    const filteredMentionUsers = ref([]);
    const mentionQuery = ref('');
    const mentionNavIndex = ref(-1);
    const showUpdateModal = ref(false);
    const APP_VERSION = "1.5.2";
    const showCompleteModal = ref(false);
    const taskToComplete = ref(null);
    const completionFile = ref(null);
    const closingNote = ref('');
    const isCompleting = ref(false);
    // ======================================================
    // 2. PROPIEDADES COMPUTADAS (computed)
    // ======================================================
    const selectedLabelsInNew = computed(() => labels.value.filter(l => newTask.value.label_ids.includes(l.id)));
    const availableLabelsInNew = computed(() => labels.value.filter(l => !newTask.value.label_ids.includes(l.id) && l.name.toLowerCase().includes(labelSearchTerm.value.toLowerCase())));
    const selectedLabelsInEdit = computed(() => labels.value.filter(l => editTask.value.label_ids.includes(l.id)));
    const availableLabelsInEdit = computed(() => labels.value.filter(l => !editTask.value.label_ids.includes(l.id) && l.name.toLowerCase().includes(labelSearchTerm.value.toLowerCase())));
    const tareasFiltradas = computed(() => {
      if (!Array.isArray(tasks.value)) return [];
      return tasks.value.filter(t => {
        let match = true;
        if (misTareas.value && user.value) {
          let assignedIds = [];
          if (Array.isArray(t.assigned_ids)) {
            assignedIds = t.assigned_ids;
          } else if (t.assigned_ids) {
            assignedIds = t.assigned_ids.toString().split(',').map(Number);
          }
          match = assignedIds.includes(user.value.id) || t.created_by === user.value.id;
        }
        if (filtroFecha.value) {
          match = match && t.due_date?.startsWith(filtroFecha.value);
        }
        return match;
      });
    });
    const tareasPendientes = computed(() => tareasFiltradas.value.filter(t => t.status === 'pendiente'));
    const tareasEnCamino = computed(() => tareasFiltradas.value.filter(t => t.status === 'en_camino'));
    const tareasCompletadas = computed(() => tareasFiltradas.value.filter(t => t.status === 'completada'));
    const selectedUsersInNew = computed(() => users.value.filter(u => newTask.value.assigned_to.includes(u.id)));
    const availableUsersInNew = computed(() => users.value.filter(u => !newTask.value.assigned_to.includes(u.id)));
    const selectedUsersInEdit = computed(() => users.value.filter(u => editTask.value.assigned_to.includes(u.id)));
    const availableUsersInEdit = computed(() => users.value.filter(u => !editTask.value.assigned_to.includes(u.id)));

    const puedeEditarTarea = computed(() => {
      if (!user.value || !tareaSeleccionada.value) return false;

      // 1. Admin puede editar
      if (user.value.role === 'admin') {
        return true;
      }
      // 2. Creador puede editar
      if (user.value.id === tareaSeleccionada.value.created_by) {
        return true;
      }

      // 3. ✨ MODIFICACIÓN: El Responsable también puede editar
      if (user.value.id === tareaSeleccionada.value.responsible_user_id) {
        return true;
      }

      // 4. Observador puede editar
      let assignedIds = [];
      if (Array.isArray(tareaSeleccionada.value.assigned_ids)) {
        assignedIds = tareaSeleccionada.value.assigned_ids.map(String);
      } else if (tareaSeleccionada.value.assigned_ids) {
        assignedIds = tareaSeleccionada.value.assigned_ids.toString().split(',');
      }
      return assignedIds.includes(user.value.id.toString());
    });


    const puedeEliminarTarea = computed(() => {
      if (!user.value || !tareaSeleccionada.value) return false;

      // Si el usuario es 'admin', siempre tiene permiso para eliminar.
      if (user.value.role === 'admin') {
        return true;
      }

      // Si no, solo el creador original puede eliminar.
      return user.value.id === tareaSeleccionada.value.created_by;
    });

    // ======================================================
    // 3. OBSERVADORES (watch)
    // ======================================================
    watch(() => [newTask.value.title, newTask.value.description], ([newTitle, newDesc]) => {
      if (labels.value.length === 0) return;
      const text = newTitle + ' ' + newDesc;
      if (!text.trim()) { suggestedLabels.value = []; return; }
      const foundLabelNames = new Set();
      for (const keyword in keywordToLabelMap) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) { foundLabelNames.add(keywordToLabelMap[keyword]); }
      }
      const alreadySelectedNames = new Set(selectedLabelsInNew.value.map(l => l.name));
      suggestedLabels.value = labels.value.filter(label =>
        foundLabelNames.has(label.name) && !alreadySelectedNames.has(label.name)
      );
    }, { deep: true });
    watch(() => [editTask.value.title, editTask.value.description], ([newTitle, newDesc]) => {
      if (labels.value.length === 0) return;
      if (!showEditModal.value) return;
      const text = newTitle + ' ' + newDesc;
      if (!text.trim()) { suggestedLabels.value = []; return; }
      const foundLabelNames = new Set();
      for (const keyword in keywordToLabelMap) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) { foundLabelNames.add(keywordToLabelMap[keyword]); }
      }
      const alreadySelectedNames = new Set(selectedLabelsInEdit.value.map(l => l.name));
      suggestedLabels.value = labels.value.filter(label =>
        foundLabelNames.has(label.name) && !alreadySelectedNames.has(label.name)
      );
    }, { deep: true });
    watch(showModal, (isVisible) => {
      if (isVisible) {
        Vue.nextTick(() => {
          newTaskFp.value = flatpickr("#new-task-datepicker", {
            allowInput: true,
            enableTime: true, altInput: true, altFormat: "d/m/Y H:i",
            dateFormat: "Y-m-d H:i", minDate: "today", locale: "es", static: true,
            time_24hr: false,
            onChange: (selectedDates, dateStr) => { newTask.value.due_date = dateStr; }
          });
        });
      } else {
        if (newTaskFp.value) {
          newTaskFp.value.destroy();
          newTaskFp.value = null;
        }
        resetForm();
      }
    });
    watch(showEditModal, (isVisible) => {
      if (isVisible) {
        Vue.nextTick(() => {
          const datepickerElement = document.getElementById("edit-task-datepicker");
          if (datepickerElement && !datepickerElement._flatpickr) {
            editTaskFp.value = flatpickr(datepickerElement, {
              enableTime: true,
              altInput: true,
              altFormat: "d/m/Y H:i",
              dateFormat: "Y-m-d H:i",
              minDate: "today",
              locale: "es",
              static: true,
              time_24hr: false,
              allowInput: true,
              defaultDate: editTask.value.due_date,
              onChange: (selectedDates, dateStr) => {
                editTask.value.due_date = dateStr;
              }
            });
          }
        });
      } else if (editTaskFp.value) {
        editTaskFp.value.destroy();
        editTaskFp.value = null;
      }
    });

    // ======================================================
    // 4. FUNCIONES
    // ======================================================
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      // Lógica para bloquear/desbloquear el scroll
      if (showDropdown.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };

    const handleNotificationClick = async (notificacion) => {
      // Cierra el panel si está abierto
      if (mostrarNotificaciones.value) {
        toggleNotifications();
      }

      // Si la notificación no está asociada a una tarea, no hace nada
      if (!notificacion.task_id) return;

      // Busca la tarea en la lista de tareas ya cargada
      const task = tasks.value.find(t => t.id === notificacion.task_id);

      if (task) {
        // Si la encuentra, muestra los detalles
        await verDetalles(task);
      } else {
        // Si no la encuentra, informa al usuario
        showError('La tarea no se encontró en el tablero actual.');
      }

      // Marca la notificación como leída si no lo estaba
      if (!notificacion.leida) {
        marcarComoLeida(notificacion.id);
      }
    };
    const showError = (message) => { API.showNotification(message, 'error'); };
    const showSuccess = (message) => { API.showNotification(message, 'success'); };
    const toggleStateDropdown = () => {
      showStateDropdown.value = !showStateDropdown.value;
    };
    const setQuickDate = (daysToAdd, event) => {
      if (event) event.preventDefault();
      const date = new Date();
      if (daysToAdd === 'eod') {
        date.setHours(18, 0, 0, 0);
      } else {
        date.setDate(date.getDate() + daysToAdd);
      }
      newTask.value.due_date = flatpickr.formatDate(date, "Y-m-d H:i");
      if (newTaskFp.value) {
        newTaskFp.value.setDate(date, false);
      }
    };
    const setQuickEditDate = (daysToAdd, event) => {
      if (event) event.preventDefault();
      const date = new Date();
      if (daysToAdd === 'eod') {
        date.setHours(18, 0, 0, 0);
      } else {
        date.setDate(date.getDate() + daysToAdd);
      }
      editTask.value.due_date = flatpickr.formatDate(date, "Y-m-d H:i");
      if (editTaskFp.value) {
        editTaskFp.value.setDate(date, false);
      }
    };

    const setupWebSocket = () => {
      const { connect } = useWebSocket(
        (taskId) => {
          cargarDatos().then(() => highlightTask(taskId));
        },
        () => {
          cargarDatos();
        }
      );
      connect();
    };

    const cargarProyectos = async () => {
      try {
        const response = await projectService.getProjects();
        projects.value = response || [];
        const savedProjectId = localStorage.getItem('operia_selected_project_id');
        if (savedProjectId && savedProjectId !== 'null' && projects.value.some(p => p.id == savedProjectId)) {
          selectedProjectId.value = parseInt(savedProjectId);
        } else {
          selectedProjectId.value = null; // General
        }
      } catch (err) {
        console.error('Error al cargar proyectos:', err);
      }
    };

    const cambiarProyecto = () => {
      localStorage.setItem('operia_selected_project_id', selectedProjectId.value || 'null');
      cargarDatos();
    };

    const abrirNuevoProyecto = () => {
      console.log('[DEBUG] abrirNuevoProyecto disparado.');
      console.log('[DEBUG] Estado previo de showNewProjectModal:', showNewProjectModal.value);
      showNewProjectModal.value = true;
      console.log('[DEBUG] Estado nuevo de showNewProjectModal:', showNewProjectModal.value);
    };

    const crearProyecto = async () => {
      try {
        const res = await projectService.createProject(newProject.value);
        if (res && res.id) {
          showSuccess('Proyecto creado exitosamente');
          showNewProjectModal.value = false;
          newProject.value = { name: '', description: '' };
          await cargarProyectos();
          selectedProjectId.value = res.id;
          cambiarProyecto();
        }
      } catch (err) {
        showError('Error al crear proyecto');
        console.error(err);
      }
    };

    onMounted(async () => {
      const userData = sessionStorage.getItem('biocare_user');
      if (!userData) {
        window.location.href = '/login.html';
        return;
      }
      user.value = JSON.parse(userData);

      await cargarProyectos();
      await cargarDatos();
      setupWebSocket();

      // Verificar si mostrar el modal de actualización
      const lastSeenVersion = localStorage.getItem('lastUpdateSeen');
      if (lastSeenVersion !== APP_VERSION) {
        showUpdateModal.value = true;
      }
    });

    const highlightTask = (taskId) => {
      // nextTick se asegura de que la interfaz se haya actualizado antes de buscar el elemento
      Vue.nextTick(() => {
        // Busca la tarjeta de la tarea usando su ID como un atributo de datos
        const taskElement = document.querySelector(`.task-card[data-task-id='${taskId}']`);
        if (taskElement) {
          console.log(`✨ Resaltando tarea ${taskId}`);
          // Añade la clase CSS que activa la animación
          taskElement.classList.add('highlight');

          // Quita la clase después de 4 segundos para detener la animación
          setTimeout(() => {
            taskElement.classList.remove('highlight');
          }, 4000);
        } else {
          console.log(`La tarea ${taskId} no se encontró en el tablero para ser resaltada.`);
        }
      });
    };

    const cargarDatos = async () => {
      try {
        loading.value = true;
        const [tasksData, usersData, labelsData, resumenData, notifData] = await Promise.all([
          taskService.getTasks(selectedProjectId.value), coreDataService.getUsers(), coreDataService.getLabels(),
          taskService.getSummary(selectedProjectId.value), coreDataService.getNotifications().catch(() => []),
          loadSenderConfig() // Cargar configuración del remitente
        ]);
        tasks.value = tasksData || [];
        users.value = usersData || [];
        labels.value = labelsData || [];
        resumen.value = resumenData || { vencidas: 0, proximas: 0, total_pendientes: 0 };
        notificaciones.value = notifData || [];
        taskService.checkDueToday();
        return tasksData;
      } catch (err) {
        console.error('Error al cargar datos:', err);
        showError('No se pudieron cargar los datos. Revisa tu conexión.');
      } finally {
        loading.value = false;
      }
    };

    const formatDescription = (text) => {
      if (!text) return '';
      return text.replace(/\n/g, '<br>');
    };

    // Eliminado bloque redundante de autenticación y onMounted
    // const userData = sessionStorage.getItem('biocare_user');
    // if (!userData) { window.location.href = '/login'; }
    // else { user.value = JSON.parse(userData); }

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const abrirModalEditar = () => {
      if (!tareaSeleccionada.value) return;

      // Parsear client_snapshot si existe
      let clientData = {
        rut: '', name: '', email: '', phone: '',
        address_street: '', commune: '', region: '', reference: ''
      };

      if (tareaSeleccionada.value.client_snapshot) {
        try {
          const parsed = typeof tareaSeleccionada.value.client_snapshot === 'string'
            ? JSON.parse(tareaSeleccionada.value.client_snapshot)
            : tareaSeleccionada.value.client_snapshot;
          clientData = { ...clientData, ...parsed };
        } catch (e) {
          console.error('Error parsing client_snapshot:', e);
        }
      }

      editTask.value = {
        id: tareaSeleccionada.value.id,
        title: tareaSeleccionada.value.title,
        description: tareaSeleccionada.value.description,
        due_date: tareaSeleccionada.value.due_date,
        priority: tareaSeleccionada.value.priority,
        assigned_to: (Array.isArray(tareaSeleccionada.value.assigned_ids)
          ? tareaSeleccionada.value.assigned_ids
          : (typeof tareaSeleccionada.value.assigned_ids === 'string'
            ? tareaSeleccionada.value.assigned_ids.split(',').map(Number)
            : [])),
        label_ids: (Array.isArray(tareaSeleccionada.value.label_ids)
          ? tareaSeleccionada.value.label_ids
          : (typeof tareaSeleccionada.value.label_ids === 'string'
            ? tareaSeleccionada.value.label_ids.split(',').map(Number)
            : [])),
        responsible_user_id: tareaSeleccionada.value.responsible_user_id,
        origin: tareaSeleccionada.value.origin || 'Valparaíso',
        shipping_type: tareaSeleccionada.value.shipping_type || 'Starken',
        payment_status: tareaSeleccionada.value.payment_status || 'por_pagar',
        attachments: tareaSeleccionada.value.attachments || [],
        client: clientData
      };

      archivosParaSubirEnEdicion.value = [];
      adjuntosParaBorrar.value = [];
      labelSearchTerm.value = '';
      tareaSeleccionada.value = null;
      showEditModal.value = true;
    };

    const guardarCambiosTarea = async () => {
      if (!editTask.value.title || !editTask.value.due_date) {
        alert('Por favor completa título y fecha límite.');
        return;
      }

      try {
        // 1. Actualizar datos de la tarea (incluyendo client)
        const taskData = {
          title: editTask.value.title,
          description: editTask.value.description || '',
          due_date: editTask.value.due_date,
          priority: editTask.value.priority,
          assigned_to: editTask.value.assigned_to,
          label_ids: editTask.value.label_ids,
          responsible_user_id: editTask.value.responsible_user_id || null,
          origin: editTask.value.origin || '',
          shipping_type: editTask.value.shipping_type || '',
          payment_status: editTask.value.payment_status || '',
          client: editTask.value.client,
          project_id: selectedProjectId.value // Aign it to the currently viewed project
        };

        await taskService.updateTask(editTask.value.id, taskData);

        // 2. Manejar archivos adjuntos si hay cambios
        if (adjuntosParaBorrar.value.length > 0) {
          await Promise.all(
            adjuntosParaBorrar.value.map(id => API.delete(`/api/attachments/${id}`))
          );
        }

        // 3. Subir nuevos archivos si los hay
        if (archivosParaSubirEnEdicion.value.length > 0) {
          const formData = new FormData();
          formData.append('task_id', editTask.value.id.toString());
          archivosParaSubirEnEdicion.value.forEach(file => {
            formData.append('files', file);
          });
          await API.upload('/api/upload', formData);
        }

        showEditModal.value = false;
        tareaSeleccionada.value = null;
        // Los datos se actualizarán automáticamente vía WebSocket
      } catch (err) {
        console.error(err);
        alert('No se pudo actualizar la tarea: ' + (err.message || ''));
      }
    };

    const abrirConfirmarEliminar = () => {
      showDeleteConfirm.value = true;
    };

    const eliminarTarea = async () => {
      try {
        await taskService.deleteTask(tareaSeleccionada.value.id);
        showDeleteConfirm.value = false;
        tareaSeleccionada.value = null;
        showSuccess('🗑️ Tarea eliminada correctamente');
      } catch (err) {
        showError('❌ Error al eliminar la tarea: ' + err.message);
      }
    };

    const crearTarea = async () => {
      if (!newTask.value.title.trim()) {
        return showError('El título es obligatorio');
      }
      if (!newTask.value.due_date) {
        return showError('La fecha de entrega es obligatoria');
      }

      creandoTarea.value = true;
      try {
        // 1. Guardar cliente si es necesario
        if (saveAsFrequent.value && newTask.value.client.rut) {
          try {
            await clientService.createClient(newTask.value.client);
          } catch (err) {
            console.warn('Error al guardar cliente frecuente (puede que ya exista):', err);
            // No bloqueamos la creación de la tarea, pero avisamos
            if (err.message.includes('ya existe')) {
              showError('El cliente ya existe, se usará el existente.');
            }
          }
        }

        // 2. Preparar payload
        const payload = {
          ...newTask.value,
          project_id: selectedProjectId.value, // Se asigna al proyecto actual
          client_snapshot: newTask.value.client // Enviamos el objeto cliente como snapshot
        };

        const result = await taskService.createTask(payload);

        if (archivosAdjuntos.value.length > 0 && result.id) {
          const formData = new FormData();
          formData.append('task_id', result.id.toString());
          for (const file of archivosAdjuntos.value) {
            formData.append('files', file);
          }
          await API.upload('/api/upload', formData);
        }
        showModal.value = false;
        showSuccess(`✅ Tarea creada: ${result.human_id || 'ID generado'}`);
      } catch (err) {
        showError('❌ Error al crear la tarea: ' + (err.message || ''));
      } finally {
        creandoTarea.value = false;
      }
    };

    const avanzarEstado = (task) => {
      taskService.advanceStep(task.id, task.status);
      showStateDropdown.value = false;
    };

    const retrocederEstado = (task) => {
      taskService.rewindStep(task.id, task.status);
      showStateDropdown.value = false;
    };

    const toggleLabelInNew = (labelId) => {
      const index = newTask.value.label_ids.indexOf(labelId);
      if (index > -1) {
        newTask.value.label_ids.splice(index, 1);
      } else {
        newTask.value.label_ids.push(labelId);
      }
    };

    const toggleLabelInEdit = (labelId) => {
      const index = editTask.value.label_ids.indexOf(labelId);
      if (index > -1) {
        editTask.value.label_ids.splice(index, 1);
      } else {
        editTask.value.label_ids.push(labelId);
      }
    };

    const addUserToNewTask = (userId) => {
      const id = parseInt(userId);
      if (id && !newTask.value.assigned_to.includes(id)) {
        newTask.value.assigned_to.push(id);
      }
      event.target.value = '';
    };

    const removeUserFromNewTask = (userId) => {
      newTask.value.assigned_to = newTask.value.assigned_to.filter(id => id !== userId);
    };

    const addUserToEditTask = (userId) => {
      const id = parseInt(userId);
      if (id && !editTask.value.assigned_to.includes(id)) {
        editTask.value.assigned_to.push(id);
      }
      event.target.value = '';
    };

    const removeUserFromEditTask = (userId) => {
      editTask.value.assigned_to = editTask.value.assigned_to.filter(id => id !== userId);
    };

    const resetForm = () => {
      newTask.value = {
        title: '', description: '', due_date: '', priority: 'media',
        assigned_to: [], label_ids: [], is_internal: false, comentario_inicial: '',
        responsible_user_id: null,
        origin: 'Valparaíso', shipping_type: 'Starken', payment_status: 'por_pagar',
        client: {
          rut: '', name: '', email: '', phone: '',
          address_street: '', commune: '', region: ''
        }
      };
      clientSearchTerm.value = '';
      suggestedClients.value = [];
      saveAsFrequent.value = false;

      nuevaEtiqueta.value = '';
      nuevoComentario.value = '';
      archivosAdjuntos.value = [];
      labelSearchTerm.value = '';
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
    };

    const handleFileUpload = (event) => {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        // Comprobamos que no se exceda el límite total
        if ((archivosAdjuntos.value.length + files.length) > 5) {
          showError('Puedes subir un máximo de 5 archivos.');
          return;
        }
        // Comprobamos el tamaño de cada archivo
        for (const file of files) {
          if (file.size > 10 * 1024 * 1024) { // 10MB
            showError(`El archivo "${file.name}" excede los 10MB.`);
            continue; // Salta este archivo y continúa con los demás
          }
          archivosAdjuntos.value.push(file);
        }
      }
    };

    const handleFileUploadEnEdicion = (event) => {
      // Agrega los archivos seleccionados a la lista de nuevos adjuntos
      for (const file of event.target.files) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          continue;
        }
        archivosParaSubirEnEdicion.value.push(file);
      }
      event.target.value = ''; // Resetea el input
    };

    const quitarDeLaListaDeSubida = (index) => {
      // Quita un archivo de la lista de previsualización antes de subirlo
      archivosParaSubirEnEdicion.value.splice(index, 1);
    };

    const marcarParaBorrar = (attachmentId) => {
      // Marca o desmarca un adjunto existente para su eliminación al guardar
      const index = adjuntosParaBorrar.value.indexOf(attachmentId);
      if (index > -1) {
        adjuntosParaBorrar.value.splice(index, 1); // Desmarcar si ya está en la lista
      } else {
        adjuntosParaBorrar.value.push(attachmentId); // Marcar para borrar
      }
    };

    const archivarTarea = async (taskId) => {
      try {
        await API.post(`/api/tasks/${taskId}/archive`);
        tareaSeleccionada.value = null; // Cierra el modal
        showSuccess('✅ Tarea archivada correctamente');
        // La actualización del tablero será automática gracias al broadcast
      } catch (err) {
        showError('❌ Error al archivar la tarea: ' + err.message);
      }
    };
    const removeFile = () => {
      archivosAdjuntos.value = []; // CORREGIDO: se limpia el array
      document.getElementById('fileInput').value = '';
    };

    const searchClients = async () => {
      if (clientSearchTerm.value.length < 2) {
        suggestedClients.value = [];
        return;
      }
      try {
        const results = await API.get(`/api/clients?search=${clientSearchTerm.value}`);
        suggestedClients.value = results;
      } catch (err) {
        console.error('Error buscando clientes:', err);
      }
    };

    const selectClient = (client) => {
      newTask.value.client = { ...client };
      clientSearchTerm.value = ''; // Limpiar búsqueda
      suggestedClients.value = []; // Ocultar sugerencias
    };

    const toggleSaveAsFrequent = () => {
      saveAsFrequent.value = !saveAsFrequent.value;
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) {
        return showError('El nombre de la etiqueta es obligatorio');
      }
      try {
        await API.post('/api/labels', { name: nuevaEtiqueta.value.trim() });
        nuevaEtiqueta.value = '';


        await cargarDatos(); // Recargamos todos los datos, incluyendo las nuevas etiquetas

        showSuccess('🏷️ Etiqueta creada exitosamente');
      } catch (err) {
        showError('❌ No se pudo crear la etiqueta: ' + (err.message || ''));
      }
    };
    const cambiarEstadoTarea = async (id, nuevoEstado, event) => {
      if (event) event.stopPropagation();
      try {
        await API.put(`/api/tasks/${id}/status`, { status: nuevoEstado });
        tareaSeleccionada.value = null;
        showSuccess(`Tarea movida a "${nuevoEstado.replace('_', ' ')}"`);
      } catch (err) {
        showError('❌ Error al actualizar la tarea: ' + err.message);
      }
    };

    const verDetalles = async (task) => {
      try {
        const [attachments, comments] = await Promise.all([
          API.get(`/api/attachments/task/${task.id}`).catch(() => []),
          API.get(`/api/tasks/${task.id}/comments`).catch(() => [])
        ]);
        task.attachments = attachments;
        task.comentarios = comments;
        console.log('Detalles actualizados para tarea', task.id, { attachments, comments });
      } catch (err) {
        console.error('Error al cargar detalles:', err);
        task.attachments = [];
        task.comentarios = [];
      }
      tareaSeleccionada.value = task;
    };

    const downloadFile = async (attachment) => {
      try {
        const blob = await API.requestBlob(`/api/download/${attachment.file_path}`);
        const url = window.URL.createObjectURL(blob);
        Utils.downloadFile(url, attachment.file_name);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        showError('❌ Error al descargar archivo: ' + err.message);
      }
    };

    const handleCommentAttachment = (event) => {
      const files = Array.from(event.target.files);
      // Lógica similar a handleFileUpload para commentAttachments.value
      if ((commentAttachments.value.length + files.length) > 5) {
        showError('Puedes adjuntar un máximo de 5 archivos por comentario.');
        return;
      }
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          continue;
        }
        commentAttachments.value.push(file);
      }
    };

    const removeCommentAttachment = (index) => {
      if (typeof index === 'number') {
        commentAttachments.value.splice(index, 1);
      } else {
        commentAttachments.value = [];
      }
      const fileInput = document.getElementById('comment-file');
      if (fileInput) fileInput.value = '';
    };

    const removeCommentAttachmentFile = (index) => {
      // Elimina el archivo de la lista por su índice
      commentAttachments.value.splice(index, 1);
      // Resetea el input para poder volver a seleccionar los mismos archivos si es necesario
      document.getElementById('comment-file').value = '';
    };

    const agregarComentario = async () => {
      if ((!nuevoComentario.value.trim() && commentAttachments.value.length === 0) || !tareaSeleccionada.value) {
        return;
      }
      try {
        const formData = new FormData();
        formData.append('task_id', tareaSeleccionada.value.id);
        formData.append('contenido', nuevoComentario.value.trim());


        // 1. Encontrar todas las menciones que sigan el formato @Nombre Completo
        const mentionRegex = /@([A-Za-z0-9_ Á-Úá-ú]+)/g;
        const mentions = nuevoComentario.value.match(mentionRegex);
        const mentionedUserIds = new Set();

        if (mentions) {
          mentions.forEach(mention => {
            const username = mention.substring(1).trim(); // Quitar el '@' y espacios extra
            // Buscamos el usuario en nuestra lista de usuarios cargada (insensible a mayúsculas)
            const foundUser = users.value.find(u => u.name.toLowerCase() === username.toLowerCase());
            if (foundUser) {
              mentionedUserIds.add(foundUser.id);
            }
          });
        }

        // 2. Si encontramos IDs, los añadimos al FormData como un string JSON
        if (mentionedUserIds.size > 0) {
          formData.append('mentioned_user_ids', JSON.stringify(Array.from(mentionedUserIds)));
        }


        if (commentAttachments.value.length > 0) {
          for (const file of commentAttachments.value) {
            formData.append('attachments', file);
          }
        }

        await API.upload('/api/tasks/comments', formData);

        nuevoComentario.value = '';
        removeCommentAttachment();
        showSuccess('💬 Comentario agregado');

        const taskActual = tasks.value.find(t => t.id === tareaSeleccionada.value.id);
        if (taskActual) {
          await verDetalles(taskActual);
        }
      } catch (err) {
        showError('❌ Error al agregar comentario: ' + err.message);
      }
    };
    const getLabelsArray = (task) => {
      if (!task?.label_names) return [];
      if (Array.isArray(task.label_names)) return task.label_names;
      if (typeof task.label_names === 'string') {
        return task.label_names.split(',').map(label => label.trim()).filter(Boolean);
      }
      return [];
    };

    const toggleNotifications = () => {
      mostrarNotificaciones.value = !mostrarNotificaciones.value;
      if (mostrarNotificaciones.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };

    const marcarComoLeida = async (id, event) => {
      if (event) event.stopPropagation();
      try {
        await API.put(`/api/notifications/${id}/read`);
        const notif = notificaciones.value.find(n => n.id === id);
        if (notif) notif.leida = true;
      } catch (err) {
        showError('Error al marcar como leída');
      }
    };

    const marcarTodasComoLeidas = async () => {
      try {
        await API.put('/api/notifications/read-all');
        notificaciones.value.forEach(n => {
          if (!n.leida) n.leida = true;
        });
      } catch (err) {
        showError('Error al marcar todas como leídas');
      }
    };

    const eliminarNotificacion = async (id, event) => {
      if (event) event.stopPropagation();
      try {
        await API.delete(`/api/notifications/${id}`);
        notificaciones.value = notificaciones.value.filter(n => n.id !== id);
      } catch (err) {
        showError('Error al eliminar notificación');
      }
    };

    // Las utilidades fueron extraídas a helpers.js




    const abrirSelectorDeCreador = () => {
      if (!tareaSeleccionada.value) return;
      // Pre-seleccionamos el creador actual en el dropdown
      nuevoCreadorId.value = tareaSeleccionada.value.created_by;
      mostrandoSelectorCreador.value = true;
    };

    const confirmarCambioDeCreador = async () => {
      if (!nuevoCreadorId.value) {
        return showError("Debes seleccionar un nuevo creador.");
      }

      try {
        const taskId = tareaSeleccionada.value.id;
        await API.put(`/api/tasks/${taskId}/creator`, { newCreatorId: nuevoCreadorId.value });

        showSuccess('Creador de la tarea actualizado con éxito.');
        mostrandoSelectorCreador.value = false; // Cierra el nuevo modal
        tareaSeleccionada.value = null;      // Cierra el modal de detalles

      } catch (err) {
        showError(err.message || 'No se pudo cambiar el creador.');
      }
    };

    const handleCommentInput = (event) => {
      const text = event.target.value;
      const cursorPos = event.target.selectionStart;

      // Regex para encontrar si estamos escribiendo una mención (ej: @jua)
      const mentionMatch = text.slice(0, cursorPos).match(/@(\w*)$/);

      if (mentionMatch) {
        mentionQuery.value = mentionMatch[1].toLowerCase();
        filteredMentionUsers.value = users.value.filter(u =>
          u.name.toLowerCase().includes(mentionQuery.value)
        );
        showMentionList.value = true;
        mentionNavIndex.value = 0; // Resetea el índice de navegación
      } else {
        showMentionList.value = false;
        mentionNavIndex.value = -1;
      }
    };

    const selectMention = (user) => {
      const text = nuevoComentario.value;
      const cursorPos = document.querySelector('.comment-form textarea').selectionStart;
      const textBeforeCursor = text.slice(0, cursorPos);

      // Reemplaza la mención parcial (ej: @jua) por la completa (@Juan Perez )
      const newTextBefore = textBeforeCursor.replace(/@(\w*)$/, `@${user.name} `);

      nuevoComentario.value = newTextBefore + text.slice(cursorPos);
      showMentionList.value = false;
      mentionNavIndex.value = -1;

      // Ponemos el foco de vuelta en el textarea
      Vue.nextTick(() => {
        const textarea = document.querySelector('.comment-form textarea');
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = newTextBefore.length;
      });
    };

    const navigateMentions = (direction) => {
      if (!showMentionList.value || filteredMentionUsers.value.length === 0) return;
      if (direction === 'down') {
        mentionNavIndex.value = (mentionNavIndex.value + 1) % filteredMentionUsers.value.length;
      } else if (direction === 'up') {
        mentionNavIndex.value = (mentionNavIndex.value - 1 + filteredMentionUsers.value.length) % filteredMentionUsers.value.length;
      }
    };

    const selectMentionWithEnter = (event) => {
      if (showMentionList.value && mentionNavIndex.value >= 0) {
        selectMention(filteredMentionUsers.value[mentionNavIndex.value]);
        event.preventDefault(); // Evita que se inserte un salto de línea
      } else {
        // Permite el comportamiento normal del Enter (agregar comentario) si no hay menú
        agregarComentario();
      }
    };

    const closeUpdateModal = (shouldNotShowAgain) => {
      if (shouldNotShowAgain) {
        // Guardamos la versión actual que el usuario ha visto
        localStorage.setItem('lastUpdateSeen', APP_VERSION);
      }
      showUpdateModal.value = false;
    };

    const openCompleteModal = (task, event) => {
      if (event) event.stopPropagation();
      taskToComplete.value = task;
      completionFile.value = null;
      closingNote.value = '';
      isCompleting.value = false;
      showCompleteModal.value = true;

      // Resetear el input de archivo
      Vue.nextTick(() => {
        const fileInput = document.getElementById('completion-file');
        if (fileInput) fileInput.value = '';
      });
    };

    const closeCompleteModal = () => {
      showCompleteModal.value = false;
      taskToComplete.value = null;
      completionFile.value = null;
      closingNote.value = '';
    };

    const confirmCompleteTask = async () => {
      if (!taskToComplete.value) return;

      isCompleting.value = true;
      try {
        // 1. Subir archivo si existe
        if (completionFile.value) {
          const formData = new FormData();
          formData.append('task_id', taskToComplete.value.id);
          formData.append('files', completionFile.value);
          await API.upload('/api/upload', formData);
        }

        // 2. Agregar comentario de cierre si existe
        if (closingNote.value.trim()) {
          const formData = new FormData();
          formData.append('task_id', taskToComplete.value.id);
          formData.append('contenido', '🏁 Nota de cierre: ' + closingNote.value);
          await API.upload('/api/tasks/comments', formData);
        }

        // 3. Cambiar estado a completada
        await cambiarEstadoTarea(taskToComplete.value.id, 'completada');

        closeCompleteModal();
      } catch (err) {
        showError('Error al completar la tarea: ' + err.message);
      } finally {
        isCompleting.value = false;
      }
    };

    const handleCompletionFile = (event) => {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          event.target.value = ''; // Limpia el input
          return;
        }
        completionFile.value = file;
      } else {
        completionFile.value = null;
      }
    };

    const cancelCompletion = () => {
      showCompleteModal.value = false;
      taskToComplete.value = null;
      completionFile.value = null;
      closingNote.value = '';
      isCompleting.value = false;
      // Limpiamos el input del archivo por si el usuario cancela
      const fileInput = document.getElementById('completion-file');
      if (fileInput) fileInput.value = '';
    };

    // REEMPLAZA tu función `confirmCompletion` con esta versión

    const confirmCompletion = async () => {
      if (!taskToComplete.value) return;

      isCompleting.value = true;
      const formData = new FormData();

      if (completionFile.value) {
        formData.append('completion_proof', completionFile.value);
      }
      if (closingNote.value.trim()) {
        formData.append('closing_note', closingNote.value.trim());
      }

      try {
        const response = await API.upload(`/api/tasks/${taskToComplete.value.id}/complete`, formData);

        if (response.success) {
          const successMessage = `La tarea "${taskToComplete.value.title}" ha sido completada.`;
          showSuccess(successMessage);
          cancelCompletion();
          await cargarDatos();
        } else {
          // 👇 ESTE BLOQUE ES LA MEJORA CLAVE 👇
          // Si la API dice que no fue exitoso, lanzamos un error para que lo capture el 'catch'
          throw new Error(response.error || 'El servidor indicó un error al completar la tarea.');
        }

      } catch (err) {
        console.error('Error en confirmCompletion:', err);
        showError(err.message || 'No se pudo completar la tarea.');
      } finally {
        isCompleting.value = false;
      }
    };

    // Función auxiliar para imprimir en ventana nueva (evita hoja en blanco)
    const printInNewWindow = (content) => {
      const printWindow = window.open('', '_blank', 'height=600,width=800');
      if (!printWindow) {
        alert('Por favor, permite las ventanas emergentes para imprimir.');
        return;
      }

      printWindow.document.write('<html><head><title>Imprimir Etiqueta</title>');
      printWindow.document.write(`<base href="${window.location.origin}">`);
      printWindow.document.write('<style>');
      printWindow.document.write(`
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .label-internal {
          padding: 40px;
          max-width: 400px;
          margin: 0 auto;
          border: 3px solid #000;
          text-align: center;
        }
        .label-id {
          font-size: 48px;
          font-weight: bold;
          margin: 20px 0;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        .label-meta p {
          font-size: 18px;
          margin: 10px 0;
          text-align: left;
        }
        
        .label-courier {
          padding: 20px;
          max-width: 600px;
          margin: 0 auto;
          border: 2px solid #000;
        }
        .sender-box, .recipient-box {
          border: 1px solid #000;
          padding: 15px;
          margin: 15px 0;
        }
        .sender-box h3, .recipient-box h3 {
          margin: 0 0 10px 0;
          font-size: 14px;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
          text-transform: uppercase;
        }
        .recipient-name {
          font-size: 24px;
          font-weight: bold;
          margin: 10px 0;
        }
        .recipient-address {
          font-size: 18px;
          margin-top: 10px;
        }
        .shipping-details {
          margin-top: 20px;
          padding: 15px;
          background: #f0f0f0;
          border: 1px solid #ddd;
        }
        .detail-item {
          margin: 8px 0;
          font-size: 16px;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
        }
        .detail-item:last-child { border-bottom: none; }
      `);
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(content);
      printWindow.document.write('</body></html>');

      printWindow.document.close();
      printWindow.focus();

      // Esperar un momento para asegurar que los estilos carguen
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    };

    const printInternalLabel = (taskId) => {
      const task = tasks.value.find(t => t.id === taskId);
      if (!task) return;

      const content = `
        <div class="label-internal">
          <h1 class="label-id">${task.human_id || 'ID-' + task.id}</h1>
          <div class="label-meta">
            <p><strong>Creado por:</strong> ${task.created_by_name}</p>
            <p><strong>Fecha:</strong> ${new Date(task.created_at).toLocaleDateString()}</p>
            <p><strong>Origen:</strong> ${task.origin || 'N/A'}</p>
          </div>
        </div>
      `;

      printInNewWindow(content);
    };

    const printCourierLabel = (taskId) => {
      const task = tasks.value.find(t => t.id === taskId);
      if (!task) return;

      let client = {};
      try {
        client = typeof task.client_snapshot === 'string'
          ? JSON.parse(task.client_snapshot)
          : (task.client_snapshot || {});
      } catch (e) {
        console.error('Error parsing client:', e);
      }

      const content = `
        <div class="label-courier">
          <div class="header-logo" style="text-align: center; margin-bottom: 15px;">
            ${SENDER_INFO.logoUrl ? `<img src="${SENDER_INFO.logoUrl}" style="max-height: 80px;" />` : ''}
          </div>
          
          <div class="recipient-box">
            <h3>DESTINATARIO</h3>
            <p class="recipient-name">${client.name || 'Cliente General'}</p>
            <p><strong>RUT:</strong> ${client.rut || 'S/I'}</p>
            <p><strong>Tel:</strong> ${client.phone || 'S/I'}</p>
            ${client.email ? `<p><strong>Email:</strong> ${client.email}</p>` : ''}
            <p class="recipient-address">
              ${client.address_street || ''} ${client.number || ''} <br>
              ${client.reference ? '<strong>Ref:</strong> ' + client.reference + '<br>' : ''}
              ${client.commune || ''}, ${client.region || ''}
            </p>
          </div>
          
          <div class="sender-box">
            <h3>REMITENTE</h3>
            <p><strong>${SENDER_INFO.name}</strong></p>
            ${SENDER_INFO.rut ? `<p>Rut: ${SENDER_INFO.rut}</p>` : ''}
            <p>${SENDER_INFO.address}</p>
            <p>${SENDER_INFO.commune}${SENDER_INFO.region ? ', ' + SENDER_INFO.region : ''}</p>
            ${SENDER_INFO.contactPerson ? `<p><strong>${SENDER_INFO.contactPerson}</strong></p>` : ''}
            ${SENDER_INFO.contactRut ? `<p>Rut: ${SENDER_INFO.contactRut}</p>` : ''}
            <p>Fono: ${SENDER_INFO.phone}</p>
            ${SENDER_INFO.website || SENDER_INFO.email ? `<p>${SENDER_INFO.website || ''} ${SENDER_INFO.email || ''}</p>` : ''}
            ${SENDER_INFO.thankYouMessage ? `<p style="font-weight: bold; margin-top: 10px;">${SENDER_INFO.thankYouMessage}</p>` : ''}
          </div>

          <div class="shipping-details">
            <div class="detail-item">
              <span>Courier:</span>
              <strong>${task.shipping_type || 'Por definir'}</strong>
            </div>
            <div class="detail-item">
              <span>Pago:</span>
              <strong>${task.payment_status === 'por_pagar' ? 'POR PAGAR' : 'PAGADO'}</strong>
            </div>
            <div class="detail-item">
              <span>ID Pedido:</span>
              <strong>${task.human_id || task.id}</strong>
            </div>
          </div>
        </div>
      `;

      printInNewWindow(content);
    };

    // ======================================================
    // 5. Carga Inicial (Lifecycle Hook) - VERSIÓN CORREGIDA
    // ======================================================
    onMounted(() => {
      cargarDatos();
      setupWebSocket();

      API.post('/api/tasks/auto-archive').catch(err => {
        console.log('No se pudo ejecutar archivado automático:', err);
      });

      // 👇 Lógica de resaltado ahora usa la nueva función
      const params = new URLSearchParams(window.location.search);
      const taskIdToHighlight = params.get('highlight_task');
      if (taskIdToHighlight) {
        highlightTask(taskIdToHighlight);
      }

      // Lógica del pop-up (sin cambios)
      const lastSeenVersion = localStorage.getItem('lastUpdateSeen');
      if (lastSeenVersion !== APP_VERSION) {
        showUpdateModal.value = true;
      }
    });
    // ======================================================
    // 6. EXPOSICIÓN A LA PLANTILLA (return)
    // ======================================================
    // REEMPLAZA tu `return` actual con este bloque completo

    const hasClientData = (task) => {
      if (!task || !task.client_snapshot) return false;
      try {
        const client = typeof task.client_snapshot === 'string'
          ? JSON.parse(task.client_snapshot)
          : task.client_snapshot;
        // Consideramos que hay datos si al menos el nombre tiene contenido real
        return client.name && client.name.trim().length > 0;
      } catch (e) {
        return false;
      }
    };

    // --- GESTIÓN DE CLIENTES ---
    const showClientManager = ref(false);
    const managedClients = ref([]);
    const clientManagerSearch = ref('');
    const editingClient = ref(null);

    const loadClients = async () => {
      try {
        const query = clientManagerSearch.value.trim();
        const url = query ? `/api/clients?search=${query}` : '/api/clients?search=';
        const results = await API.get(url);
        managedClients.value = results;
      } catch (err) {
        console.error('Error cargando clientes:', err);
        showError('Error al cargar clientes');
      }
    };

    const openClientManager = () => {
      clientManagerSearch.value = '';
      editingClient.value = null;
      showClientManager.value = true;
      loadClients();
    };

    const openCreateClient = () => {
      editingClient.value = {
        rut: '', name: '', email: '', phone: '',
        address_street: '', commune: '', region: '', reference: ''
      };
    };

    const editClient = (client) => {
      editingClient.value = { ...client };
    };

    const cancelEditClient = () => {
      editingClient.value = null;
    };

    const saveClientChanges = async () => {
      if (!editingClient.value) return;
      try {
        if (editingClient.value.id) {
          // Actualizar existente
          await API.put(`/api/clients/${editingClient.value.id}`, editingClient.value);
          showSuccess('Cliente actualizado correctamente');
        } else {
          // Crear nuevo
          await API.post('/api/clients', editingClient.value);
          showSuccess('Cliente creado correctamente');
        }
        editingClient.value = null;
        loadClients();
      } catch (err) {
        console.error('Error guardando cliente:', err);
        showError('Error al guardar cambios: ' + (err.response?.data?.error || err.message));
      }
    };

    const deleteClient = async (client) => {
      if (!confirm(`¿Estás seguro de eliminar al cliente ${client.name}? Esta acción no se puede deshacer.`)) return;
      try {
        await API.delete(`/api/clients/${client.id}`);
        showSuccess('Cliente eliminado correctamente');
        loadClients();
      } catch (err) {
        console.error('Error eliminando cliente:', err);
        showError('Error al eliminar cliente: ' + (err.response?.data?.error || err.message));
      }
    };

    const closeModalOnSelf = (event, modalName) => {
      if (event.target === event.currentTarget) {
        if (modalName === 'showModal') showModal.value = false;
        if (modalName === 'showConfigModal') showConfigModal.value = false;
        if (modalName === 'tareaSeleccionada') tareaSeleccionada.value = null;
        if (modalName === 'showEditModal') showEditModal.value = false;
        if (modalName === 'showCompleteModal') closeCompleteModal();
        if (modalName === 'showClientManager') showClientManager.value = false;
        if (modalName === 'showUpdateModal') closeUpdateModal();
      }
    };

    return {
      user, tasks, users, labels, resumen, misTareas, filtroFecha, showModal,
      tareaSeleccionada, creandoTarea, loading, error, showEditModal, editTask,
      showDeleteConfirm, suggestedLabels, showDropdown, toggleDropdown, newTask,
      showConfigModal,
      nuevaEtiqueta, nuevoComentario, archivosAdjuntos, notificaciones,
      mostrarNotificaciones, commentAttachments, showNewLabelDropdown, showLabelDropdown,
      labelSearchTerm,
      notificacionesPendientes, selectedLabelsInNew, availableLabelsInNew,
      selectedLabelsInEdit, availableLabelsInEdit, tareasFiltradas,
      tareasPendientes, tareasEnCamino, tareasCompletadas, selectedUsersInNew,
      availableUsersInNew,
      selectedUsersInEdit,
      availableUsersInEdit,
      logout, cargarDatos, abrirModalEditar, guardarCambiosTarea,
      abrirConfirmarEliminar, eliminarTarea, esTareaParaHoy, esTareaVencida, crearTarea,
      toggleLabelInNew, resetForm, handleFileUpload, removeFile, crearEtiqueta,
      toggleLabelInEdit, cambiarEstadoTarea, verDetalles, handleCommentAttachment,
      removeCommentAttachment, removeCommentAttachmentFile, agregarComentario, getLabelsArray, toggleNotifications,
      marcarComoLeida, marcarTodasComoLeidas, eliminarNotificacion, formatDate,
      getColor, getPriorityText, getFileSize, downloadFile,
      setQuickDate, setQuickEditDate,
      moverACamino: (id, event) => {
        if (event) event.stopPropagation();
        cambiarEstadoTarea(id, 'en_camino');
      },
      hasClientInfo,
      addUserToNewTask,
      removeUserFromNewTask,
      addUserToEditTask,
      removeUserFromEditTask,
      puedeEditarTarea,
      puedeEliminarTarea,
      mostrandoSelectorCreador,
      nuevoCreadorId,
      // abrirSelectorDeCreador, // Si no existe, comentar o borrar. En el original estaba.
      // formatCommentContent, // En el original estaba.
      confirmarCambioDeCreador,
      showMentionList,
      filteredMentionUsers,
      handleCommentInput,
      selectMention,
      navigateMentions,
      selectMentionWithEnter,
      mentionNavIndex,
      closeModalOnSelf,
      showStateDropdown,
      toggleStateDropdown,
      avanzarEstado,
      formatDescription,
      retrocederEstado: (id, estadoAnterior, event) => {
        if (event) event.stopPropagation();
        cambiarEstadoTarea(id, estadoAnterior);
      },
      handleNotificationClick,
      archivosParaSubirEnEdicion,
      adjuntosParaBorrar,
      handleFileUploadEnEdicion,
      quitarDeLaListaDeSubida,
      marcarParaBorrar,
      showUpdateModal,
      closeUpdateModal,
      archivarTarea,
      APP_VERSION,
      showCompleteModal,
      taskToComplete,
      completionFile,
      closingNote,
      isCompleting,
      openCompleteModal,
      closeCompleteModal,
      handleCompletionFile,
      confirmCompletion,
      clientSearchTerm,
      suggestedClients,
      saveAsFrequent,
      handleClientSearch: searchClients,
      selectClient,
      toggleSaveAsFrequent,
      toggleSaveAsFrequent,
      downloadFile,
      senderConfig,
      handleLogoUpload,
      saveSenderConfig,
      printInternalLabel,
      printCourierLabel,
      getClientName,
      getClientPhone,
      getClientAddress,
      getClientReference,
      getGoogleMapsLink,
      hasClientData,
      // Gestión de Clientes
      showClientManager,
      managedClients,
      clientManagerSearch,
      editingClient,
      openClientManager,
      openCreateClient,
      loadClients,
      editClient,
      cancelEditClient,
      saveClientChanges,
      deleteClient,
      closeModalOnSelf,
      projects, selectedProjectId, showNewProjectModal, newProject, crearProyecto, cambiarProyecto, abrirNuevoProyecto
    };
  }
}).mount('#app');