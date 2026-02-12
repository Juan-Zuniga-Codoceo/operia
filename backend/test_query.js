const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

const sql = `
  SELECT 
    t.*, 
    u.name as created_by_name,
    ur.name as responsible_user_name,
    ur.id as responsible_user_id,
    uo.name as observer_user_name,
    GROUP_CONCAT(DISTINCT ua.name) as assigned_names,
    GROUP_CONCAT(DISTINCT ta.user_id) as assigned_ids,
    GROUP_CONCAT(DISTINCT l.name) as label_names,
    GROUP_CONCAT(
      CASE
        WHEN att.id IS NOT NULL THEN
          att.id || ':' || att.file_name || ':' || att.file_path
        ELSE
          NULL
      END
    ) as attachments_data
  FROM tasks t
  LEFT JOIN users u ON t.created_by = u.id
  LEFT JOIN users ur ON t.responsible_user_id = ur.id
  LEFT JOIN users uo ON t.observer_user_id = uo.id
  LEFT JOIN task_assignments ta ON t.id = ta.task_id
  LEFT JOIN users ua ON ta.user_id = ua.id
  LEFT JOIN task_labels tl ON t.id = tl.task_id
  LEFT JOIN labels l ON tl.label_id = l.id
  LEFT JOIN attachments att ON t.id = att.task_id AND att.comment_id IS NULL
  WHERE t.is_archived = 0 
  GROUP BY t.id 
  ORDER BY 
    CASE t.priority 
      WHEN 'alta' THEN 1 
      WHEN 'media' THEN 2 
      WHEN 'baja' THEN 3 
      ELSE 4 
    END ASC, 
    t.due_date ASC
  LIMIT 1
`;

db.all(sql, [], (err, tasks) => {
    if (err) {
        console.error('❌ SQL Error:', err.message);
        console.error('Full error:', err);
    } else {
        console.log('✅ Query successful!');
        console.log('First task:', JSON.stringify(tasks[0], null, 2));
    }
    db.close();
});
