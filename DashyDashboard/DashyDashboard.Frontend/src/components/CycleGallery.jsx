import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Stamp, Skeleton, SegmentedControl, SectionHeader, EmptyState, Button } from './ui.jsx';
import { getScreenshotThumbUrl } from '../api/attestations.js';
import { getCycleScreenshots, reviewScreenshot } from '../api/manager.js';
import FullScreenOverlay from './FullScreenOverlay.jsx';
import Lightbox from './Lightbox.jsx';

const STATUS_STAMP = {
  Pending:  { tone: 'warning', label: 'PENDING' },
  Approved: { tone: 'success', label: 'APPROVED' },
  Rejected: { tone: 'danger',  label: 'REJECTED' },
};

const STATUS_RANK = { Pending: 0, Rejected: 1, Approved: 2 };

function stampFor(status) {
  if (!status) return null;
  return STATUS_STAMP[status] ?? { tone: 'neutral', label: String(status).toUpperCase() };
}

/**
 * One thumbnail tile: lazily-fetched thumbnail + tool name + status stamp. Clicking opens
 * the shared Lightbox at this item's index within the currently-filtered set.
 */
function GalleryTile({ cycleId, item, onOpen }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);

  const cacheKey = `${cycleId}/${item.associateId}/${item.clientId}/${item.toolId}/${item.screenshotStatus ?? ''}/${item.screenshotUploadedAt ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    setThumbUrl(null);
    setThumbLoading(true);
    getScreenshotThumbUrl(cycleId, item.associateId, item.clientId, item.toolId)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setThumbUrl(url);
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null);
      })
      .finally(() => {
        if (!cancelled) setThumbLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const stamp = stampFor(item.screenshotStatus);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`View ${item.toolName} screenshot full size`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10, textAlign: 'left',
        borderRadius: 'var(--radius-card)', border: '1px solid var(--border-subtle)', background: 'var(--surface)',
        cursor: 'zoom-in', fontFamily: 'inherit',
      }}
      title="Click to view full size"
    >
      <div style={{
        width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)', overflow: 'hidden',
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={`${item.toolName} screenshot`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : thumbLoading ? (
          <Skeleton width="100%" height="100%" radius={0} />
        ) : (
          <Icon name="image" size={20} style={{ color: 'var(--text-faint)', opacity: 0.5 }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.toolName}
        </div>
        {stamp && <Stamp tone={stamp.tone} label={stamp.label} />}
      </div>

      {item.screenshotStatus === 'Rejected' && item.screenshotRejectReason && (
        <div style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.4 }}>{item.screenshotRejectReason}</div>
      )}
    </button>
  );
}

/**
 * WI-9 — in-app screenshot gallery for a cycle. Fetches the scoped listing (same scope as
 * the screenshots.zip endpoint), groups by member then client, and offers All/Pending/
 * Approved/Rejected filter chips with counts. Clicking a tile opens the shared Lightbox over
 * the currently-filtered flat set, with review enabled (server authorizes per-member).
 *
 * Restyled to "The Ledger": SegmentedControl filter, skeleton thumbs, mono labels, stamps.
 *
 * Props: { cycleId, cycleName, onClose, onReviewed }
 */
export default function CycleGallery({ cycleId, cycleName, onClose, onReviewed }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [lightbox, setLightbox] = useState(null);

  const load = () => {
    if (!cycleId) return;
    setLoading(true);
    setError(null);
    getCycleScreenshots(cycleId)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Could not load screenshots.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      All: all.length,
      Pending: all.filter((i) => i.screenshotStatus === 'Pending').length,
      Approved: all.filter((i) => i.screenshotStatus === 'Approved').length,
      Rejected: all.filter((i) => i.screenshotStatus === 'Rejected').length,
    };
  }, [items]);

  const filterOptions = useMemo(() => ([
    { id: 'All', label: `All (${counts.All})` },
    { id: 'Pending', label: `Pending (${counts.Pending})` },
    { id: 'Rejected', label: `Rejected (${counts.Rejected})` },
    { id: 'Approved', label: `Approved (${counts.Approved})` },
  ]), [counts]);

  // The flat, currently-filtered set — drives both the grid and the Lightbox navigation.
  const filteredItems = useMemo(() => {
    const all = items ?? [];
    if (filter === 'All') return all;
    return all.filter((i) => i.screenshotStatus === filter);
  }, [items, filter]);

  // Group the filtered set by member, then by client, preserving the server's sort order.
  const groups = useMemo(() => {
    const byMember = new Map();
    for (const item of filteredItems) {
      let member = byMember.get(item.associateId);
      if (!member) {
        member = { associateId: item.associateId, associateName: item.associateName, clients: new Map() };
        byMember.set(item.associateId, member);
      }
      let client = member.clients.get(item.clientId);
      if (!client) {
        client = { clientId: item.clientId, clientName: item.clientName, items: [] };
        member.clients.set(item.clientId, client);
      }
      client.items.push(item);
    }
    return Array.from(byMember.values()).map((m) => ({
      ...m,
      clients: Array.from(m.clients.values()).map((c) => ({
        ...c,
        items: c.items.slice().sort((a, b) => (STATUS_RANK[a.screenshotStatus] ?? 8) - (STATUS_RANK[b.screenshotStatus] ?? 8)),
      })),
    }));
  }, [filteredItems]);

  const lightboxItems = useMemo(() => filteredItems.map((i) => ({
    cycleId,
    associateId: i.associateId,
    clientId: i.clientId,
    clientName: i.clientName,
    memberName: i.associateName,
    toolId: i.toolId,
    toolName: i.toolName,
    screenshotStatus: i.screenshotStatus,
    screenshotRejectReason: i.screenshotRejectReason,
    screenshotUploadedAt: i.screenshotUploadedAt,
  })), [filteredItems, cycleId]);

  const handleOpen = (item) => {
    const idx = filteredItems.findIndex((i) => i.associateId === item.associateId && i.clientId === item.clientId && i.toolId === item.toolId);
    setLightbox({
      items: lightboxItems,
      startIndex: idx < 0 ? 0 : idx,
    });
  };

  const handleDecide = async (lbItem, approve, reason) => {
    await reviewScreenshot(cycleId, lbItem.associateId, lbItem.clientId, lbItem.toolId, approve, reason);
    const nextStatus = approve ? 'Approved' : 'Rejected';
    const nextReason = approve ? null : reason?.trim() || null;
    setItems((current) => (current ?? []).map((item) => (
      item.associateId === lbItem.associateId
        && item.clientId === lbItem.clientId
        && item.toolId === lbItem.toolId
        ? {
            ...item,
            screenshotStatus: nextStatus,
            screenshotRejectReason: nextReason,
          }
        : item
    )));
    onReviewed?.();
  };

  const handleLightboxClose = () => {
    setLightbox(null);
  };

  // FullScreenOverlay and Lightbox both listen for Esc. While the lightbox is open, keep the
  // gallery mounted and treat either close callback as a lightbox-only close.
  const handleOverlayClose = () => {
    if (lightbox) {
      setLightbox(null);
      return;
    }
    onClose?.();
  };

  const total = items?.length ?? 0;

  return (
    <FullScreenOverlay
      title={`Screenshots — ${cycleName ?? ''}`}
      subtitle={loading ? 'Loading…' : `${total} screenshot${total === 1 ? '' : 's'}`}
      onClose={handleOverlayClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter — SegmentedControl with live counts */}
        <div>
          <SegmentedControl
            ariaLabel="Filter screenshots by status"
            options={filterOptions}
            value={filter}
            onChange={setFilter}
          />
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                borderRadius: 'var(--radius-card)', border: '1px solid var(--border-subtle)', background: 'var(--surface)',
              }}>
                <Skeleton width="100%" height={104} />
                <Skeleton width="70%" height={12} />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="alert" title="Couldn't load screenshots" message={error}
            action={<Button variant="outline" size="sm" icon="refresh" onClick={load}>Retry</Button>} />
        ) : total === 0 ? (
          <EmptyState icon="image" title="No screenshots uploaded"
            message="No screenshots have been uploaded for this cycle yet within your review scope." />
        ) : groups.length === 0 ? (
          <EmptyState icon="search" title="No matching screenshots"
            message="No screenshots match this filter. Switch the filter above to see more." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {groups.map((member) => {
              const memberCount = member.clients.reduce((sum, c) => sum + c.items.length, 0);
              return (
                <div key={member.associateId} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <SectionHeader
                    rule
                    right={<span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{memberCount}</span>}
                  >
                    {member.associateName}{' '}
                    <span style={{ textTransform: 'none', fontWeight: 400, fontFamily: 'var(--font-mono)' }}>({member.associateId})</span>
                  </SectionHeader>
                  {member.clients.map((client) => (
                    <div key={client.clientId}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                        {client.clientName}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)' }}>({client.clientId})</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                        {client.items.map((item) => (
                          <GalleryTile
                            key={`${item.clientId}-${item.toolId}`}
                            cycleId={cycleId}
                            item={item}
                            onOpen={handleOpen}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightbox && lightbox.items.length > 0 && (
        <Lightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          review={{ onDecide: handleDecide }}
          onClose={handleLightboxClose}
        />
      )}
    </FullScreenOverlay>
  );
}
