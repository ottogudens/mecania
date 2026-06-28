import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/api/operations/login/', {
        username: email, // Using email state for username field
        password: password
      });

      const { token, role: backendRole } = response.data;
      
      // Store token and role
      localStorage.setItem('token', token);
      localStorage.setItem('role', backendRole);
      
      onLogin(backendRole, token);
      navigate('/');
    } catch (err) {
      setError('Credenciales inválidas. Por favor intente de nuevo.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
      <div className="glass-card login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', color: 'var(--primary-color)' }}>AutoMaster ERP</h2>
          <p style={{ color: 'var(--text-muted)' }}>Bienvenido al sistema de gestión</p>
        </div>



        {error && (
          <div style={{ color: '#ff4c4c', background: 'rgba(255, 76, 76, 0.1)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="input-group">
            <label style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Usuario / Email</label>
            <input 
              type="text" 
              className="glass-input" 
              placeholder="usuario / email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Contraseña</label>
            <input 
              type="password" 
              className="glass-input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn" style={{ marginTop: '1rem', width: '100%' }} disabled={loading}>
            {loading ? 'Iniciando Sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
