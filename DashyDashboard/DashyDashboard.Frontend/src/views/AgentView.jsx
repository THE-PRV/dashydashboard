import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, TriToggle, Progress, Button, TopBar } from '../components/ui.jsx';
import { getMyAttestations, toggleUsed, toggleHadAccess, submitAll, addRemark } from '../api/attestations.js';
import RemarksModal from '../components/RemarksModal.jsx';
import ScreenshotCell from '../components/ScreenshotCell.jsx';
import ScreenshotBatchModal from '../components/ScreenshotBatchModal.jsx';
import Lightbox from '../components/Lightbox.jsx';
import { asToolIdKey } from '../lib/contracts.js';

// Screenshot statuses that satisfy submit gating — mirrors AttestationService's
// SubmittableScreenshotStatuses. Rejected / missing block submission.
const SUBMITTABLE_SCREENSHOT_STATUSES = ['Pending', 'Approved'];

function rowKey(clientId, toolId) {
  return `${clientId}/${asToolIdKey(toolId)}`;
}

// True once the cycle's due date has passed (date-only comparison, matches the server's
// DateOnly.Today vs Cycle.DueDate check).
function isPastDue(cycle) {
  if (!cycle?.dueDate) return false;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return todayKey > String(cycle.dueDate).slice(0, 10);
}

// Only rows the associate marked as USED need a Pending/Approved screenshot to be
// submittable — mirrors the server's screenshot gate (§7, post-WI-1). No-access and
// not-used rows are exempt.
function needsScreenshot(tool) {
  return tool.hadAccess !== false
    && tool.usedThisCycle === true
    && !SUBMITTABLE_SCREENSHOT_STATUSES.includes(tool.screenshotStatus);
}

// A "not used" row (hadAccess true/unset, usedThisCycle explicitly false) must carry a
// non-empty remark explaining why — mirrors the server's mandatory-remark gate (WI-1).
function isNotUsed(tool) {
  return tool.hadAccess !== false && tool.usedThisCycle === false;
}

function needsNotUsedRemark(tool) {
  return isNotUsed(tool) && !(tool.remarks && String(tool.remarks).trim());
}

const CLIENT_ACCENTS = {
  marex: '#2563eb',
  natixis: '#0891b2',
  janestreet: '#7c3aed',
  jefferies: '#ca8a04',
  barclays: '#db2777',
  bbva: '#0d9488',
  ing: '#e11d48',
};

function accentFor(clientId) {
  return CLIENT_ACCENTS[clientId?.toLowerCase()] ?? '#2563eb';
}

function codeFor(name) {
  return (name ?? '???').split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase();
}

// A tool is "decided" (counts as attested / can be submitted) when the user has either
// answered Did-you-use OR declared they did not have access — both are valid attestations.
function isDecided(tool) {
  return (tool.usedThisCycle !== null && tool.usedThisCycle !== undefined) || tool.hadAccess === false;
}

