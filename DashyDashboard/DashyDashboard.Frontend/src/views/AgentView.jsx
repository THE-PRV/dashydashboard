// ─────────────────────────────────────────────────────────────────────────────
// AgentView — "The Ledger" associate attestation (DESIGN.md §10 "Agent").
//
//   hero        : Fraunces KPI band — what's LEFT + due date is the message.
//   blockers    : aria-live panel enumerating every submission gate, each with a
//                 "jump" that scrolls to + flash-highlights the offending row.
//   tool rows   : read left→right as questions — Access? → Used? → Proof/Reason.
//   submit      : disabled-with-reason (Tooltip) until the blockers panel clears.
//   submitted   : the table visually locks (muted, controls off); rejected-shot
//                 re-upload stays possible per the server's post-due-date rule.
//
// All feedback goes through useToasts. The CycleRuler + cycle picker live in the
// AppShell; this view renders content only (no TopBar).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Icon, TriToggle, Button, SearchBar, Card, KpiCard, SectionHeader,
  Tooltip, EmptyState, Skeleton, Progress, useToasts,
} from '../components/ui.jsx';
import { getMyAttestations, toggleUsed, toggleHadAccess, submitAll, addRemark } from '../api/attestations.js';
import RemarksModal from '../components/RemarksModal.jsx';
import ScreenshotCell from '../components/ScreenshotCell.jsx';
import Lightbox from '../components/Lightbox.jsx';
import { asToolIdKey } from '../lib/contracts.js';

// Screenshot statuses that satisfy submit gating — mirrors AttestationService's
// SubmittableScreenshotStatuses. Rejected / missing block submission.
const SUBMITTABLE_SCREENSHOT_STATUSES = ['Pending', 'Approved'];

function rowKey(clientId, toolId) {
  return `${clientId}/${asToolIdKey(toolId)}`;
}

