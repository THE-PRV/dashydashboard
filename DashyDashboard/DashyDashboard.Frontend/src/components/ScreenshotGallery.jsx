import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Icon, Stamp, Button, Skeleton, SegmentedControl, SectionHeader, Modal, useToasts,
} from './ui.jsx';
import { getScreenshotThumbUrl } from '../api/attestations.js';
import { reviewScreenshot, approveAllScreenshots } from '../api/manager.js';
import Lightbox from './Lightbox.jsx';

const STATUS_STAMP = {
  Pending: { tone: 'warning', label: 'PENDING' },
  Approved: { tone: 'success', label: 'APPROVED' },
  Rejected: { tone: 'danger', label: 'REJECTED' },
};

const STATUS_RANK = { Pending: 0, Rejected: 1, Approved: 2 };

function stampFor(status) {
  if (!status) return null;
  return STATUS_STAMP[status] ?? { tone: 'neutral', label: String(status).toUpperCase() };
}

function GalleryTile({ cycleId, associateId, clientId, tool, onOpen }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  const hasScreenshot = !!tool.screenshotStatus;
  const cacheKey = `${associateId}/${clientId}/${tool.toolID}/${tool.screenshotStatus ?? ''}/${tool.screenshotUploadedAt ?? ''}/${retryToken}`;

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    if (!hasScreenshot) {
      setThumbUrl(null);
      setThumbError(null);
      return undefined;
    }

    setThumbUrl(null);
    setThumbError(null);
    setThumbLoading(true);

    getScreenshotThumbUrl(cycleId, associateId, clientId, tool.toolID)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setThumbError('Preview unavailable');
          return;
        }
        createdUrl = url;
        setThumbUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setThumbError(err.message || 'Preview unavailable');
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

  const stamp = stampFor(tool.screenshotStatus);
  const isPending = tool.screenshotStatus === 'Pending';
  const openLabel = isPending ? 'Open to review' : 'Open full size';

  if (!tool.hadAccess && !hasScreenshot) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
        borderRadius: 'var(--radius-card)', border: '1px dashed var(--border)',
        background: 'var(--surface-2)', opacity: 0.7,
      }}>
        <div style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)',
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)',
        }}>
          <Icon name="minus" size={18} />
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {tool.toolName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No access - exempt</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
      borderRadius: 'var(--radius-card)', border: '1px solid var(--border-subtle)',
      background: 'var(--surface)',
    }}>
      <button
        type="button"
        onClick={() => hasScreenshot && onOpen({
          cycleId,
          associateId,
          clientId,
          toolId: tool.toolID,
          toolName: tool.toolName,
        })}
        disabled={!hasScreenshot}
        aria-label={hasScreenshot ? `${openLabel}: ${tool.toolName}` : `${tool.toolName} - no screenshot uploaded`}
        title={hasScreenshot ? openLabel : 'No screenshot uploaded'}
        style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)',
          overflow: 'hidden', padding: 0, position: 'relative',
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: hasScreenshot ? 'zoom-in' : 'default',
        }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            onError={() => {
              setThumbUrl(null);
              setThumbError('Preview unavailable');
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : thumbLoading ? (
          <Skeleton width="100%" height="100%" radius={0} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            color: 'var(--text-muted)', padding: 12, textAlign: 'center',
          }}>
            <Icon name="image" size={20} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 11.5 }}>
              {thumbError ? 'Preview unavailable' : 'No screenshot uploaded'}
            </span>
          </div>
        )}

        {hasScreenshot && !thumbLoading && (
          <span style={{
            position: 'absolute', left: 8, right: 8, bottom: 8,
            minHeight: 28, padding: '5px 9px', borderRadius: 'var(--radius)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'rgba(8, 9, 12, 0.82)', color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
          }}>
            <Icon name="eye" size={13} />
            {openLabel}
          </span>
        )}

        <span role="status" aria-live="polite" style={{
          position: 'absolute', width: 1, height: 1, overflow: 'hidden',
          clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)',
        }}>
          {thumbLoading ? `Loading ${tool.toolName} preview` : thumbError || ''}
        </span>
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {tool.toolName}
        </div>
        {stamp && <Stamp tone={stamp.tone} label={stamp.label} />}
      </div>

      {tool.screenshotStatus === 'Rejected' && tool.screenshotRejectReason && (
        <div style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.4 }}>
          {tool.screenshotRejectReason}
        </div>
      )}

      {tool.usedThisCycle === false && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Marked not used this cycle</div>
      )}

      {thumbError && hasScreenshot && (
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          onClick={() => setRetryToken((value) => value + 1)}
          style={{ alignSelf: 'flex-start', height: 22, padding: '0 4px' }}
        >
          Retry preview
        </Button>
      )}
    </div>
  );
}

