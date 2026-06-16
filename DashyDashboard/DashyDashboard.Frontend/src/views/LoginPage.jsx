import React, { useState } from 'react';
import { login } from '../api/auth.js';
import { Button } from '../components/ui.jsx';

// Ledger-language sign-in screen (DESIGN §7 / §10). Paper card, Fraunces wordmark,
// mono overlines, hairline rule. Tokens only — no hex literals.
function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div
        className="pop-in"
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-pop)',
          padding: '40px 36px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Brand block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
          }}>
            Broadridge BPO
          </span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 560,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'var(--text)',
          }}>
            Access Review
          </span>
        </div>

        <div style={{ height: 1, background: 'var(--rule)', marginBottom: 22 }} />

        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div role="alert" style={{
      fontSize: 13,
      color: 'var(--danger)',
      background: 'var(--danger-bg)',
      border: '1px solid var(--danger-border)',
      borderRadius: 'var(--radius)',
      padding: '9px 12px',
      lineHeight: 1.45,
    }}>
      {message}
    </div>
  );
}

function Field({ id, label, type, value, onChange, autoComplete, autoFocus, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 40,
          padding: '0 12px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
          transition: 'border-color .14s, box-shadow .14s',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--accent)';
          e.target.style.boxShadow = '0 0 0 3px var(--accent-glow)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border)';
          e.target.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}

export default function LoginPage({
  onLogin,
  error = '',
  onRetry,
  canUsePasswordLogin = false,
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim()) {
      setSubmitError('Please enter your user name.');
      return;
    }
    setSubmitError('');
    setLoading(true);
    try {
      const response = await login(username, password);
      await onLogin(response);
    } catch (requestError) {
      setSubmitError(requestError.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const activeError = submitError || error;

  if (!canUsePasswordLogin) {
    return (
      <Shell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Use your company sign-in to continue.
          </p>
          <ErrorBanner message={activeError} />
          <Button variant="primary" size="md" onClick={onRetry} style={{ width: '100%', justifyContent: 'center' }}>
            Try again
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
          Company sign-in is preferred. Use the local sign-in below only when developer
          mode is enabled.
        </p>
        <Field
          id="login-username"
          label="User name"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={setUsername}
          placeholder="Enter your user name"
        />
        <Field
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
        />
        <ErrorBanner message={activeError} />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={loading}
          style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Shell>
  );
}
