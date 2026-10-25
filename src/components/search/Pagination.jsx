import React, { useState } from 'react';

export function usePagination(listings) {
  const key = JSON.stringify(listings.map(p => p.id));
  const [selection, setSelection] = useState({ key, page: 1 });
  const pageCount = Math.max(1, Math.ceil(listings.length / 9));
  const page = selection.key === key ? Math.min(selection.page, pageCount) : 1;
  return {
    items: listings.slice((page - 1) * 9, page * 9),
    page,
    pageCount,
    total: listings.length,
    onPage: next => setSelection({ key, page: Math.max(1, Math.min(next, pageCount)) }),
  };
}

export default function Pagination({ page, pageCount, total, onPage }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="listing-pagination" aria-label="Homes pagination">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span role="status" aria-live="polite">
        Page {page} of {pageCount} · Homes {(page - 1) * 9 + 1}–{Math.min(page * 9, total)} of {total}
      </span>
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
