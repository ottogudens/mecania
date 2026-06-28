import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ClientList = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/clients/', {
        headers: { Authorization: `Token ${token}` }
      });
      setClients(response.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar clientes.");
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Clientes...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="client-list">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Directorio de Clientes</h2>
        <button className="btn">Nuevo Cliente</button>
      </div>

      {clients.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p>No hay clientes registrados.</p>
        </div>
      ) : (
        <div className="grid-container">
          {clients.map(client => (
            <div key={client.id} className="glass-card">
              <h3>{client.first_name} {client.last_name}</h3>
              <p style={{ color: 'var(--text-muted)' }}>📞 {client.phone}</p>
              <p style={{ color: 'var(--text-muted)' }}>✉️ {client.email || 'Sin correo'}</p>
              <div style={{ marginTop: '1rem' }}>
                <button className="btn btn-outline" style={{ width: '100%' }}>Ver Historial</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientList;
