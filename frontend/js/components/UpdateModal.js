window.UpdateModal = {
  props: {
    show: Boolean
  },
  emits: ['close'],
  setup(props, { emit }) {
    const noMostrarMas = Vue.ref(false);

    const closeModal = () => {
      emit('close', noMostrarMas.value);
    };

    return {
      noMostrarMas,
      closeModal
    };
  },
  template: `
    <div class="modal" v-if="show">
      <div class="modal-content" style="max-width: 550px;">
        <div class="update-modal-header">
          <i class="fa-solid fa-rocket"></i>
          <h2>¡Nuevas Funciones en Operia!</h2>
        </div>
        
        <div class="modal-body">
          <p>Hemos lanzado una actualización centrada en los roles y en la gestión de las Fichas Técnicas:</p>
          <ul class="update-list">
            
            <li class="highlight-update"> 
              <strong><i class="fa-solid fa-address-book"></i> Gestión de Clientes Frecuentes</strong>
              <span class="update-description">Guarda tus clientes habituales y reutiliza sus datos para crear tareas mucho más rápido. ¡Adiós a escribir lo mismo una y otra vez!</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-user-plus"></i> Nuevo Formulario de Clientes</strong>
              <span class="update-description">Ahora puedes agregar clientes manualmente desde un formulario dedicado, facilitando la gestión de tu base de datos.</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-print"></i> Impresión de Etiquetas</strong>
              <span class="update-description">Genera etiquetas de envío (Internas y Courier) listas para imprimir directamente desde el detalle de la tarea.</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-book-atlas"></i> Mejoras en Fichas Técnicas</strong>
              <span class="update-description">Ahora con campo <strong>SKU</strong>, edición rápida de datos y un nuevo botón de <strong>Vista Previa</strong> para ver PDFs sin descargar.</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-box-archive"></i> Historial de Archivadas</strong>
              <span class="update-description">Nueva sección para consultar tareas antiguas y restaurarlas si es necesario.</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-map-location-dot"></i> Google Maps Integrado</strong>
              <span class="update-description">Las direcciones ahora son enlaces inteligentes que te llevan directo al mapa.</span>
            </li>
        
            <li>
              <strong><i class="fa-solid fa-sliders"></i> Mayor Control de Tareas</strong>
              <span class="update-description">Botones para "Regresar" estados, mejor visualización de responsables/observadores y correcciones visuales generales.</span>
            </li>

          </ul>
          <p>¡Esperamos que estas mejoras te sean de gran utilidad!</p>
        </div>
        
        <div class="modal-footer">
          <div class="dont-show-again">
            <input type="checkbox" id="no-mostrar-mas" v-model="noMostrarMas">
            <label for="no-mostrar-mas">No volver a mostrar</label>
          </div>
          <button @click="closeModal" class="btn-create">
            <i class="fa-solid fa-check"></i> Entendido
          </button>
        </div>
      </div>
    </div>
  `
};