import React, { useEffect, useMemo, useState } from 'react';
import { Icon, TriToggle, Progress, Button, TopBar } from '../components/ui.jsx';
import { getMyAttestations, toggleUsed, toggleHadAccess, submitAll } from '../api/attestations.js';
import RemarksModal from '../components/RemarksModal.jsx';
import { asToolIdKey } from '../lib/contracts.js';

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

export default function AgentView({ user, cycle, cycles, onCycle, onLogout, isManager, role, onRole, dark, onDark }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [remarkPane, setRemarkPane] = useState(null);

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

  const totals = useMemo(() => {
    let total = 0;
    let attested = 0;
    clients.forEach((client) => {
      total += client.totalTools;
      attested += client.attestedTools;
    });
    return { total, attested, pending: total - attested };
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

    const hasAnyMarked = clients.some((client) =>
      client.tools.some((tool) => tool.usedThisCycle !== null && tool.usedThisCycle !== undefined)
    );

    if (!hasAnyMarked) {
      flashToast('warn', 'Mark at least one tool as used or not used first.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAll(cycle.cycleID, null);
      await loadAttestations({ preserveExpansion: true });
      flashToast('ok', result?.summary ?? 'Attestation submitted and saved.');
    } catch (error) {
      flashToast('err', error.message || 'Submission failed.');
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
        return sum + (used !== null && used !== undefined ? 1 : 0);
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

    setClients((previous) => previous.map((client) => client.clientID !== clientId ? client : {
      ...client,
      tools: client.tools.map((tool) => asToolIdKey(tool.toolID) !== toolKey ? tool : {
        ...tool,
        hadAccess: value,
        usedThisCycle: value === false ? null : tool.usedThisCycle,
      }),
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
            <Icon name="shield" size={13} /> Biweekly access review
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
            variant="primary"
            size="sm"
            icon="check"
            onClick={handleSubmitAll}
            style={{ justifyContent: 'center', opacity: submitting ? 0.7 : 1, cursor: submitting ? 'wait' : 'pointer' }}
          >
            {submitting ? 'Submitting...' : 'Submit attestation'}
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
                    {client.clientName}
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
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        {['Tool', 'Had access?', 'Did you use?', 'Remark'].map((heading) => (
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
                        const pending = tool.usedThisCycle === null || tool.usedThisCycle === undefined;
                        return (
                          <tr key={tool.toolID} style={{
                            background: pending
                              ? 'color-mix(in oklab, var(--warning-bg), transparent 50%)'
                              : index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}>
                            <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                              {tool.toolName}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <TriToggle
                                value={tool.hadAccess ?? true}
                                onChange={(value) => handleToggleHadAccess(client.clientID, tool.toolID, value)}
                                labels={['Yes', 'No']}
                                size="sm"
                              />
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <TriToggle
                                value={tool.usedThisCycle}
                                onChange={(value) => handleToggle(client.clientID, tool.toolID, value)}
                                disabled={tool.hadAccess === false}
                                style={tool.hadAccess === false ? { opacity: 0.35, pointerEvents: 'none' } : {}}
                                size="sm"
                              />
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {(() => {
                                const hasRemark = !!tool.remarks;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setRemarkPane({
                                      cycleId: cycle.cycleID,
                                      clientId: client.clientID,
                                      clientName: client.clientName,
                                      toolId: tool.toolID,
                                      toolName: tool.toolName,
                                      accent,
                                      initialText: tool.remarks ?? '',
                                    })}
                                    title={hasRemark ? tool.remarks : 'Add a remark'}
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
                                      cursor: 'pointer',
                                      fontFamily: 'inherit',
                                      maxWidth: 200,
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
    </div>
  );
}