export default function ScreenshotGallery({
  cycleId,
  associateId,
  memberName,
  byClient,
  rejectedScreenshots = 0,
  onReviewed,
}) {
  const [lightbox, setLightbox] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [filter, setFilter] = useState('All');
  const toasts = useToasts();

  const groups = useMemo(
    () => (byClient ?? []).filter((client) => (client.tools ?? []).length > 0),
    [byClient],
  );
  const hasAnyScreenshotRows = groups.some((client) =>
    client.tools.some((tool) => tool.hadAccess || tool.screenshotStatus));

  const allItems = useMemo(() => groups.flatMap((client) =>
    (client.tools ?? [])
      .filter((tool) => !!tool.screenshotStatus)
      .map((tool) => ({
        cycleId,
        associateId,
        clientId: client.clientID,
        clientName: client.clientName,
        memberName,
        toolId: tool.toolID,
        toolName: tool.toolName,
        screenshotStatus: tool.screenshotStatus,
        screenshotRejectReason: tool.screenshotRejectReason,
        screenshotUploadedAt: tool.screenshotUploadedAt,
        // A row requires review only when the tool was used (had access AND used this cycle) AND
        // the tool itself is flagged screenshotRequired. Optional shots on exempt rows OR on
        // optional tools stay viewable but are not approvable/rejectable.
        requiresReview: tool.hadAccess && tool.usedThisCycle === true && tool.screenshotRequired === true,
      })),
  ).sort((a, b) =>
    (STATUS_RANK[a.screenshotStatus] ?? 9) - (STATUS_RANK[b.screenshotStatus] ?? 9)),
  [groups, cycleId, associateId, memberName]);

  const counts = useMemo(() => ({
    All: allItems.length,
    Pending: allItems.filter((item) => item.screenshotStatus === 'Pending').length,
    Rejected: allItems.filter((item) => item.screenshotStatus === 'Rejected').length,
    Approved: allItems.filter((item) => item.screenshotStatus === 'Approved').length,
  }), [allItems]);

  const filterOptions = useMemo(() => ([
    { id: 'All', label: `All (${counts.All})` },
    { id: 'Pending', label: `Pending (${counts.Pending})` },
    { id: 'Rejected', label: `Rejected (${counts.Rejected})` },
    { id: 'Approved', label: `Approved (${counts.Approved})` },
  ]), [counts]);

  // Only actionable (review-required) pending shots feed the focused review flow and the
  // "Approve all" count, matching the backend which skips optional shots on exempt rows.
  const pendingItems = useMemo(
    () => allItems.filter((item) => item.screenshotStatus === 'Pending' && item.requiresReview),
    [allItems],
  );
  // Count used for the Review/Approve-all controls — only actionable pending shots.
  const actionablePending = pendingItems.length;

  const visibleGroups = useMemo(() => groups.map((client) => ({
    ...client,
    visibleTools: (client.tools ?? [])
      .filter((tool) => tool.hadAccess || tool.screenshotStatus)
      .filter((tool) => filter === 'All' || tool.screenshotStatus === filter)
      .slice()
      .sort((a, b) =>
        (STATUS_RANK[a.screenshotStatus] ?? 8) - (STATUS_RANK[b.screenshotStatus] ?? 8)),
  })).filter((client) => client.visibleTools.length > 0), [groups, filter]);

  const reviewTallyRef = useRef({ approved: 0, rejected: 0 });

  const decide = async (item, approve, reason) => {
    await reviewScreenshot(cycleId, associateId, item.clientId, item.toolId, approve, reason);
    if (approve) reviewTallyRef.current.approved += 1;
    else reviewTallyRef.current.rejected += 1;
  };

  if (!hasAnyScreenshotRows) return null;

  const handleApproveAll = async () => {
    setConfirmAll(false);
    setApprovingAll(true);
    try {
      await approveAllScreenshots(cycleId, associateId);
      toasts.success(`Approved ${actionablePending} screenshot${actionablePending === 1 ? '' : 's'}`);
      onReviewed?.();
    } catch (err) {
      toasts.error(err.message || 'Approve all failed.');
    } finally {
      setApprovingAll(false);
    }
  };

  const openLightbox = (items, startIndex) => {
    if (!items.length) return;
    reviewTallyRef.current = { approved: 0, rejected: 0 };
    setLightbox({
      items,
      startIndex,
      review: { onDecide: decide },
    });
  };

  const handleTileOpen = (target) => {
    const index = allItems.findIndex((item) =>
      item.clientId === target.clientId && item.toolId === target.toolId);
    openLightbox(allItems, index < 0 ? 0 : index);
  };

  const handleLightboxClose = () => {
    setLightbox(null);
    const { approved, rejected } = reviewTallyRef.current;
    if (approved > 0 || rejected > 0) {
      toasts.success(`${approved} approved, ${rejected} rejected`);
      onReviewed?.();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      <SectionHeader
        rule
        right={(
          <span style={{
            color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
            fontSize: 11, fontVariantNumeric: 'tabular-nums',
          }}>
            {allItems.length} uploaded
          </span>
        )}
      >
        Screenshots
      </SectionHeader>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap',
      }}>
        <SegmentedControl
          size="sm"
          ariaLabel="Filter screenshots by status"
          options={filterOptions}
          value={filter}
          onChange={setFilter}
        />
        {actionablePending > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="sm"
              icon="eye"
              onClick={() => openLightbox(pendingItems, 0)}
            >
              Review pending ({actionablePending})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="check"
              disabled={approvingAll}
              onClick={() => setConfirmAll(true)}
            >
              {approvingAll ? 'Approving...' : 'Approve all'}
            </Button>
          </div>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div style={{
          padding: '20px 16px', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-card)', color: 'var(--text-muted)',
          fontSize: 12.5, textAlign: 'center',
        }}>
          No screenshots match the {filter.toLowerCase()} filter.
        </div>
      ) : visibleGroups.map((client) => (
        <div key={client.clientID}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            {client.clientName}{' '}
            <span style={{
              color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)',
            }}>
              ({client.clientID})
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 10,
          }}>
            {client.visibleTools.map((tool) => (
              <GalleryTile
                key={tool.toolID}
                cycleId={cycleId}
                associateId={associateId}
                clientId={client.clientID}
                tool={tool}
                onOpen={handleTileOpen}
              />
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          review={lightbox.review}
          onClose={handleLightboxClose}
        />
      )}

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Approve all pending screenshots"
        width={420}
        footer={(
          <>
            <Button variant="outline" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={handleApproveAll}>
              Approve {actionablePending}
            </Button>
          </>
        )}
      >
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          Approve all {counts.Pending} pending screenshot{counts.Pending === 1 ? '' : 's'} for{' '}
          <strong>{memberName || 'this member'}</strong>? This signs off every pending proof at once.
        </div>
      </Modal>
    </div>
  );
}
