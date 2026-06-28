import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ClientPortal = () => {
  const [phone, setPhone] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientData, setClientData] = useState([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (phone) {
      setLoading(true);
      setError('');
      try {
        await axios.post('http://localhost:8000/api/operations/client/login/', { phone });
        setAuthenticated(true);
        fetchClientData();
      } catch (err) {
        setError(err.response?.data?.error || 'Error de conexión');
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchClientData = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/operations/client/data/?phone=${phone}`);
      setClientData(response.data);
    } catch (err) {
      console.error("Error fetching client data:", err);
    }
  };

  if (!authenticated) {
    return (
      <div className="glass-card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Acceso al Portal de Clientes</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Ingresa tu número de WhatsApp para recibir un enlace de acceso seguro.
        </p>
        {error && (
          <div style={{ color: '#ff4c4c', background: 'rgba(255, 76, 76, 0.1)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
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
            required
          />
          <button type="submit" className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar Enlace de Acceso'}
          </button>
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
      
      {clientData.length === 0 ? (
        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron vehículos o servicios.</p>
      ) : (
        clientData.map((data, idx) => (
          <div key={idx} style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div className="ot-header">
              <h3 style={{ color: '#fff' }}>{data.vehicle.make} {data.vehicle.model} ({data.vehicle.license_plate})</h3>
              {data.active_orders.length > 0 && (
                <span className={`badge ${data.active_orders[0].raw_status.toLowerCase()}`}>
                  {data.active_orders[0].status}
                </span>
              )}
            </div>
            
            {data.active_orders.length > 0 ? (
              <>
                <p style={{ color: 'var(--text-muted)' }}>Servicio: {data.active_orders[0].service}</p>
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                  <button className="btn" style={{ flex: 1 }}>Ver Reporte de Inspección</button>
                  <button className="btn btn-outline" style={{ flex: 1 }}>Contactar Asesor</button>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No hay órdenes activas para este vehículo.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default ClientPortal;
