import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ClientList = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: ''
  });

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

  const handleInputChange = (e) => {
    setNewClient({
      ...newClient,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/operations/clients/', newClient, {
        headers: { Authorization: `Token ${token}` }
      });
      setShowModal(false);
      setNewClient({ first_name: '', last_name: '', email: '', phone: '', address: '' });
      fetchClients();
      alert("¡Cliente creado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al crear cliente. Verifica los datos.");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Clientes...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="client-list">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Directorio de Clientes</h2>
        <button className="btn" onClick={() => setShowModal(true)}>Nuevo Cliente</button>
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

      {/* Modal for New Client */}
      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Registrar Nuevo Cliente</h3>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Nombre</label>
                  <input type="text" name="first_name" required value={newClient.first_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Apellido</label>
                  <input type="text" name="last_name" required value={newClient.last_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Teléfono (WhatsApp)</label>
                <input type="text" name="phone" required placeholder="+56912345678" value={newClient.phone} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Correo Electrónico</label>
                <input type="email" name="email" value={newClient.email} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Dirección</label>
                <input type="text" name="address" value={newClient.address} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Guardar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientList;
