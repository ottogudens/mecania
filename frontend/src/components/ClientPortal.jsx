import React, { useState } from 'react';

const ClientPortal = () => {
  const [phone, setPhone] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (phone) {
      // In a real app, this would verify the magic link token
      setAuthenticated(true);
    }
  };

  if (!authenticated) {
    return (
      <div className="glass-card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Acceso al Portal de Clientes</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Ingresa tu número de WhatsApp para recibir un enlace de acceso seguro.
        </p>
        <form onSubmit={handleLogin}>
          <input 
            type="tel" 
            placeholder="+1 234 567 8900" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ 
              width: '100%', padding: '0.75rem', borderRadius: '8px', 
              border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', marginBottom: '1.5rem', fontFamily: 'Outfit'
            }}
          />
          <button type="submit" className="btn" style={{ width: '100%' }}>Enviar Enlace de Acceso</button>
        </form>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div className="header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <h2>Mis Vehículos y Servicios</h2>
        <button className="btn btn-outline" onClick={() => setAuthenticated(false)}>Cerrar Sesión</button>
      </div>
      
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        <div className="ot-header">
          <h3 style={{ color: '#fff' }}>Toyota Corolla (AB-12-CD)</h3>
          <span className="badge in_progress">EN PROGRESO</span>
        </div>
        <p style={{ color: 'var(--text-muted)' }}>Servicio: Mantenimiento Completo</p>
        
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="btn" style={{ flex: 1 }}>Ver Reporte de Inspección</button>
          <button className="btn btn-outline" style={{ flex: 1 }}>Aprobar Cotización ($150)</button>
        </div>
      </div>
    </div>
  );
};

export default ClientPortal;
