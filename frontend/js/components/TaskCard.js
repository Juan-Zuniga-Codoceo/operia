import {
    formatDate, esTareaParaHoy, esTareaVencida, hasClientData,
    hasClientInfo, getGoogleMapsLink, getLabelsArray, getColor
} from '../utils/helpers.js';

export default {
    props: {
        task: {
            type: Object,
            required: true
        },
        columnType: {
            type: String, // 'pendiente', 'en_camino', 'completada'
            required: true
        }
    },
    emits: ['details', 'advance', 'rewind', 'complete'],
    setup(props, { emit }) {
        return {
            formatDate, esTareaParaHoy, esTareaVencida, hasClientData,
            hasClientInfo, getGoogleMapsLink, getLabelsArray, getColor
        };
    },
    template: `
    <div class="task-card" :class="[
      {'vence-hoy': esTareaParaHoy(task.due_date), 'vencida': esTareaVencida(task.due_date, task.title)},
      {'completed': columnType === 'completada'}
    ]" :data-task-id="task.id" @click="$emit('details', task)">
      
      <div class="task-header-badges">
        <span v-if="task.human_id" class="id-badge">{{ task.human_id }}</span>
        <span v-if="hasClientData(task) && task.shipping_type" class="courier-badge">
          <i class="fa-solid fa-truck-fast"></i> {{ task.shipping_type }}
        </span>
        <span v-else-if="!hasClientData(task)" class="courier-badge internal-badge">
          <i class="fa-solid fa-building-user"></i> Tarea Interna
        </span>
      </div>
      
      <h3>{{ task.title }}</h3>
      
      <!-- Bloque Cliente -->
      <div v-if="hasClientInfo(task.client_snapshot)" class="client-info-block" style="background: #f8f9fa; padding: 5px; font-size: 0.85em; margin-top: 5px; border-radius: 4px; color: #333;">
        <div v-if="typeof task.client_snapshot === 'string'">
          <strong>👤 {{ JSON.parse(task.client_snapshot).name }}</strong><br>
          📞 {{ JSON.parse(task.client_snapshot).phone || 'S/N' }}<br>
          📍 {{ JSON.parse(task.client_snapshot).address_street || '' }} {{ JSON.parse(task.client_snapshot).commune || '' }}
        </div>
        <div v-else>
          <strong>👤 {{ task.client_snapshot.name }}</strong><br>
          📞 {{ task.client_snapshot.phone || 'S/N' }}<br>
          📍 {{ task.client_snapshot.address_street || '' }} {{ task.client_snapshot.commune || '' }}
        </div>
      </div>
      
      <p>{{ task.description }}</p>
      
      <div class="task-meta">
        <span class="due-date" v-if="columnType !== 'completada'">
          <i class="fa-regular fa-calendar"></i> {{ formatDate(task.due_date) }}
        </span>
        <small v-else>Completado el {{ formatDate(task.completed_at) }}</small>
        
        <div class="labels" v-if="columnType !== 'completada'">
          <span v-for="label in getLabelsArray(task)" :key="label" class="label-tag" :style="{ backgroundColor: getColor(label) }">{{ label }}</span>
        </div>
      </div>
      
      <div class="task-footer">
        <span class="assigned-to" title="Observadores">
          <i class="fa-solid fa-users-viewfinder"></i> {{ task.assigned_names || 'Sin observadores' }}
        </span>
        
        <span class="responsible-user" v-if="task.responsible_user_name && columnType !== 'completada'" :title="'Responsable: ' + task.responsible_user_name">
          <i class="fa-solid fa-user-shield"></i> {{ task.responsible_user_name.split(' ')[0] }}
        </span>

        <!-- Botones Dinámicos Moviendo Lógica hacia Arriba Emits -->
        <button v-if="columnType === 'pendiente'" @click.stop="$emit('advance', task)" class="btn-action">
          En Camino <i class="fa-solid fa-arrow-right"></i>
        </button>

        <button v-if="columnType === 'en_camino'" @click.stop="$emit('rewind', task)" class="btn-action secondary" style="margin-right: 5px;">
          <i class="fa-solid fa-arrow-left"></i> Regresar
        </button>
        <button v-if="columnType === 'en_camino'" @click.stop="$emit('complete', task)" class="btn-action green">
          Completar <i class="fa-solid fa-check"></i>
        </button>

        <button v-if="columnType === 'completada'" @click.stop="$emit('rewind', task)" class="btn-action secondary" style="margin-left: auto;">
          <i class="fa-solid fa-arrow-left"></i> Regresar
        </button>
      </div>
    </div>
  `
};