export default function AgentView({ user, cycle, cycles, onCycle, onLogout, isManager, role, onRole, dark, onDark }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [remarkPane, setRemarkPane] = useState(null);
  const [focusedRow, setFocusedRow] = useState(null); // `${clientId}/${toolId}` of the paste target
  const [batchOpen, setBatchOpen] = useState(false);
  const [gateOffending, setGateOffending] = useState(null); // Set of `${clientId}/${toolId}` from the API's offendingRows (fallback truth)
  const [notUsedRemarkDrafts, setNotUsedRemarkDrafts] = useState({}); // rowKey -> in-progress text for the inline required-remark input
  const [savingRemarkRows, setSavingRemarkRows] = useState(() => new Set()); // rowKeys currently saving an inline remark
  const [lightboxItems, setLightboxItems] = useState(null); // WI-2 corner-button viewer for not-used rows with a prior screenshot
  const pasteTargetsRef = useRef(new Map()); // rowKey -> (file) => void, registered by ScreenshotCell

  const loadAttestations = async ({ preserveExpansion = false } = {}) => {
    if (!cycle) {
      setClients([]);
      setExpanded({});
      setLoadError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');

    try {
      const data = await getMyAttestations(cycle.cycleID);
      setClients(data);
      setExpanded((previous) => {
        if (preserveExpansion && Object.keys(previous).length > 0) {
          return previous;
        }
        return data.length > 0 ? { [data[0].clientID]: true } : {};
      });
    } catch (error) {
      setClients([]);
      setExpanded({});
      setLoadError(error.message || 'Could not load your attestations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttestations();
  }, [cycle]);

  // Each visible ScreenshotCell registers a (file) => void handler for its row key.
  const registerPasteTarget = useCallback((key, handler) => {
    if (handler) pasteTargetsRef.current.set(key, handler);
    else pasteTargetsRef.current.delete(key);
  }, []);

  // Clipboard paste (§A3): with a row focused, Ctrl+V with image data attaches the
  // pasted image to that row through the same compress+upload pipeline.
  useEffect(() => {
    const onPaste = (e) => {
      if (!focusedRow) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const handler = pasteTargetsRef.current.get(focusedRow);
            if (handler) {
              e.preventDefault();
              handler(file);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [focusedRow]);

  const totals = useMemo(() => {
    let total = 0;
    let attested = 0;
    clients.forEach((client) => {
      total += client.totalTools;
      attested += client.attestedTools;
    });
    return { total, attested, pending: total - attested };
  }, [clients]);

  const isSubmitted = useMemo(() =>
    clients.length > 0 &&
    clients.every((c) => c.tools.every((t) => t.attestationStatus === 'Submitted')),
  [clients]);

  const pastDue = useMemo(() => isPastDue(cycle), [cycle]);

  // §A5: rows that block submission because they're missing a Pending/Approved screenshot.
  // Computed client-side as the primary truth; gateOffending (from a 400 response) is kept
  // as a fallback in case a row's local state is briefly stale.
  const blockedRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => {
      client.tools.forEach((tool) => {
        if (needsScreenshot(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
      });
    });
    if (gateOffending) {
      gateOffending.forEach((key) => blocked.add(key));
    }
    return blocked;
  }, [clients, gateOffending]);

  const screenshotGateBlocked = blockedRows.size > 0;

  // WI-1: "Not used" rows without a remark — blocks submission and drives the inline
  // required-remark UI + row highlight.
  const notUsedRemarkRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => {
      client.tools.forEach((tool) => {
        if (needsNotUsedRemark(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
      });
    });
    return blocked;
  }, [clients]);

  const visible = useMemo(() => {
    if (!search) return clients;
    const query = search.toLowerCase();
    return clients
      .map((client) => ({
        ...client,
        tools: client.tools.filter((tool) => tool.toolName.toLowerCase().includes(query)),
      }))
      .filter((client) => client.tools.length > 0);
  }, [clients, search]);

  const flashToast = (kind, message, ms = 3500) => {
    setToast({ kind, message });
    window.clearTimeout(flashToast.timeoutId);
    flashToast.timeoutId = window.setTimeout(() => setToast(null), ms);
  };

  const displayName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'there';

  const handleSubmitAll = async () => {
    if (!cycle || submitting) return;

    const allDecided = clients.every((client) => client.tools.every(isDecided));

    if (!allDecided) {
      flashToast('warn', 'All tools must be answered before submitting.');
      return;
    }

    const missingRemarks = clients.reduce((count, client) => count + client.tools.filter((tool) =>
      tool.hadAccess === false && !(tool.remarks && String(tool.remarks).trim())).length, 0);

    if (missingRemarks > 0) {
      flashToast('warn', `Add a remark for each tool you marked as 'No access' before submitting (${missingRemarks} still need one).`);
      return;
    }

    if (notUsedRemarkRows.size > 0) {
      flashToast('warn', `Add a remark for each tool you marked as 'Not used' before submitting (${notUsedRemarkRows.size} still need one).`);
      return;
    }

    if (screenshotGateBlocked) {
      flashToast('warn', `Upload a screenshot for every tool you used before submitting (${blockedRows.size} still need one).`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAll(cycle.cycleID, null);
      setGateOffending(null);
      await loadAttestations({ preserveExpansion: true });
      flashToast('ok', result?.summary ?? 'Attestation submitted and saved.');
    } catch (error) {
      const offending = error.body?.offendingRows;
      if (Array.isArray(offending) && offending.length > 0) {
        setGateOffending(new Set(offending.map((row) => rowKey(row.clientID ?? row.ClientID, row.toolID ?? row.ToolID))));
        flashToast('err', error.message || 'Upload a screenshot for every tool you used before submitting.');
      } else {
        flashToast('err', error.message || 'Submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (clientId, toolId, value) => {
    if (!cycle) return;
    const toolKey = asToolIdKey(toolId);

    setClients((previous) => previous.map((client) => client.clientID !== clientId ? client : {
      ...client,
      tools: client.tools.map((tool) => asToolIdKey(tool.toolID) !== toolKey ? tool : { ...tool, usedThisCycle: value }),
      attestedTools: client.tools.reduce((sum, tool) => {
        const used = asToolIdKey(tool.toolID) === toolKey ? value : tool.usedThisCycle;
        const decided = (used !== null && used !== undefined) || tool.hadAccess === false;
        return sum + (decided ? 1 : 0);
      }, 0),
    }));

    try {
      await toggleUsed(cycle.cycleID, clientId, toolId, value);
    } catch (error) {
      await loadAttestations({ preserveExpansion: true });
      flashToast('err', error.message || 'Could not save that change.');
    }
  };

  const handleToggleHadAccess = async (clientId, toolId, value) => {
    if (!cycle) return;
    const toolKey = asToolIdKey(toolId);

    setClients((previous) => previous.map((client) => {
      if (client.clientID !== clientId) return client;
      const tools = client.tools.map((tool) => asToolIdKey(tool.toolID) !== toolKey ? tool : {
        ...tool,
        hadAccess: value,
        usedThisCycle: value === false ? null : tool.usedThisCycle,
      });
      return { ...client, tools, attestedTools: tools.reduce((sum, tool) => sum + (isDecided(tool) ? 1 : 0), 0) };
    }));

    try {
      await toggleHadAccess(cycle.cycleID, clientId, toolId, value);
    } catch (error) {
      await loadAttestations({ preserveExpansion: true });
      flashToast('err', error.message || 'Could not save that change.');
    }
  };

  const applyRemark = (clientId, toolId, text) => {
    const toolKey = asToolIdKey(toolId);
    setClients((previous) => previous.map((client) => client.clientID !== clientId ? client : {
      ...client,
      tools: client.tools.map((tool) => asToolIdKey(tool.toolID) !== toolKey ? tool : { ...tool, remarks: text || null }),
    }));
  };

  // WI-1: save the inline "Not used" remark (Enter or blur with non-empty text). Reuses the
  // same addRemark API + applyRemark local-state update as RemarksModal.
  const handleSaveNotUsedRemark = async (clientId, toolId, key, text) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;
    setSavingRemarkRows((previous) => new Set(previous).add(key));
    try {
      await addRemark(cycle.cycleID, clientId, toolId, trimmed);
      applyRemark(clientId, toolId, trimmed);
      setNotUsedRemarkDrafts((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    } catch (error) {
      flashToast('err', error.message || 'Could not save that remark.');
    } finally {
      setSavingRemarkRows((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Loading your attestations...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <TopBar
        user={user}
        cycle={cycle}
        cycles={cycles}
        onCycle={onCycle}
        onLogout={onLogout}
        search={search}
        onSearch={setSearch}
        isManager={isManager}
        role={role}
        onRole={onRole}
        dark={dark}
        onDark={onDark}
      />

      {toast && (
        <div style={{
          position: 'absolute',
          top: 70,
          right: 24,
          zIndex: 60,
          minWidth: 280,
          maxWidth: 480,
          padding: '12px 16px',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background:
            toast.kind === 'ok' ? 'color-mix(in oklab, var(--success), transparent 88%)' :
            toast.kind === 'warn' ? 'var(--warning-bg)' :
            'color-mix(in oklab, var(--danger-fg), transparent 88%)',
          border: `1px solid ${
            toast.kind === 'ok' ? 'var(--success)' :
            toast.kind === 'warn' ? 'var(--warning-fg)' :
            'var(--danger-fg)'} `,
          color:
            toast.kind === 'ok' ? 'var(--badge-used-fg)' :
            toast.kind === 'warn' ? 'var(--warning-fg)' :
            'var(--danger-fg)',
          fontSize: 13,
          fontWeight: 500,
        }}>
          <Icon name={toast.kind === 'ok' ? 'check' : toast.kind === 'warn' ? 'bell' : 'x'} size={15} stroke={2.2} />
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 2, lineHeight: 0 }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      <div style={{
        position: 'relative',
        padding: '24px 24px',
        background: 'var(--gradient-hero), var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Icon name="shield" size={13} /> Access report
          </div>
          {(() => {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
            return (
              <h1 style={{
                margin: '8px 0 6px',
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                background: 'linear-gradient(135deg, var(--text) 30%, color-mix(in oklab, var(--accent), var(--text) 40%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {greeting}, {displayName.split(' ')[0]}.
              </h1>
            );
          })()}
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14, maxWidth: 540 }}>
            You have <strong style={{ color: 'var(--text)' }}>{totals.pending}</strong> tools left to attest before {cycle?.dueDate}. Mark which ones you actually used this cycle.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Attested', value: totals.attested, accent: 'var(--success)' },
              { label: 'Remaining', value: totals.pending, accent: 'var(--warning-fg)' },
              { label: 'Clients', value: clients.length, accent: 'var(--accent)' },
              { label: 'Days left', value: cycle?.daysLeft ?? '-', accent: 'var(--accent-2)' },
            ].map((kpi) => (
              <div key={kpi.label} style={{
                padding: '10px 14px',
                minWidth: 96,
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: kpi.accent }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{kpi.label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '18px 22px',
          background: 'var(--surface-elev)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          minWidth: 300,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cycle progress</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{cycle?.daysLeft}d left</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {totals.attested}
            </span>
            <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>/ {totals.total}</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 13,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--accent), transparent 86%)',
              color: 'var(--accent)',
            }}>
              {totals.total > 0 ? Math.round((totals.attested / totals.total) * 100) : 0}%
            </span>
          </div>
          <Progress value={totals.attested} max={totals.total} height={8} />
          <Button
            variant="outline"
            size="sm"
            icon="upload"
            onClick={() => setBatchOpen(true)}
            disabled={isSubmitted || pastDue}
            style={{ justifyContent: 'center', opacity: (isSubmitted || pastDue) ? 0.6 : 1, cursor: (isSubmitted || pastDue) ? 'not-allowed' : 'pointer' }}
          >
            Batch upload screenshots
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="check"
            onClick={handleSubmitAll}
            disabled={isSubmitted || screenshotGateBlocked}
            title={screenshotGateBlocked ? `Upload a screenshot for every used tool first (${blockedRows.size} remaining)` : undefined}
            style={{
              justifyContent: 'center',
              opacity: (submitting || isSubmitted || screenshotGateBlocked) ? 0.7 : 1,
              cursor: submitting ? 'wait' : (isSubmitted || screenshotGateBlocked) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : isSubmitted ? 'Submitted' : screenshotGateBlocked ? `Submit attestation (${blockedRows.size} screenshots needed)` : 'Submit attestation'}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loadError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid color-mix(in oklab, var(--danger-fg), transparent 72%)',
            background: 'color-mix(in oklab, var(--danger-fg), transparent 90%)',
            color: 'var(--danger-fg)',
          }}>
            <div style={{ fontSize: 13, lineHeight: 1.4 }}>{loadError}</div>
            <Button variant="outline" size="sm" onClick={() => loadAttestations({ preserveExpansion: true })}>
              Retry
            </Button>
          </div>
        )}

        {!loadError && visible.length === 0 && (
          <div style={{
            padding: '28px 24px',
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            {search ? 'No tools match your search.' : 'No attestations are available for this cycle.'}
          </div>
        )}

        {visible.map((client) => {
          const accent = accentFor(client.clientID);
          const code = codeFor(client.clientName);
          const open = !!expanded[client.clientID];

          return (
            <section key={client.clientID} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <header
                onClick={() => setExpanded((previous) => ({ ...previous, [client.clientID]: !open }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  cursor: 'pointer',
                  borderBottom: open ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent}, black 25%))`,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 0.5,
                  flex: 'none',
                }}>
                  {code}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    {client.clientName} ({client.clientID})
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {client.totalTools ?? 0} tools | {client.usedTools ?? 0} used | {(client.totalTools ?? 0) - (client.attestedTools ?? 0) > 0
                      ? `${(client.totalTools ?? 0) - (client.attestedTools ?? 0)} pending`
                      : 'all attested'}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Attested</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{client.attestedTools}/{client.totalTools}</span>
                  </div>
                  <Progress value={client.attestedTools} max={client.totalTools} color={accent} height={5} />
                </div>
                <button
                  type="button"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform .15s',
                  }}
                >
                  <Icon name="chevdown" size={13} />
                </button>
              </header>

              {open && (
                <>
                {isSubmitted && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 16px',
                    background: 'color-mix(in oklab, var(--success), transparent 88%)',
                    borderBottom: '1px solid color-mix(in oklab, var(--success), transparent 70%)',
                    color: 'var(--badge-used-fg)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    <Icon name="check" size={13} stroke={2.5} />
                    This attestation has been submitted and is locked.
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        {['Tool', 'Confirm Access', 'Did you use?', 'Remark', 'Screenshot'].map((heading) => (
                          <th key={heading} style={{
                            textAlign: 'left',
                            padding: '9px 16px',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                            whiteSpace: 'nowrap',
                          }}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {client.tools.map((tool, index) => {
                        const key = rowKey(client.clientID, tool.toolID);
                        const pending = !isDecided(tool);
                        const needsRemark = notUsedRemarkRows.has(key);
                        const blocked = blockedRows.has(key) || needsRemark;
                        return (
                          <tr key={tool.toolID} style={{
                            background: blocked
                              ? 'color-mix(in oklab, var(--danger-bg), transparent 30%)'
                              : pending
                              ? 'color-mix(in oklab, var(--warning-bg), transparent 50%)'
                              : index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                            borderBottom: '1px solid var(--border-subtle)',
                            boxShadow: blocked ? 'inset 3px 0 0 var(--danger-fg)' : 'none',
                          }}>
                            <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                              {tool.toolName}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <TriToggle
                                value={tool.hadAccess ?? true}
                                onChange={(value) => handleToggleHadAccess(client.clientID, tool.toolID, value)}
                                labels={['True', 'False']}
                                size="sm"
                                disabled={isSubmitted}
                              />
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <TriToggle
                                value={tool.usedThisCycle}
                                onChange={(value) => handleToggle(client.clientID, tool.toolID, value)}
                                disabled={tool.hadAccess === false || isSubmitted}
                                style={(tool.hadAccess === false || isSubmitted) ? { opacity: 0.35, pointerEvents: 'none' } : {}}
                                size="sm"
                              />
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {(() => {
                                const hasRemark = !!tool.remarks;

                                // WI-1: "Not used" rows without a remark get an inline, visibly
                                // required text input instead of the chip-button.
                                if (needsRemark && !isSubmitted) {
                                  const draft = notUsedRemarkDrafts[key] ?? '';
                                  const saving = savingRemarkRows.has(key);
                                  const commit = () => handleSaveNotUsedRemark(client.clientID, tool.toolID, key, draft);
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 200 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                          type="text"
                                          value={draft}
                                          placeholder="Explain why this tool wasn't used"
                                          maxLength={500}
                                          disabled={saving}
                                          onChange={(e) => setNotUsedRemarkDrafts((previous) => ({ ...previous, [key]: e.target.value }))}
                                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                                          onBlur={commit}
                                          style={{
                                            flex: 1,
                                            minWidth: 0,
                                            height: 28,
                                            padding: '0 8px',
                                            borderRadius: 6,
                                            border: '1px solid var(--danger-fg)',
                                            background: 'var(--surface)',
                                            color: 'var(--text)',
                                            fontSize: 12,
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            opacity: saving ? 0.6 : 1,
                                          }}
                                        />
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger-fg)', flex: 'none' }} title="Required">*</span>
                                      </div>
                                      <span style={{ fontSize: 10.5, color: 'var(--danger-fg)' }}>
                                        {saving ? 'Saving…' : 'Required — explain why this tool wasn\'t used'}
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <button
                                    type="button"
                                    disabled={isSubmitted}
                                    onClick={() => !isSubmitted && setRemarkPane({
                                      cycleId: cycle.cycleID,
                                      clientId: client.clientID,
                                      clientName: client.clientName,
                                      toolId: tool.toolID,
                                      toolName: tool.toolName,
                                      accent,
                                      initialText: tool.remarks ?? '',
                                    })}
                                    title={isSubmitted ? 'Attestation is locked' : hasRemark ? tool.remarks : 'Add a remark'}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      height: 24,
                                      padding: '0 8px',
                                      borderRadius: 6,
                                      border: `1px solid ${hasRemark ? 'var(--accent)' : 'var(--border)'}`,
                                      background: hasRemark ? 'color-mix(in oklab, var(--accent), transparent 90%)' : 'var(--surface)',
                                      color: hasRemark ? 'var(--accent)' : 'var(--text-muted)',
                                      fontSize: 11,
                                      fontWeight: 500,
                                      cursor: isSubmitted ? 'default' : 'pointer',
                                      fontFamily: 'inherit',
                                      maxWidth: 200,
                                      opacity: isSubmitted ? 0.5 : 1,
                                    }}
                                  >
                                    <Icon name="message" size={12} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {hasRemark ? tool.remarks : 'Add remark'}
                                    </span>
                                  </button>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {tool.hadAccess === false ? (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Not required</span>
                              ) : isNotUsed(tool) ? (
                                // WI-2: not-used rows hide the upload strip entirely. If a
                                // screenshot was previously uploaded (e.g. before flipping to
                                // "Not used"), show only a small view button -> shared Lightbox.
                                tool.screenshotStatus ? (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxItems([{
                                      cycleId: cycle.cycleID,
                                      associateId: user.associateId,
                                      clientId: client.clientID,
                                      clientName: client.clientName,
                                      toolId: tool.toolID,
                                      toolName: tool.toolName,
                                      screenshotStatus: tool.screenshotStatus,
                                      screenshotRejectReason: tool.screenshotRejectReason,
                                      screenshotUploadedAt: tool.screenshotUploadedAt,
                                    }])}
                                    title="View previous screenshot"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      border: '1px solid var(--border)',
                                      background: 'var(--surface-2)',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Icon name="image" size={13} />
                                  </button>
                                ) : null
                              ) : (
                                <ScreenshotCell
                                  cycleId={cycle.cycleID}
                                  associateId={user.associateId}
                                  clientId={client.clientID}
                                  toolId={tool.toolID}
                                  screenshotStatus={tool.screenshotStatus}
                                  screenshotRejectReason={tool.screenshotRejectReason}
                                  screenshotUploadedAt={tool.screenshotUploadedAt}
                                  readOnly={isSubmitted || pastDue}
                                  isFocused={focusedRow === key}
                                  onFocus={() => setFocusedRow(key)}
                                  onUploaded={() => loadAttestations({ preserveExpansion: true })}
                                  onError={(message) => flashToast('err', message)}
                                  registerPasteTarget={registerPasteTarget}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {remarkPane && (
        <RemarksModal
          pane={remarkPane}
          onClose={() => setRemarkPane(null)}
          onSaved={(text) => {
            applyRemark(remarkPane.clientId, remarkPane.toolId, text);
            flashToast('ok', text ? 'Remark saved.' : 'Remark cleared.');
          }}
        />
      )}

      {batchOpen && (
        <ScreenshotBatchModal
          cycleId={cycle.cycleID}
          clients={clients}
          onClose={() => setBatchOpen(false)}
          onUploaded={() => loadAttestations({ preserveExpansion: true })}
        />
      )}

      {lightboxItems && (
        <Lightbox
          items={lightboxItems}
          onClose={() => setLightboxItems(null)}
        />
      )}
    </div>
  );
}
