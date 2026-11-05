export function paginate(items, requestedPage = 0, size = 50) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requestedPage) || 0));
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    pages,
    total: items.length,
    first: items.length ? page * size + 1 : 0,
    last: Math.min((page + 1) * size, items.length),
  };
}
