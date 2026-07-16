import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';


const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/api/operations/login/', {
        username,
        password,
      });

      const { token, role: backendRole, username: backendUsername } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('role', backendRole);
      localStorage.setItem('username', backendUsername || username);

      toast({
        title: '¡Bienvenido!',
        message: `Sesión iniciada como ${backendUsername || username}`,
        type: 'success',
      });

      onLogin(backendRole, token, backendUsername || username);
    } catch (err) {
      const msg = err.response?.data?.error || 'Credenciales inválidas. Intente de nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card animate-fade-up">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon" style={{ background: 'transparent', boxShadow: 'none' }}>
            <img src="/assets/logo.png" alt="MecanIA Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
          </div>
          <div className="login-brand">MecanIA</div>
          <div className="login-tagline">Sistema de Gestión para Talleres Automotrices</div>
        </div>

        {/* Error */}
        {error && (
          <div className="login-error">
            <span>⚠</span>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="login-username">Usuario</label>
            <input
              id="login-username"
              type="text"
              className="glass-input"
              placeholder="nombre de usuario"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              className="glass-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-lg"
            style={{ marginTop: '0.5rem', width: '100%' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Iniciando sesión...
              </>
            ) : 'Iniciar Sesión'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ height: '1px', backgroundColor: 'var(--border-muted)', flex: 1 }}></span>
            <span style={{ padding: '0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>¿Eres Mecánico?</span>
            <span style={{ height: '1px', backgroundColor: 'var(--border-muted)', flex: 1 }}></span>
          </div>
          <Link to="/mechanic" className="btn btn-outline" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
            🛠️ Portal de Mecánicos
          </Link>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '2rem',
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)',
          lineHeight: '1.6'
        }}>
          MecanIA v2.0 — Taller Automotriz Inteligente<br />
          <span style={{ color: 'var(--primary)', opacity: 0.6 }}>Powered by AI</span>
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;
