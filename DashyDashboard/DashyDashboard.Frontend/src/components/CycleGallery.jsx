import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Badge, SectionHeader } from './ui.jsx';
import { getScreenshotThumbUrl } from '../api/attestations.js';
import { getCycleScreenshots, reviewScreenshot } from '../api/manager.js';
import FullScreenOverlay from './FullScreenOverlay.jsx';
import Lightbox from './Lightbox.jsx';

const STATUS_BADGE = {
  Pending: { variant: 'pending', label: 'Pending' },
  Approved: { variant: 'used', label: 'Approved' },
  Rejected: { variant: 'danger', label: 'Rejected' },
};

const FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' },
];

/**
 * One thumbnail tile: lazily-fetched thumbnail + tool name + status badge. Clicking opens
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

  const badge = item.screenshotStatus ? STATUS_BADGE[item.screenshotStatus] ?? { variant: 'neutral', label: item.screenshotStatus } : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10, textAlign: 'left',
        borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--surface)',
        cursor: 'zoom-in', fontFamily: 'inherit',
      }}
      title="Click to view full size"
    >
      <div style={{
        width: '100%', aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden',
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={`${item.toolName} screenshot`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Icon name="image" size={20} style={{ color: 'var(--text-muted)', opacity: thumbLoading ? 1 : 0.4 }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.toolName}
        </div>
        {badge && <Badge variant={badge.variant} size="sm">{badge.label}</Badge>}
      </div>

      {item.screenshotStatus === 'Rejected' && item.screenshotRejectReason && (
        <div style={{ fontSize: 11, color: 'var(--danger-fg)' }}>{item.screenshotRejectReason}</div>
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
 * Props: { cycleId, cycleName, onClose }
 */
export default function CycleGallery({ cycleId, cycleName, onClose }) {
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
      clients: Array.from(m.clients.values()),
    }));
  }, [filteredItems]);

  const lightboxItems = useMemo(() => filteredItems.map((i) => ({
    cycleId,
    associateId: i.associateId,
    clientId: i.clientId,
    clientName: i.clientName,
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
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  height: 28, padding: '0 12px', borderRadius: 999,
                  border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                  background: active ? 'var(--text)' : 'var(--surface)',
                  color: active ? 'var(--bg)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {label} ({counts[key] ?? 0})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Loading screenshots…
          </div>
        ) : error ? (
          <div style={{ fontSize: 13, color: 'var(--danger-fg)' }}>{error}</div>
        ) : total === 0 ? (
          <div style={{
            padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center',
          }}>
            <Icon name="image" size={20} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>No screenshots uploaded</div>
            <div style={{ fontSize: 12.5, maxWidth: 320 }}>
              No screenshots have been uploaded for this cycle yet within your review scope.
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            No screenshots match this filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {groups.map((member) => {
              const memberCount = member.clients.reduce((sum, c) => sum + c.items.length, 0);
              return (
                <div key={member.associateId} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <SectionHeader right={<span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{memberCount}</span>}>
                    {member.associateName} <span style={{ textTransform: 'none', fontWeight: 400 }}>({member.associateId})</span>
                  </SectionHeader>
                  {member.clients.map((client) => (
                    <div key={client.clientId}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                        {client.clientName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({client.clientId})</span>
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
