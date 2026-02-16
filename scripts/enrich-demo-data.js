require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const uploadsDir = process.env.RENDER_UPLOADS_PATH || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

async function enrichDemoData() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('📦 1. Preparando archivo PDF de demostración...');
        const sourcePdf = path.join(__dirname, '..', 'frontend', 'assets', 'cotizacion_borrador.pdf');

        if (!fs.existsSync(sourcePdf)) {
            console.warn('⚠️  Archivo PDF no encontrado, saltando adjuntos');
        } else {
            const pdfStats = fs.statSync(sourcePdf);
            console.log(`   ✓ PDF encontrado (${(pdfStats.size / 1024).toFixed(1)} KB)`);
        }

        // Get demo users and tasks
        const usersRes = await client.query('SELECT id, name, email FROM users WHERE tenant_id = 1 ORDER BY id LIMIT 10');
        const users = usersRes.rows;

        const tasksRes = await client.query('SELECT id, title, created_by FROM tasks WHERE tenant_id = 1 AND is_archived = false ORDER BY id LIMIT 10');
        const tasks = tasksRes.rows;

        console.log(`\n👥 Usuarios disponibles: ${users.length}`);
        console.log(`📋 Tareas disponibles: ${tasks.length}`);

        // 2. Update some tasks with responsible and observer users
        console.log('\n🎯 2. Asignando responsables y observadores...');
        let responsibleCount = 0;
        for (let i = 0; i < Math.min(5, tasks.length); i++) {
            const task = tasks[i];
            const responsible = users[(i + 1) % users.length];
            const observer = users[(i + 2) % users.length];

            await client.query(
                'UPDATE tasks SET responsible_user_id = $1, observer_user_id = $2 WHERE id = $3',
                [responsible.id, observer.id, task.id]
            );
            responsibleCount++;
            console.log(`   ✓ Tarea "${task.title.substring(0, 30)}..." → Responsable: ${responsible.name}, Observador: ${observer.name}`);
        }

        // 3. Add comments with mentions to some tasks
        console.log('\n💬 3. Agregando comentarios con menciones...');
        const commentTemplates = [
            (user1, user2) => `@${user1.name} ¿puedes revisar esto con @${user2.name}? Necesitamos coordinar la entrega.`,
            (user1, user2) => `Hola @${user1.name}, dejé los documentos en recepción. @${user2.name} ya fue notificado.`,
            (user1, user2) => `@${user1.name} - actualización: el cliente confirmó. CC: @${user2.name}`,
            (user1, user2) => `Coordinando con @${user1.name} para la reunión del viernes. @${user2.name}, ¿confirmas asistencia?`,
            (user1) => `@${user1.name} - Adjunto cotización actualizada para tu revisión.`,
        ];

        let commentCount = 0;
        for (let i = 0; i < Math.min(5, tasks.length); i++) {
            const task = tasks[i];
            const commentUser = users[i % users.length];
            const mentioned1 = users[(i + 1) % users.length];
            const mentioned2 = users[(i + 2) % users.length];

            const template = commentTemplates[i % commentTemplates.length];
            const commentText = template(mentioned1, mentioned2);

            const commentRes = await client.query(
                'INSERT INTO comments (task_id, autor_id, contenido, fecha_creacion) VALUES ($1, $2, $3, NOW() - INTERVAL \'2 days\') RETURNING id',
                [task.id, commentUser.id, commentText]
            );
            commentCount++;
            console.log(`   ✓ Comentario en "${task.title.substring(0, 30)}..." por ${commentUser.name}`);
        }

        // 4. Add file attachments to tasks
        if (fs.existsSync(sourcePdf)) {
            console.log('\n📎 4. Agregando archivos adjuntos a tareas...');
            let attachCount = 0;

            for (let i = 0; i < Math.min(3, tasks.length); i++) {
                const task = tasks[i];
                const uploader = users[i % users.length];

                // Copy PDF to uploads with unique name
                const uniqueName = `${Date.now()}-${i}-cotizacion_borrador.pdf`;
                const destPath = path.join(uploadsDir, uniqueName);
                fs.copyFileSync(sourcePdf, destPath);

                await client.query(
                    'INSERT INTO attachments (task_id, file_name, file_path) VALUES ($1, $2, $3)',
                    [task.id, 'cotizacion_borrador.pdf', uniqueName]
                );
                attachCount++;
                console.log(`   ✓ PDF adjunto a "${task.title.substring(0, 30)}..."`);
            }
        }

        // 5. Add file attachments to comments
        if (fs.existsSync(sourcePdf)) {
            console.log('\n📎 5. Agregando archivos adjuntos a comentarios...');
            const commentsRes = await client.query(
                'SELECT id, task_id FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = 1 AND is_archived = false) ORDER BY id LIMIT 3'
            );

            for (let i = 0; i < commentsRes.rows.length; i++) {
                const comment = commentsRes.rows[i];
                const uploader = users[i % users.length];

                // Copy PDF to uploads with unique name
                const uniqueName = `${Date.now()}-comment-${i}-cotizacion_borrador.pdf`;
                const destPath = path.join(uploadsDir, uniqueName);
                fs.copyFileSync(sourcePdf, destPath);

                await client.query(
                    'INSERT INTO attachments (task_id, comment_id, file_name, file_path) VALUES ($1, $2, $3, $4)',
                    [comment.task_id, comment.id, 'cotizacion_borrador.pdf', uniqueName]
                );
                console.log(`   ✓ PDF adjunto a comentario #${comment.id}`);
            }
        }

        await client.query('COMMIT');

        console.log('\n✅ Datos demo enriquecidos exitosamente!');
        console.log(`   - ${responsibleCount} tareas con responsables/observadores`);
        console.log(`   - ${commentCount} comentarios con menciones agregados`);
        if (fs.existsSync(sourcePdf)) {
            console.log(`   - Archivos PDF adjuntados a tareas y comentarios`);
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', err);
        throw err;
    } finally {
        client.release();
        pool.end();
    }
}

enrichDemoData();
