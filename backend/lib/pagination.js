// lib/pagination.js — opt-in pagination/filtering for list endpoints.
//
// Backward-compatible by design: if the caller doesn't pass ?page or
// ?pageSize, paginate() returns the full array exactly as before (same
// shape the existing web portals already expect), so nothing already
// working breaks. Mobile clients (or anyone else) can opt into paging by
// passing query params.
function paginate(items, query = {}) {
  const hasPaging = query.page !== undefined || query.pageSize !== undefined;
  if (!hasPaging) return { items, paginated: false };

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    paginated: true,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
  };
}

// Simple case-insensitive substring filter across a set of fields — used for
// the admin "advanced search" boxes (clients, tickets, staff).
function textFilter(items, searchTerm, fields) {
  if (!searchTerm) return items;
  const q = String(searchTerm).toLowerCase();
  return items.filter((item) => fields.some((f) => String(item[f] || "").toLowerCase().includes(q)));
}

module.exports = { paginate, textFilter };