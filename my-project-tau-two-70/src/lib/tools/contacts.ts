// ---------------------------------------------------------------------------
// Contact Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  createContact, listContacts, getContact, updateContact, deleteContact, searchContacts } from "./shared";

// Workspace Tools — Contacts (address book / CRM)
// ---------------------------------------------------------------------------

export const contactCreateTool = tool({
  description: "Create a contact in the workspace address book. Use this to save information about people — clients, colleagues, partners, vendors. Supports company, role, notes, tags, VIP flag, and relationship frequency tracking.",
  inputSchema: zodSchema(z.object({
    first_name: z.string().optional().describe("Contact first name"),
    last_name: z.string().optional().describe("Contact last name"),
    email: z.string().optional().describe("Email address (must be unique)"),
    phone: z.string().optional().describe("Phone number"),
    company: z.string().optional().describe("Company/organization name"),
    role: z.string().optional().describe("Job title or role"),
    notes: z.string().optional().describe("Notes about this contact (background, preferences, history)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization (e.g., ['client', 'engineering', 'sf-bay'])"),
    is_vip: z.boolean().optional().describe("Mark as VIP contact (default: false)"),
    frequency: z.enum(["never", "rare", "occasional", "regular", "frequent", "vip"]).optional().describe("Interaction frequency (default: 'occasional')"),
  })),
  execute: safeJson(async ({ first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency }) => {
    return await createContact({ first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency });
  }),
});

export const contactListTool = tool({
  description: "List contacts with optional filters. Use this to browse the address book, find contacts by company, filter VIPs, or search by tag. Returns contacts ordered by last interaction (most recent first).",
  inputSchema: zodSchema(z.object({
    tag: z.string().optional().describe("Filter by tag"),
    company: z.string().optional().describe("Filter by company (partial match)"),
    is_vip: z.boolean().optional().describe("Filter VIP contacts"),
    search: z.string().optional().describe("Search across name, email, and company (partial match)"),
    limit: z.number().optional().describe("Max results (default: 50)"),
  })),
  execute: safeJson(async ({ tag, company, is_vip, search, limit }) => {
    return await listContacts({ tag, company, is_vip, search, limit });
  }),
});

export const contactSearchTool = tool({
  description: "Search contacts across all fields — first name, last name, email, company, and notes. Returns ranked results with email matches first, then name matches, then company matches. Use this when the user asks 'do I have a contact for...' or 'find info about [person/company]'.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — searches across name, email, company, and notes"),
  })),
  execute: safeJson(async ({ query }) => {
    return await searchContacts(query);
  }),
});

export const contactUpdateTool = tool({
  description: "Update a contact's information. Use this to edit contact details, add notes, change tags, update company/role, or toggle VIP status.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Contact ID to update"),
    first_name: z.string().optional().describe("New first name"),
    last_name: z.string().optional().describe("New last name"),
    email: z.string().optional().describe("New email address"),
    phone: z.string().optional().describe("New phone number"),
    company: z.string().optional().describe("New company"),
    role: z.string().optional().describe("New job title/role"),
    notes: z.string().optional().describe("New notes"),
    tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
    is_vip: z.boolean().optional().describe("VIP status"),
    frequency: z.enum(["never", "rare", "occasional", "regular", "frequent", "vip"]).optional().describe("Interaction frequency"),
  })),
  execute: safeJson(async ({ id, first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency }) => {
    const contact = await getContact(id);
    if (!contact) throw new Error(`Contact ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (role !== undefined) updates.role = role;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;
    if (is_vip !== undefined) updates.is_vip = is_vip;
    if (frequency !== undefined) updates.frequency = frequency;
    return await updateContact(id, updates);
  }),
});

export const contactDeleteTool = tool({
  description: "Delete a contact permanently from the address book.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Contact ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteContact(id);
  }),
});

// ---------------------------------------------------------------------------

