// backend/jobs/in-app-jobs.js (Hora ajustada)
const schedule = require('node-schedule');
const { sendDailySummaries } = require('./daily-summary');
const { processExpiredTrials } = require('./trial-expiration');

const initScheduledJobs = () => {
  console.log('🕒 Programando tareas internas...');

  // 1. Resúmenes diarios: Cambiamos la hora a las 10:00 UTC (7:00 AM en Chile UTC-3)
  schedule.scheduleJob('0 10 * * *', () => {
    console.log('⏰ ¡Hora de enviar los resúmenes diarios! (7:00 AM Chile)');
    sendDailySummaries().catch(error => {
      console.error('❌ Error durante los resúmenes diarios:', error);
    });
  });

  // 2. Expiración de Trials: Se ejecuta todos los días a las 05:00 UTC (2:00 AM Chile)
  schedule.scheduleJob('0 5 * * *', () => {
    console.log('⏰ ¡Hora de revisar suscripciones vencidas! (2:00 AM Chile)');
    processExpiredTrials().catch(error => {
      console.error('❌ Error durante la revisión de suscripciones:', error);
    });
  });

  console.log('✅ Tareas programadas: Resúmenes (10:00 UTC) y Expiración Trials (05:00 UTC).');
};

module.exports = { initScheduledJobs };