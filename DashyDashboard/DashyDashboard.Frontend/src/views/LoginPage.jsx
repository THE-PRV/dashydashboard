import React, { useState } from 'react';
import { login } from '../api/auth.js';

function Shell({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '36px 32px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent), black 25%))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 22,
            marginBottom: 16,
          }}>
            B
          </div>
          <div style={{
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.2,
            textAlign: 'center',
          }}>
            {title}
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            {subtitle}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;

  return (
    <div style={{
      fontSize: 13,
      color: 'var(--danger-fg)',
      background: 'color-mix(in oklab, var(--danger-fg), transparent 88%)',
      border: '1px solid color-mix(in oklab, var(--danger-fg), transparent 70%)',
      borderRadius: 8,
      padding: '8px 12px',
      lineHeight: 1.4,
    }}>
      {message}
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
      setSubmitError('Please enter your username.');
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
      <Shell
        title="Access Review"
        subtitle="Use your company sign-in to continue."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorBanner message={activeError} />
          <button
            type="button"
            onClick={onRetry}
            style={{
              height: 40,
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Access Review"
      subtitle="Company sign-in is preferred. Use the local sign-in below only when developer mode is enabled."
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="login-username" style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '0.01em',
          }}>
            User name
          </label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your user name"
            style={{
              height: 38,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color .12s',
            }}
            onFocus={(event) => { event.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(event) => { event.target.style.borderColor = 'var(--border)'; }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="login-password" style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '0.01em',
          }}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            style={{
              height: 38,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color .12s',
            }}
            onFocus={(event) => { event.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(event) => { event.target.style.borderColor = 'var(--border)'; }}
          />
        </div>

        <ErrorBanner message={activeError} />

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            height: 40,
            width: '100%',
            borderRadius: 8,
            border: '1px solid var(--accent)',
            background: loading ? 'color-mix(in oklab, var(--accent), transparent 30%)' : 'var(--accent)',
            color: 'var(--accent-fg)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background .12s, opacity .12s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}
