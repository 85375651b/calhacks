import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listingSnapshot, snapshotKey, writeSession, readSession } from '../lib/planner/listingSnapshot';
export default function PlannerLink({ listing, compact = false, className = '' }) {
  const navigate = useNavigate(), location = useLocation();
  return <button className={'planner-link ' + className} aria-label={'Open 3D planner for ' + listing.address} onClick={e => {
    e.stopPropagation();
    const snapshot = listingSnapshot(listing);
    writeSession(snapshotKey(listing.id), snapshot);
    const search = readSession('propertylens.search');
    if (search) writeSession('propertylens.search', { ...search, selected: listing, scroll: window.scrollY });
    writeSession('propertylens.plannerReturn', { path: location.pathname, listing });
    navigate('/planner/' + encodeURIComponent(listing.id), { state: { snapshot } });
  }}>{compact ? '3D' : <><span aria-hidden="true">◇ </span>Open 3D room planner</>}</button>;
}
