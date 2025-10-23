// /js/components/UpdateModal.js
const UpdateModal = {
  name: 'UpdateModal',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close'],
  data() {
    return {
      noMostrarMas: false
    }
  },
  methods: {
    handleClose() {
      if (this.noMostrarMas) {
        localStorage.setItem('ocultarModalActualizacion', 'true');
      }
      this.$emit('close');
    }
  },
  template: `
    <div class="modal" v-if="show" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <h2>
            <i class="fa-solid fa-rocket"></i>
            ¡Novedades en Operia!
          </h2>
          <button @click="handleClose" class="btn-close-modal">&times;</button>
        </div>
        
        <div class="modal-body">
          <p>Hemos lanzado una gran actualización con nuevas funciones y un diseño renovado:</p>
          
          <ul>
            <li>
              <i class="fa-solid fa-book-atlas"></i>
              <div>
                <strong>Nueva Biblioteca de Fichas Técnicas:</strong>
                <p>Accede a una nueva sección dedicada para subir, buscar y gestionar todas las fichas técnicas de productos en formato PDF.</p>
              </div>
            </li>
            
            <li>
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <div>
                <strong>Rediseño de Interfaz y Navegación:</strong>
                <p>Hemos unificado el header y mejorado el diseño general de la aplicación para una experiencia más limpia y profesional.</p>
              </div>
            </li>
            
            <li>
              <i class="fa-solid fa-clipboard-check"></i>
              <div>
                <strong>Finalización de Tareas Mejorada:</strong>
                <p>Ahora puedes adjuntar un archivo como comprobante y añadir una nota de cierre al finalizar una tarea.</p>
              </div>
            </li>
            
            <li>
              <i class="fa-solid fa-at"></i>
              <div>
                <strong>Menciones en Comentarios:</strong>
                <p>Etiqueta a tus compañeros usando "@Nombre" para enviarles una notificación directa.</p>
              </div>
            </li>
          </ul>
          
          <p style="margin-top: 8px; color: #4A5568; font-size: 14px;">¡Esperamos que estas mejoras te sean de gran utilidad!</p>
        </div>
        
        <div class="modal-footer">
          <label>
            <input type="checkbox" v-model="noMostrarMas" />
            No volver a mostrar
          </label>
          <button @click="handleClose">
            <i class="fa-solid fa-check"></i>
            Entendido
          </button>
        </div>
      </div>
    </div>
  `
};
