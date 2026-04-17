// ---------------------------------------------------------------------------
// Claw AI — Workspace Data Access Layer
// Reminders, Todos, Contacts — stored in Supabase via raw pg Pool
// Pattern matches existing A2A task handling in tools.ts
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-enable @typescript-eslint/no-require-imports */

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  return new Pool({ connectionString });
}

// ===========================================================================
// REMINDERS
// ===========================================================================

interface ReminderData {
  title: string;
  description?: string;
  reminder_time: string;
  priority?: string;
  repeat_config?: object;
  assigned_agent?: string;
  context?: object;
}

interface ReminderUpdate {
  title?: string;
  description?: string;
  reminder_time?: string;
  status?: string;
  priority?: string;
  repeat_config?: object;
  assigned_agent?: string;
  context?: object;
}

export async function createReminder(data: ReminderData) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `INSERT INTO reminders (title, description, reminder_time, priority, repeat_config, assigned_agent, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.title,
        data.description || "",
        data.reminder_time,
        data.priority || "normal",
        JSON.stringify(data.repeat_config || {}),
        data.assigned_agent || null,
        JSON.stringify(data.context || {}),
      ],
    );
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

export async function listReminders(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
}) {
  const pool = getPool();
  try {
    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(filters.priority);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;

    const result = await pool.query(
      `SELECT * FROM reminders ${where} ORDER BY reminder_time ASC LIMIT $${paramIdx}`,
      [...params, limit],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function getReminder(id: number) {
  const pool = getPool();
  try {
    const result = await pool.query(`SELECT * FROM reminders WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function updateReminder(id: number, updates: ReminderUpdate) {
  const pool = getPool();
  try {
    const fields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    const allowedFields: (keyof ReminderUpdate)[] = [
      "title", "description", "reminder_time", "status", "priority",
      "repeat_config", "assigned_agent", "context",
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        const val = updates[field];
        params.push(typeof val === "object" ? JSON.stringify(val) : val);
      }
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE reminders SET ${fields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function deleteReminder(id: number) {
  const pool = getPool();
  try {
    await pool.query(`DELETE FROM reminders WHERE id = $1`, [id]);
    return { deleted: true, id };
  } finally {
    await pool.end();
  }
}

export async function getDueReminders() {
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT * FROM reminders
       WHERE reminder_time <= NOW() AND status = 'pending'
       ORDER BY priority ASC, reminder_time ASC
       LIMIT 20`,
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function markReminderFired(id: number) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE reminders SET status = 'fired', fired_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

// ===========================================================================
// TODOS
// ===========================================================================

interface TodoData {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  due_time?: string;
  category?: string;
  tags?: string[];
  assigned_agent?: string;
  context?: object;
}

interface TodoUpdate {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  due_time?: string;
  category?: string;
  tags?: string[];
  assigned_agent?: string;
  context?: object;
}

export async function createTodo(data: TodoData) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `INSERT INTO todos (title, description, priority, due_date, due_time, category, tags, assigned_agent, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.title,
        data.description || "",
        data.priority || "medium",
        data.due_date || null,
        data.due_time || null,
        data.category || "general",
        data.tags || [],
        data.assigned_agent || null,
        JSON.stringify(data.context || {}),
      ],
    );
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

export async function listTodos(filters?: {
  status?: string;
  priority?: string;
  category?: string;
  tag?: string;
  assigned_agent?: string;
  limit?: number;
}) {
  const pool = getPool();
  try {
    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(filters.priority);
    }
    if (filters?.category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(filters.category);
    }
    if (filters?.tag) {
      conditions.push(`$${paramIdx} = ANY(tags)`);
      params.push(filters.tag);
      paramIdx++;
    }
    if (filters?.assigned_agent) {
      conditions.push(`assigned_agent = $${paramIdx++}`);
      params.push(filters.assigned_agent);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;

    const result = await pool.query(
      `SELECT * FROM todos ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
      [...params, limit],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function getTodo(id: number) {
  const pool = getPool();
  try {
    const result = await pool.query(`SELECT * FROM todos WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function updateTodo(id: number, updates: TodoUpdate) {
  const pool = getPool();
  try {
    const fields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    const allowedFields: (keyof TodoUpdate)[] = [
      "title", "description", "status", "priority",
      "due_date", "due_time", "category", "tags",
      "assigned_agent", "context",
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const val = updates[field];
        if (field === "tags" && Array.isArray(val)) {
          fields.push(`tags = $${paramIdx++}`);
          params.push(val);
        } else if (typeof val === "object" && val !== null) {
          fields.push(`${field} = $${paramIdx++}`);
          params.push(JSON.stringify(val));
        } else {
          fields.push(`${field} = $${paramIdx++}`);
          params.push(val);
        }
      }
    }

    // If status is changing to 'done', set completed_at
    if (updates.status === "done") {
      fields.push(`completed_at = NOW()`);
    } else if (updates.status && updates.status !== "done") {
      fields.push(`completed_at = NULL`);
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE todos SET ${fields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function deleteTodo(id: number) {
  const pool = getPool();
  try {
    await pool.query(`DELETE FROM todos WHERE id = $1`, [id]);
    return { deleted: true, id };
  } finally {
    await pool.end();
  }
}

export async function getTodoStats() {
  const pool = getPool();
  try {
    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM todos GROUP BY status ORDER BY status`,
    );
    const priorityResult = await pool.query(
      `SELECT priority, COUNT(*) as count FROM todos GROUP BY priority ORDER BY priority`,
    );
    const overdueResult = await pool.query(
      `SELECT COUNT(*) as count FROM todos
       WHERE status NOT IN ('done', 'archived')
         AND due_date IS NOT NULL
         AND due_date < CURRENT_DATE`,
    );
    const totalResult = await pool.query(
      `SELECT COUNT(*) as count FROM todos`,
    );

    const statusMap: Record<string, number> = {};
    for (const row of statusResult.rows) {
      statusMap[row.status] = parseInt(row.count, 10);
    }

    const priorityMap: Record<string, number> = {};
    for (const row of priorityResult.rows) {
      priorityMap[row.priority] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(totalResult.rows[0].count, 10),
      by_status: statusMap,
      by_priority: priorityMap,
      overdue: parseInt(overdueResult.rows[0].count, 10),
    };
  } finally {
    await pool.end();
  }
}

// ===========================================================================
// CONTACTS
// ===========================================================================

interface ContactData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  context?: object;
  is_vip?: boolean;
  frequency?: string;
}

interface ContactUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  context?: object;
  is_vip?: boolean;
  frequency?: string;
}

export async function createContact(data: ContactData) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `INSERT INTO contacts (first_name, last_name, email, phone, company, role, notes, tags, context, is_vip, frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.first_name || null,
        data.last_name || null,
        data.email || null,
        data.phone || null,
        data.company || null,
        data.role || null,
        data.notes || "",
        data.tags || [],
        JSON.stringify(data.context || {}),
        data.is_vip || false,
        data.frequency || "occasional",
      ],
    );
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

export async function listContacts(filters?: {
  tag?: string;
  company?: string;
  is_vip?: boolean;
  search?: string;
  limit?: number;
}) {
  const pool = getPool();
  try {
    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.tag) {
      conditions.push(`$${paramIdx} = ANY(tags)`);
      params.push(filters.tag);
      paramIdx++;
    }
    if (filters?.company) {
      conditions.push(`company ILIKE $${paramIdx}`);
      params.push(`%${filters.company}%`);
      paramIdx++;
    }
    if (filters?.is_vip !== undefined) {
      conditions.push(`is_vip = $${paramIdx}`);
      params.push(filters.is_vip);
      paramIdx++;
    }
    if (filters?.search) {
      conditions.push(
        `(first_name ILIKE $${paramIdx} OR last_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR company ILIKE $${paramIdx})`,
      );
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;

    const result = await pool.query(
      `SELECT * FROM contacts ${where} ORDER BY last_interaction DESC NULLS LAST, created_at DESC LIMIT $${paramIdx}`,
      [...params, limit],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function getContact(id: number) {
  const pool = getPool();
  try {
    const result = await pool.query(`SELECT * FROM contacts WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function updateContact(id: number, updates: ContactUpdate) {
  const pool = getPool();
  try {
    const fields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [];
    let paramIdx = 1;

    const allowedFields: (keyof ContactUpdate)[] = [
      "first_name", "last_name", "email", "phone", "company", "role",
      "notes", "tags", "context", "is_vip", "frequency",
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const val = updates[field];
        if (field === "tags" && Array.isArray(val)) {
          fields.push(`tags = $${paramIdx++}`);
          params.push(val);
        } else if (typeof val === "object" && val !== null) {
          fields.push(`${field} = $${paramIdx++}`);
          params.push(JSON.stringify(val));
        } else {
          fields.push(`${field} = $${paramIdx++}`);
          params.push(val);
        }
      }
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE contacts SET ${fields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

export async function deleteContact(id: number) {
  const pool = getPool();
  try {
    await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
    return { deleted: true, id };
  } finally {
    await pool.end();
  }
}

export async function searchContacts(query: string) {
  const pool = getPool();
  try {
    const searchPattern = `%${query}%`;
    const result = await pool.query(
      `SELECT * FROM contacts
       WHERE first_name ILIKE $1
          OR last_name ILIKE $1
          OR email ILIKE $1
          OR company ILIKE $1
          OR notes ILIKE $1
       ORDER BY
         CASE
           WHEN email ILIKE $1 THEN 1
           WHEN first_name ILIKE $1 OR last_name ILIKE $1 THEN 2
           WHEN company ILIKE $1 THEN 3
           ELSE 4
         END,
         last_interaction DESC NULLS LAST
       LIMIT 20`,
      [searchPattern],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function recordInteraction(id: number) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE contacts
       SET interaction_count = interaction_count + 1,
           last_interaction = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}