// DOM id for a tool row — the blockers panel scroll/flash target.
function rowDomId(clientId, toolId) {
  return `arow-${clientId}-${asToolIdKey(toolId)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// True once the cycle's due date has passed (date-only comparison, matches the server's
// DateOnly.Today vs Cycle.DueDate check).
function isPastDue(cycle) {
  if (!cycle?.dueDate) return false;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return todayKey > String(cycle.dueDate).slice(0, 10);
}

// Only USED rows on a tool flagged screenshotRequired need a Pending/Approved screenshot to be
// submittable — mirrors the server's screenshot gate. No-access rows, not-used rows, AND used
// rows on OPTIONAL tools (screenshotRequired false) are exempt: proof there is viewable-only.
function needsScreenshot(tool) {
  return tool.hadAccess !== false
    && tool.usedThisCycle === true
    && tool.screenshotRequired === true
    && !SUBMITTABLE_SCREENSHOT_STATUSES.includes(tool.screenshotStatus);
}

// A "not used" row (hadAccess true/unset, usedThisCycle explicitly false) must carry a
// non-empty remark explaining why — mirrors the server's mandatory-remark gate.
function isNotUsed(tool) {
  return tool.hadAccess !== false && tool.usedThisCycle === false;
}

function needsNotUsedRemark(tool) {
  return isNotUsed(tool) && !(tool.remarks && String(tool.remarks).trim());
}

// A no-access row needs a remark too (server's mandatory-remark gate for HadAccess=false).
function needsNoAccessRemark(tool) {
  return tool.hadAccess === false && !(tool.remarks && String(tool.remarks).trim());
}

// A tool is "decided" (counts as attested) once the user has either answered Did-you-use
// OR declared no access — both are valid attestations.
function isDecided(tool) {
  return (tool.usedThisCycle !== null && tool.usedThisCycle !== undefined) || tool.hadAccess === false;
}

function fmtDueDate(s) {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// One ledger header label cell for the tool table.
function Th({ children, width, align = 'left' }) {
  // A flat header band — NOT sticky (sticky-to-viewport detached it from the
  // table and left it floating over blank space when the page scrolled).
  return (
    <th style={{
      textAlign: align, padding: '9px 14px', width,
      fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)',
      background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

export default function AgentView({ user, cycle, onLogout }) {
  const toasts = useToasts();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [remarkPane, setRemarkPane] = useState(null);
  const [focusedRow, setFocusedRow] = useState(null); // rowKey of the paste target
  const [gateOffending, setGateOffending] = useState(null); // Set of rowKeys from the API's offendingRows
  const [notUsedRemarkDrafts, setNotUsedRemarkDrafts] = useState({}); // rowKey -> draft text
  const [savingRemarkRows, setSavingRemarkRows] = useState(() => new Set());
  const [lightboxItems, setLightboxItems] = useState(null);
  const [flashKey, setFlashKey] = useState(null); // rowKey currently flash-highlighted
  const [verdictAnim, setVerdictAnim] = useState(() => new Set()); // rowKeys whose screenshot verdict changed in-session
  const pasteTargetsRef = useRef(new Map());
  const flashTimer = useRef(null);
  const prevVerdictRef = useRef(new Map()); // rowKey -> last seen screenshotStatus

  const loadAttestations = async ({ preserveExpansion = false } = {}) => {
    if (!cycle) {
      setClients([]); setExpanded({}); setLoadError(''); setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMyAttestations(cycle.cycleID);
      setClients(data);
      setExpanded((previous) => {
        if (preserveExpansion && Object.keys(previous).length > 0) return previous;
        // Default: expand every client so the full ledger is scannable at a glance.
        return data.reduce((acc, c) => { acc[c.clientID] = true; return acc; }, {});
      });
    } catch (error) {
      setClients([]); setExpanded({});
      setLoadError(error.message || 'Could not load your attestations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAttestations(); /* eslint-disable-next-line */ }, [cycle]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Detect screenshot verdict changes in-session (Pending → Approved/Rejected) to play the
  // stamp-in settle on the affected row.
  useEffect(() => {
    const next = new Set();
    const seen = new Map();
    clients.forEach((client) => client.tools.forEach((tool) => {
      const k = rowKey(client.clientID, tool.toolID);
      const status = tool.screenshotStatus ?? null;
      seen.set(k, status);
      const prev = prevVerdictRef.current.get(k);
      if (prev !== undefined && prev !== status && (status === 'Approved' || status === 'Rejected')) {
        next.add(k);
      }
    }));
    prevVerdictRef.current = seen;
    if (next.size) {
      setVerdictAnim(next);
      const t = setTimeout(() => setVerdictAnim(new Set()), 320);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [clients]);

  const registerPasteTarget = useCallback((key, handler) => {
    if (handler) pasteTargetsRef.current.set(key, handler);
    else pasteTargetsRef.current.delete(key);
  }, []);

  // Clipboard paste: with a row focused, Ctrl+V routes the pasted image to that row.
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
            if (handler) { e.preventDefault(); handler(file); }
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [focusedRow]);

  const totals = useMemo(() => {
    let total = 0; let attested = 0; let used = 0;
    clients.forEach((client) => {
      total += client.totalTools ?? 0;
      attested += client.attestedTools ?? 0;
      used += client.usedTools ?? 0;
    });
    return { total, attested, used, pending: total - attested };
  }, [clients]);

  const isSubmitted = useMemo(() =>
    clients.length > 0 && clients.every((c) => c.tools.every((t) => t.attestationStatus === 'Submitted')),
  [clients]);

  // Rows a reviewer rejected — surfaced loudly so a submitted associate sees their
  // attestation is REOPENED for those rows (re-upload sends them back for approval).
  const rejectedRows = useMemo(() => {
    const out = [];
    clients.forEach((client) => client.tools.forEach((tool) => {
      if (tool.screenshotStatus === 'Rejected') {
        out.push({
          key: rowKey(client.clientID, tool.toolID),
          clientId: client.clientID, clientName: client.clientName,
          toolId: tool.toolID, toolName: tool.toolName,
          reason: tool.screenshotRejectReason,
        });
      }
    }));
    return out;
  }, [clients]);
  const reopened = isSubmitted && rejectedRows.length > 0;

  const pastDue = useMemo(() => isPastDue(cycle), [cycle]);

  // Rows blocked because a used tool is missing a Pending/Approved screenshot. Client-side
  // truth; gateOffending (from a 400) is folded in as a fallback for briefly-stale state.
  const blockedRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => client.tools.forEach((tool) => {
      if (needsScreenshot(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
    }));
    if (gateOffending) gateOffending.forEach((key) => blocked.add(key));
    return blocked;
  }, [clients, gateOffending]);

  // "Not used" rows still missing the mandatory why-remark.
  const notUsedRemarkRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => client.tools.forEach((tool) => {
      if (needsNotUsedRemark(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
    }));
    return blocked;
  }, [clients]);

  // "No access" rows still missing their mandatory remark.
  const noAccessRemarkRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => client.tools.forEach((tool) => {
      if (needsNoAccessRemark(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
    }));
    return blocked;
  }, [clients]);

  // Unanswered rows (no decision at all yet).
  const unansweredRows = useMemo(() => {
    const blocked = new Set();
    clients.forEach((client) => client.tools.forEach((tool) => {
      if (!isDecided(tool)) blocked.add(rowKey(client.clientID, tool.toolID));
    }));
    return blocked;
  }, [clients]);

  // ── Blockers: one flat, ordered list the panel renders and the submit gate reads.
  // Each entry: { key, clientId, clientName, toolId, toolName, kind, label }.
  const blockers = useMemo(() => {
    if (isSubmitted) return [];
    const out = [];
    clients.forEach((client) => client.tools.forEach((tool) => {
      const k = rowKey(client.clientID, tool.toolID);
      const base = {
        key: k, clientId: client.clientID, clientName: client.clientName,
        toolId: tool.toolID, toolName: tool.toolName,
      };
      if (!isDecided(tool)) {
        out.push({ ...base, kind: 'unanswered', label: 'Answer Access / Used' });
      } else if (needsNoAccessRemark(tool)) {
        out.push({ ...base, kind: 'noAccessRemark', label: 'Add a reason (no access)' });
      } else if (needsNotUsedRemark(tool)) {
        out.push({ ...base, kind: 'notUsedRemark', label: 'Add a reason (not used)' });
      } else if (needsScreenshot(tool)) {
        out.push({ ...base, kind: 'screenshot', label: 'Upload a screenshot' });
      }
    }));
    return out;
  }, [clients, isSubmitted]);

  const canSubmit = clients.length > 0 && blockers.length === 0 && !isSubmitted;

  // Human-readable reason the submit button is disabled (drives the Tooltip).
  const submitDisabledReason = useMemo(() => {
    if (isSubmitted) return 'This attestation is already submitted.';
    if (clients.length === 0) return 'No tools to attest in this cycle.';
    if (blockers.length === 0) return null;
    const n = blockers.length;
    return `Resolve ${n} blocker${n === 1 ? '' : 's'} above before submitting.`;
  }, [isSubmitted, clients.length, blockers.length]);

  const visible = useMemo(() => {
    if (!search) return clients;
    const query = search.toLowerCase();
    return clients
      .map((client) => ({
        ...client,
        tools: client.tools.filter((tool) =>
          (tool.toolName ?? '').toLowerCase().includes(query)
          || String(tool.toolID).toLowerCase().includes(query)),
      }))
      .filter((client) => client.tools.length > 0
        || client.clientName?.toLowerCase().includes(query)
        || String(client.clientID).toLowerCase().includes(query));
  }, [clients, search]);

  const firstName = (user?.firstName || '').trim() || 'there';

  // Scroll to + flash-highlight a row (the blockers panel jump action).
  const jumpToRow = useCallback((clientId, toolId) => {
    setExpanded((prev) => ({ ...prev, [clientId]: true }));
    const k = rowKey(clientId, toolId);
    // wait a frame for the section to expand before scrolling.
    requestAnimationFrame(() => {
      const el = document.getElementById(rowDomId(clientId, toolId));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashKey(k);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashKey(null), 1600);
    });
  }, []);

  const handleSubmitAll = async () => {
    if (!cycle || submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const result = await submitAll(cycle.cycleID, null);
      setGateOffending(null);
      await loadAttestations({ preserveExpansion: true });
      toasts.success(result?.summary ?? 'Attestation submitted and saved.', { title: 'Submitted' });
    } catch (error) {
      const offending = error.body?.offendingRows;
      if (Array.isArray(offending) && offending.length > 0) {
        setGateOffending(new Set(offending.map((row) => rowKey(row.clientID ?? row.ClientID, row.toolID ?? row.ToolID))));
        toasts.error(error.message || 'Upload a screenshot for every tool you used before submitting.', { title: 'Submission blocked' });
      } else {
        toasts.error(error.message || 'Submission failed.', { title: 'Submission failed' });
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
      toasts.error(error.message || 'Could not save that change.');
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
      toasts.error(error.message || 'Could not save that change.');
    }
  };

  const applyRemark = (clientId, toolId, text) => {
    const toolKey = asToolIdKey(toolId);
    setClients((previous) => previous.map((client) => client.clientID !== clientId ? client : {
      ...client,
      tools: client.tools.map((tool) => asToolIdKey(tool.toolID) !== toolKey ? tool : { ...tool, remarks: text || null }),
    }));
  };

  // Save the inline required remark (Enter or blur with non-empty text).
  const handleSaveInlineRemark = async (clientId, toolId, key, text) => {
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
      toasts.error(error.message || 'Could not save that remark.');
    } finally {
      setSavingRemarkRows((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  };

  const lockedAll = isSubmitted; // whole table goes read-only after submit

  if (loading) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '20px 24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={86} radius="var(--radius-card)" />)}
        </div>
        <Skeleton height={40} style={{ marginBottom: 12 }} />
        <Skeleton height={260} radius="var(--radius-card)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px 28px' }}>
        {/* ── Hero: what's left + due date, Fraunces numerals ─────────────── */}
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon name="shield" size={13} /> Access attestation
              </div>
              <h1 style={{
                margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 560,
                fontSize: 28, lineHeight: 1.1, color: 'var(--text)', letterSpacing: '-0.01em',
              }}>
                {reopened
                  ? `Action needed, ${firstName} — ${rejectedRows.length} screenshot${rejectedRows.length === 1 ? ' was' : 's were'} rejected.`
                  : isSubmitted
                    ? 'All set — your attestation is in.'
                    : totals.pending > 0
                      ? `${totals.pending} tool${totals.pending === 1 ? '' : 's'} left to attest, ${firstName}.`
                      : blockers.length > 0
                        ? `Almost there, ${firstName}.`
                        : `Ready to submit, ${firstName}.`}
              </h1>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13.5, maxWidth: 560, lineHeight: 1.5 }}>
                {reopened
                  ? 'Your reviewer rejected the screenshot(s) below. Re-upload a corrected screenshot to send them back for approval.'
                  : isSubmitted
                    ? 'Rejected screenshots can still be re-uploaded if your reviewer asks.'
                    : <>Confirm access, mark what you actually used, and attach proof
                        {cycle?.dueDate ? <> before <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtDueDate(cycle.dueDate)}</strong></> : null}.</>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
              <Tooltip label={submitDisabledReason || ''} side="bottom">
                <Button variant="primary" icon="check" onClick={handleSubmitAll}
                  loading={submitting} disabled={!canSubmit}
                  aria-label={submitDisabledReason ? `Submit attestation — ${submitDisabledReason}` : 'Submit attestation'}>
                  {isSubmitted ? 'Submitted' : 'Submit attestation'}
                </Button>
              </Tooltip>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, flexWrap: 'wrap' }}>
            <CompletionRing attested={totals.attested} total={totals.total} />
            <div style={{ flex: '1 1 420px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <KpiCard label="Remaining" value={totals.pending} sub={totals.pending > 0 ? 'still to attest' : 'all decided'}
                tone={totals.pending > 0 ? 'warning' : 'success'} />
              <KpiCard label="Clients" value={clients.length} sub={`${totals.used} tools used`} />
              <KpiCard label="Days left" value={cycle?.daysLeft ?? '—'}
                sub={cycle?.dueDate ? `due ${fmtDueDate(cycle.dueDate)}` : undefined}
                tone={(cycle?.daysLeft ?? 99) < 0 ? 'danger' : (cycle?.daysLeft ?? 99) <= 3 ? 'warning' : undefined} />
            </div>
          </div>
        </div>

        {/* ── Load error ──────────────────────────────────────────────────── */}
        {loadError && (
          <Card pad={14} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            borderColor: 'var(--danger-border)', background: 'var(--danger-bg)', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontSize: 13 }}>
              <Icon name="alert" size={16} stroke={2} />
              {loadError}
            </div>
            <Button variant="outline" size="sm" icon="refresh" onClick={() => loadAttestations({ preserveExpansion: true })}>
              Retry
            </Button>
          </Card>
        )}

        {/* ── Reopened panel — rejected screenshots after submit (re-upload) ── */}
        <div aria-live="polite">
          {reopened && (
            <Card pad={0} style={{
              borderColor: 'var(--danger-border)', marginBottom: 16, overflow: 'hidden',
              boxShadow: 'inset 3px 0 0 var(--danger)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                background: 'var(--danger-bg)', borderBottom: '1px solid var(--danger-border)',
              }}>
                <Icon name="alert" size={16} stroke={2.2} style={{ color: 'var(--danger)', flex: 'none' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {rejectedRows.length} rejected screenshot{rejectedRows.length === 1 ? '' : 's'} — re-upload to resubmit
                </div>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rejectedRows.map((b, i) => (
                  <li key={b.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 14px',
                    borderBottom: i < rejectedRows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}>
                    <Icon name="alert" size={14} stroke={2}
                      style={{ color: 'var(--danger)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>{b.clientName} ({b.clientId})</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{b.toolName}</span>
                      {b.reason ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>— {b.reason}</span> : null}
                    </div>
                    <Button variant="ghost" size="sm" icon="arrow_up_right"
                      onClick={() => jumpToRow(b.clientId, b.toolId)}
                      aria-label={`Jump to ${b.toolName} for ${b.clientName}`}>
                      Jump
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ── Blockers panel — the #1 UX fix (DESIGN §10) ─────────────────── */}
        <div aria-live="polite">
          {blockers.length > 0 && (
            <Card pad={0} style={{
              borderColor: 'var(--warning-border)', marginBottom: 16, overflow: 'hidden',
              boxShadow: 'inset 3px 0 0 var(--warning)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                background: 'var(--warning-bg)', borderBottom: '1px solid var(--warning-border)',
              }}>
                <Icon name="clock" size={16} stroke={2.2} style={{ color: 'var(--warning)', flex: 'none' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {blockers.length} final item{blockers.length === 1 ? '' : 's'} before submission
                </div>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {blockers.map((b, i) => (
                  <li key={b.key + b.kind} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 14px',
                    borderBottom: i < blockers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}>
                    <Icon name={BLOCKER_ICON[b.kind] ?? 'alert'} size={14} stroke={2}
                      style={{ color: 'var(--warning)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>{b.clientName} ({b.clientId})</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{b.toolName}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {b.label}</span>
                    </div>
                    <Button variant="ghost" size="sm" icon="arrow_up_right"
                      onClick={() => jumpToRow(b.clientId, b.toolId)}
                      aria-label={`Jump to ${b.toolName} for ${b.clientName}`}>
                      Jump
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ── Toolbar: search ─────────────────────────────────────────────── */}
        {clients.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <SectionHeader>{clients.length} client{clients.length === 1 ? '' : 's'} · {totals.total} tools</SectionHeader>
            <SearchBar value={search} onChange={setSearch} placeholder="Search tools…" width={260} />
          </div>
        )}

        {/* ── Empty / no-match ────────────────────────────────────────────── */}
        {!loadError && visible.length === 0 && (
          <Card pad={0}>
            <EmptyState
              icon={search ? 'search' : 'list'}
              title={search ? 'No tools match' : 'Nothing to attest'}
              message={search ? 'Try a different tool name or ID.' : 'No attestations are available for this cycle.'}
              action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button> : null}
            />
          </Card>
        )}

        {/* ── Client ledgers ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((client) => {
            const open = !!expanded[client.clientID];
            const remaining = (client.totalTools ?? 0) - (client.attestedTools ?? 0);
            return (
              <Card key={client.clientID} pad={0} style={{ overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setExpanded((previous) => ({ ...previous, [client.clientID]: !open }))}
                  aria-expanded={open}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                    padding: '13px 16px', border: 0, background: 'transparent', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit',
                    borderBottom: open ? '1px solid var(--border)' : '1px solid transparent',
                  }}
                >
                  <Icon name="chevright" size={14} stroke={2}
                    style={{ color: 'var(--text-muted)', flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease-out' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {client.clientName}{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                        ({client.clientID})
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2,
                      fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {client.totalTools ?? 0} TOOLS · {client.usedTools ?? 0} USED · {remaining > 0 ? `${remaining} PENDING` : 'ALL ATTESTED'}
                    </div>
                  </div>
                  <div style={{ width: 150, flex: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                      <span>ATTESTED</span>
                      <span style={{ color: 'var(--text)' }}>{client.attestedTools ?? 0}/{client.totalTools ?? 0}</span>
                    </div>
                    <Progress value={client.attestedTools ?? 0} max={client.totalTools ?? 0}
                      tone={remaining > 0 ? 'warning' : 'success'} height={4} />
                  </div>
                </button>

                {open && (
                  <>
                    {isSubmitted && (
                      client.tools.some((t) => t.screenshotStatus === 'Rejected') ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                          background: 'var(--danger-bg)', borderBottom: '1px solid var(--danger-border)',
                          color: 'var(--danger)', fontSize: 12, fontWeight: 600,
                        }}>
                          <Icon name="alert" size={13} stroke={2.4} />
                          Reopened — re-upload the rejected screenshot(s) below.
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                          background: 'var(--success-bg)', borderBottom: '1px solid var(--success-border)',
                          color: 'var(--success)', fontSize: 12, fontWeight: 600,
                        }}>
                          <Icon name="check" size={13} stroke={2.4} />
                          Submitted and locked. Re-upload is only available for rejected screenshots.
                        </div>
                      )
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <Th width={36} align="right">#</Th>
                            <Th>Tool</Th>
                            <Th width={132}>Access?</Th>
                            <Th width={132}>Used?</Th>
                            <Th>Proof / Reason</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {client.tools.map((tool, index) => {
                            const key = rowKey(client.clientID, tool.toolID);
                            const noAccess = tool.hadAccess === false;
                            const notUsed = isNotUsed(tool);
                            const needsReason = noAccessRemarkRows.has(key) || notUsedRemarkRows.has(key);
                            const blocked = blockedRows.has(key) || needsReason || unansweredRows.has(key);
                            const flashing = flashKey === key;
                            return (
                              <tr
                                key={tool.toolID}
                                id={rowDomId(client.clientID, tool.toolID)}
                                aria-invalid={blocked && !isSubmitted ? true : undefined}
                                className="agent-row"
                                style={{
                                  borderBottom: '1px solid var(--border-subtle)',
                                  // Calm blocked styling (DESIGN §10 / A3): keep only a 3px danger
                                  // LEFT-BAR — no full-row danger-bg wash. The "Jump" flash
                                  // (accent glow + accent bar) still takes precedence.
                                  background: flashing ? 'var(--accent-glow)' : 'transparent',
                                  boxShadow: flashing
                                    ? 'inset 3px 0 0 var(--accent)'
                                    : (blocked && !isSubmitted) ? 'inset 3px 0 0 var(--danger)' : 'none',
                                  opacity: lockedAll ? 0.62 : 1,
                                  transition: 'background .3s ease-out, box-shadow .3s ease-out',
                                }}
                              >
                                <td style={{
                                  padding: '10px 14px', textAlign: 'right', verticalAlign: 'top',
                                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}>{index + 1}</td>
                                <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{tool.toolName}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                                    {String(tool.toolID)}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                  <TriToggle
                                    value={tool.hadAccess ?? true}
                                    onChange={(value) => handleToggleHadAccess(client.clientID, tool.toolID, value === null ? true : value)}
                                    labels={['Yes', 'No']}
                                    size="sm"
                                    disabled={lockedAll}
                                  />
                                </td>
                                <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                  {noAccess ? (
                                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>—</span>
                                  ) : (
                                    <TriToggle
                                      value={tool.usedThisCycle}
                                      onChange={(value) => handleToggle(client.clientID, tool.toolID, value)}
                                      disabled={lockedAll}
                                      size="sm"
                                    />
                                  )}
                                </td>
                                <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                  <ProofReasonCell
                                    tool={tool}
                                    clientId={client.clientID}
                                    noAccess={noAccess}
                                    notUsed={notUsed}
                                    needsReason={needsReason}
                                    isSubmitted={isSubmitted}
                                    pastDue={pastDue}
                                    cycle={cycle}
                                    user={user}
                                    draft={notUsedRemarkDrafts[key] ?? ''}
                                    saving={savingRemarkRows.has(key)}
                                    verdictAnim={verdictAnim.has(key)}
                                    onDraft={(v) => setNotUsedRemarkDrafts((p) => ({ ...p, [key]: v }))}
                                    onCommitDraft={(text) => handleSaveInlineRemark(client.clientID, tool.toolID, key, text)}
                                    onOpenRemark={() => setRemarkPane({
                                      cycleId: cycle.cycleID, clientId: client.clientID, clientName: client.clientName,
                                      toolId: tool.toolID, toolName: tool.toolName, initialText: tool.remarks ?? '',
                                    })}
                                    onViewScreenshot={() => setLightboxItems([{
                                      cycleId: cycle.cycleID, associateId: user.associateId,
                                      clientId: client.clientID, clientName: client.clientName,
                                      toolId: tool.toolID, toolName: tool.toolName,
                                      screenshotStatus: tool.screenshotStatus,
                                      screenshotRejectReason: tool.screenshotRejectReason,
                                      screenshotUploadedAt: tool.screenshotUploadedAt,
                                    }])}
                                    focused={focusedRow === key}
                                    onFocus={() => setFocusedRow(key)}
                                    onUploaded={() => loadAttestations({ preserveExpansion: true })}
                                    onError={(message) => toasts.error(message, { title: 'Upload failed' })}
                                    registerPasteTarget={registerPasteTarget}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {remarkPane && (
        <RemarksModal
          pane={remarkPane}
          onClose={() => setRemarkPane(null)}
          onSaved={(text) => {
            applyRemark(remarkPane.clientId, remarkPane.toolId, text);
            toasts.success(text ? 'Remark saved.' : 'Remark cleared.');
          }}
        />
      )}

      {lightboxItems && (
        <Lightbox items={lightboxItems} onClose={() => setLightboxItems(null)} />
      )}
    </div>
  );
}

const BLOCKER_ICON = {
  unanswered: 'half',
  noAccessRemark: 'message',
  notUsedRemark: 'message',
  screenshot: 'camera',
};

// ── CompletionRing — hero progress donut (Task B) ──────────────────────────────
// Inline SVG, ledger palette: accent arc on a --surface-2 track, % in the centre
// in --font-display. Tone shifts to success at 100%. The arc width transitions
// (killed under prefers-reduced-motion by the global rule in index.css — no spin).
function CompletionRing({ attested, total }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, attested / total)) : 0;
  const display = Math.round(pct * 100);
  const complete = total > 0 && attested >= total;
  const SIZE = 104;
  const STROKE = 8;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const arc = complete ? 'var(--success)' : 'var(--accent)';
  const numColor = complete ? 'var(--success)' : 'var(--text)';
  // Combined hero stat: the progress ring AND the "Attested N / total" headline
  // live in ONE card (they describe the same thing — no need for two boxes).
  return (
    <Card pad={18} style={{
      display: 'flex', alignItems: 'center', gap: 20,
      flex: 'none', minWidth: 300,
    }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flex: 'none' }}
        role="img" aria-label={`${display}% complete — ${attested} of ${total} tools attested`}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none"
            stroke={arc} strokeWidth={STROKE}
            /* round cap looks good mid-progress, but at 100% it overlaps the
               seam and leaves a nub — switch to a flush butt cap when complete. */
            strokeLinecap={complete ? 'butt' : 'round'}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            style={{ transition: 'stroke-dashoffset .4s ease-out, stroke .2s ease-out' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 560, fontSize: 27, lineHeight: 1,
            color: numColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>{display}<span style={{ fontSize: 15 }}>%</span></span>
        </div>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-faint)',
        }}>Attested</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 540, lineHeight: 1,
            color: numColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>{attested}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}>/ {total}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {complete ? 'all tools attested' : `of ${total} tools`}
        </span>
      </div>
    </Card>
  );
}

// ── Proof / Reason cell — the right-most "question answer" column ───────────────
// EVERY row renders the SAME two-slot layout so the column lines up vertically
// down the table (DESIGN §10 / fix A1):
//   [ PROOF slot — fixed width ] [ NOTE slot ]
//
//   PROOF slot:
//     used / undecided-with-access → the ScreenshotCell upload/status control.
//     no-access / not-used         → an em-dash placeholder, OR a small "view"
//                                     affordance if a stale screenshot exists
//                                     (uploaded before the row flipped).
//   NOTE slot:
//     required-reason rows → the inline required reason input (DESIGN §10).
//     everything else      → the remark chip (required-tinted where mandatory).
const PROOF_SLOT_WIDTH = 156; // fixed → vertical alignment across every row state.

function ProofReasonCell({
  tool, clientId, noAccess, notUsed, needsReason, isSubmitted, pastDue, cycle, user,
  draft, saving, verdictAnim, onDraft, onCommitDraft, onOpenRemark, onViewScreenshot,
  focused, onFocus, onUploaded, onError, registerPasteTarget,
}) {
  const isProofRow = !noAccess && !notUsed; // used / undecided-with-access
  // A screenshot is only REQUIRED on a used row whose tool is flagged screenshotRequired.
  // Optional tools (and exempt rows) still get an upload control, presented as optional.
  const requiresProof = isProofRow && tool.usedThisCycle === true && tool.screenshotRequired === true;
  const needsInlineReason = (noAccess || notUsed) && needsReason && !isSubmitted;

  // ── PROOF slot (fixed width) ────────────────────────────────────────────────
  // EVERY row renders the ScreenshotCell — on a no-access / not-used row the upload
  // is OPTIONAL (the required reason lives in the NOTE slot), so it shows a softer
  // "Attach (optional)" tile. The cell already handles the thumbnail + view
  // affordance when a screenshot exists.
  const proofSlot = (
    <ScreenshotCell
      cycleId={cycle.cycleID}
      associateId={user.associateId}
      clientId={clientId}
      toolId={tool.toolID}
      screenshotStatus={tool.screenshotStatus}
      screenshotRejectReason={tool.screenshotRejectReason}
      screenshotUploadedAt={tool.screenshotUploadedAt}
      readOnly={isSubmitted || pastDue}
      optional={!requiresProof}
      isFocused={focused}
      verdictAnim={verdictAnim}
      onFocus={onFocus}
      onUploaded={onUploaded}
      onError={onError}
      onView={onViewScreenshot}
      registerPasteTarget={registerPasteTarget}
    />
  );

  // ── NOTE slot ───────────────────────────────────────────────────────────────
  let noteSlot;
  if (needsInlineReason) {
    const commit = () => onCommitDraft(draft);
    noteSlot = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 200, maxWidth: 320 }}>
        <input
          type="text"
          value={draft}
          placeholder={noAccess ? 'Why no access this cycle?' : "Why wasn't this tool used?"}
          maxLength={500}
          disabled={saving}
          aria-invalid
          aria-label={noAccess ? 'Reason for no access (required)' : 'Reason not used (required)'}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          onBlur={commit}
          style={{
            width: '100%', minWidth: 0, height: 28, padding: '0 8px', borderRadius: 'var(--radius)',
            border: '1px solid var(--danger-border)', background: 'var(--surface)', color: 'var(--text)',
            fontSize: 12, fontFamily: 'inherit', outline: 'none', opacity: saving ? 0.6 : 1,
          }}
        />
        <span style={{ fontSize: 10.5, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="alert" size={11} stroke={2.2} />
          {saving ? 'Saving…' : `Required — ${noAccess ? 'explain why you had no access' : "explain why you didn't use this tool"}`}
        </span>
      </div>
    );
  } else {
    // Remark chip — required-tinted when a no-access/not-used row mandates it.
    noteSlot = (
      <RemarkChip text={tool.remarks} disabled={isSubmitted} onClick={onOpenRemark}
        required={noAccess || notUsed} />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: PROOF_SLOT_WIDTH, flex: 'none', display: 'flex', alignItems: 'center', minHeight: 28 }}>
        {proofSlot}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', minHeight: 28 }}>
        {noteSlot}
      </div>
    </div>
  );
}

// Saved-remark chip / "add remark" affordance. `required` tints it when empty.
function RemarkChip({ text, disabled, onClick, required = false }) {
  const has = !!(text && String(text).trim());
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Locked' : has ? text : 'Add a remark'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 200,
        height: 26, padding: '0 8px', borderRadius: 'var(--radius)',
        border: `1px solid ${has ? 'var(--accent)' : required ? 'var(--danger-border)' : 'var(--border)'}`,
        background: has ? 'var(--accent-glow)' : 'var(--surface)',
        color: has ? 'var(--accent)' : required ? 'var(--danger)' : 'var(--text-muted)',
        fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name="message" size={12} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {has ? text : 'Add remark'}
      </span>
    </button>
  );
}
