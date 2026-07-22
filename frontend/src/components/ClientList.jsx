import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ClientList = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('client_view_mode') || 'grid');

  useEffect(() => {
    fetchClients();
  }, []);

  const [newClient, setNewClient] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: ''
  });

  const [newVehicle, setNewVehicle] = useState({
    license_plate: '',
    make: '',
    model: '',
    year: '',
    color: '',
    transmission_type: 'MANUAL',
    fuel_type: 'GASOLINE',
    vin: '',
    engine_number: '',
    engine_displacement: '',
    mileage: ''
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
      setClients(response.data.results || response.data);
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
      if (isEditingClient) {
        await axios.put(`/api/operations/clients/${editingClientId}/`, newClient, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("¡Cliente actualizado con éxito!");
      } else {
        await axios.post('/api/operations/clients/', newClient, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("¡Cliente creado con éxito!");
      }
      setShowModal(false);
      setIsEditingClient(false);
      setEditingClientId(null);
      setNewClient({ first_name: '', last_name: '', email: '', phone: '', address: '' });
      fetchClients();
    } catch (err) {
      console.error(err);
      alert("Error al guardar cliente. Verifica los datos.");
    }
  };

  const openNewClientModal = () => {
    setIsEditingClient(false);
    setEditingClientId(null);
    setNewClient({ first_name: '', last_name: '', email: '', phone: '', address: '' });
    setShowModal(true);
  };

  const openEditClientModal = (client) => {
    setIsEditingClient(true);
    setEditingClientId(client.id);
    setNewClient({
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email || '',
      phone: client.phone,
      address: client.address || ''
    });
    setShowModal(true);
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este cliente? Se eliminarán también sus vehículos y OTs asociadas.")) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/clients/${id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      alert("Cliente eliminado con éxito.");
      fetchClients();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar cliente.");
    }
  };

  const handleVehicleSubmit = async (e) => {
    e.preventDefault();
    const cleanedPlate = newVehicle.license_plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const plateRegex = /^[A-Z]{2}\d{4}$|^[A-Z]{4}\d{2}$/;
    if (!plateRegex.test(cleanedPlate)) {
      alert("La patente debe tener formato válido chileno: 2 letras y 4 números (ej. AB1234) o 4 letras y 2 números (ej. ABCD12).");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/operations/vehicles/', {
        ...newVehicle,
        license_plate: cleanedPlate,
        client_id: selectedClientId
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      setShowVehicleModal(false);
      setNewVehicle({ 
        license_plate: '', make: '', model: '', year: '', color: '', 
        transmission_type: 'MANUAL', fuel_type: 'GASOLINE', vin: '', 
        engine_number: '', engine_displacement: '', mileage: '' 
      });
      alert("¡Vehículo registrado con éxito!");
      fetchClients();
    } catch (err) {
      console.error(err);
      alert("Error al registrar vehículo.");
    }
  };

  const openVehicleModal = (clientId) => {
    setSelectedClientId(clientId);
    setShowVehicleModal(true);
  };

  const filteredClients = clients.filter(c => 
    (c.first_name + ' ' + c.last_name).toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.phone && c.phone.includes(searchQuery))
  );

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Clientes...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="client-list">
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2>Directorio de Clientes</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View selector */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <button 
              type="button"
              onClick={() => { setViewMode('grid'); localStorage.setItem('client_view_mode', 'grid'); }}
              style={{
                padding: '0.5rem 0.9rem', border: 'none', cursor: 'pointer',
                background: viewMode === 'grid' ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                color: viewMode === 'grid' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'grid' ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
              }}
            >
              🎴 Tarjetas
            </button>
            <button 
              type="button"
              onClick={() => { setViewMode('list'); localStorage.setItem('client_view_mode', 'list'); }}
              style={{
                padding: '0.5rem 0.9rem', border: 'none', cursor: 'pointer',
                background: viewMode === 'list' ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                color: viewMode === 'list' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'list' ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
              }}
            >
              📄 Lista Detallada
            </button>
          </div>

          <input 
            type="text" 
            className="glass-input" 
            placeholder="Buscar por nombre o teléfono..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '240px' }}
          />
          <button className="btn" onClick={openNewClientModal}>+ Nuevo Cliente</button>
        </div>
      </div>

      {filteredClients.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No hay clientes registrados o coincidentes.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── Vista de Lista Detallada ── */
        <div className="glass-card" style={{ padding: '1rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.8rem 1rem' }}>Cliente</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Contacto & Dirección</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Vehículos</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Portal Cliente</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => (
                  <tr key={client.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {client.first_name} {client.last_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID #{client.id} {client.rut ? `• ${client.rut}` : ''}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>📞 {client.phone}</span>
                        {client.email && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>✉️ {client.email}</span>}
                        {client.address && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>📍 {client.address}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span className="badge blue" style={{ fontSize: '0.85rem' }}>
                        🚗 {client.vehicle_count || 0}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {client.portal_enabled ? (
                        <span className="badge green" style={{ fontSize: '0.75rem' }}>Activo (PIN)</span>
                      ) : (
                        <span className="badge pending" style={{ fontSize: '0.75rem' }}>Inactivo</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => openVehicleModal(client.id)} title="Añadir Vehículo">
                          + Vehículo
                        </button>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => openEditClientModal(client)} title="Editar">
                          ✏️
                        </button>
                        <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDeleteClient(client.id)} title="Eliminar">
                          🗑️
                        </button>
                        {client.portal_enabled ? (
                          <button 
                            className="btn btn-outline" 
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderColor: 'rgba(59,130,246,0.4)', color: '#60a5fa' }} 
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                const res = await axios.post(`/api/operations/clients/${client.id}/resend_pin/`, {}, {
                                  headers: { Authorization: `Token ${token}` }
                                });
                                alert(`PIN regenerado y enviado. Nuevo PIN: ${res.data.pin}`);
                                fetchClients();
                              } catch (err) {
                                alert(err.response?.data?.error || "Error al reenviar credenciales.");
                              }
                            }}
                          >
                            🔄 PIN
                          </button>
                        ) : (
                          <button 
                            className="btn" 
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', backgroundColor: '#25D366', color: '#fff', border: 'none' }}
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                const res = await axios.post(`/api/operations/clients/${client.id}/send_credentials/`, {}, {
                                  headers: { Authorization: `Token ${token}` }
                                });
                                alert(`Portal habilitado con éxito. PIN generado: ${res.data.pin}. Mensaje de WhatsApp enviado.`);
                                fetchClients();
                              } catch (err) {
                                alert(err.response?.data?.error || "Error al habilitar portal.");
                              }
                            }}
                          >
                            📲 Portal WA
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Vista de Tarjetas ── */
        <div className="grid-container">
          {filteredClients.map(client => (
            <div key={client.id} className="glass-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => openEditClientModal(client)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                  title="Editar Cliente"
                >
                  ✏️
                </button>
                <button 
                  onClick={() => handleDeleteClient(client.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0, color: 'red' }}
                  title="Eliminar Cliente"
                >
                  🗑️
                </button>
              </div>
              
              <h3>{client.first_name} {client.last_name}</h3>
              <p style={{ color: 'var(--text-muted)' }}>📞 {client.phone}</p>
              <p style={{ color: 'var(--text-muted)' }}>✉️ {client.email || 'Sin correo'}</p>
              <p style={{ color: 'var(--text-muted)' }}>
                🚗 {client.vehicle_count || 0} Vehículos
              </p>
              <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                🔑 Portal: {client.portal_enabled ? (
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Activo (PIN establecido)</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Inactivo</span>
                )}
              </p>

              <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => openVehicleModal(client.id)}>+ Vehículo</button>
                </div>
                
                {client.portal_enabled ? (
                  <button 
                    className="btn btn-outline" 
                    style={{ fontSize: '0.8rem', padding: '0.4rem', borderColor: 'rgba(59,130,246,0.4)', color: '#60a5fa' }} 
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const res = await axios.post(`/api/operations/clients/${client.id}/resend_pin/`, {}, {
                          headers: { Authorization: `Token ${token}` }
                        });
                        alert(`PIN regenerado y enviado. Nuevo PIN: ${res.data.pin}`);
                        fetchClients();
                      } catch (err) {
                        alert(err.response?.data?.error || "Error al reenviar credenciales.");
                      }
                    }}
                  >
                    🔄 Re-enviar PIN (WhatsApp)
                  </button>
                ) : (
                  <button 
                    className="btn" 
                    style={{ fontSize: '0.8rem', padding: '0.4rem', backgroundColor: '#25D366', color: '#fff', border: 'none' }}
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const res = await axios.post(`/api/operations/clients/${client.id}/send_credentials/`, {}, {
                          headers: { Authorization: `Token ${token}` }
                        });
                        alert(`Portal habilitado con éxito. PIN generado: ${res.data.pin}. Mensaje de WhatsApp enviado.`);
                        fetchClients();
                      } catch (err) {
                        alert(err.response?.data?.error || "Error al habilitar portal.");
                      }
                    }}
                  >
                    📲 Habilitar Portal (WhatsApp)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for New/Edit Client */}
      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{isEditingClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}</h3>
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Nombre *</label>
                  <input type="text" name="first_name" required value={newClient.first_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Apellido (Opcional)</label>
                  <input type="text" name="last_name" value={newClient.last_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Teléfono WhatsApp *</label>
                <input type="text" name="phone" required placeholder="+56912345678" value={newClient.phone} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Correo Electrónico (Opcional)</label>
                <input type="email" name="email" value={newClient.email} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Dirección</label>
                <input type="text" name="address" value={newClient.address} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn">{isEditingClient ? 'Actualizar Cliente' : 'Guardar Cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for New Vehicle */}
      {showVehicleModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Añadir Vehículo</h3>
              <button 
                onClick={() => setShowVehicleModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleVehicleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Patente (Placa) *</label>
                <input type="text" required value={newVehicle.license_plate} onChange={e => setNewVehicle({...newVehicle, license_plate: e.target.value})} className="input-field" style={{ width: '100%', textTransform: 'uppercase' }} placeholder="AB12CD" />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Marca *</label>
                  <input type="text" required value={newVehicle.make} onChange={e => setNewVehicle({...newVehicle, make: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Toyota" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Modelo *</label>
                  <input type="text" required value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Yaris" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Año *</label>
                  <input type="number" required value={newVehicle.year} onChange={e => setNewVehicle({...newVehicle, year: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="2020" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Color</label>
                  <input type="text" value={newVehicle.color} onChange={e => setNewVehicle({...newVehicle, color: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Rojo, Azul, etc." />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Transmisión *</label>
                  <select required value={newVehicle.transmission_type} onChange={e => setNewVehicle({...newVehicle, transmission_type: e.target.value})} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                    <option value="MANUAL">Manual</option>
                    <option value="AUTOMATIC">Automática</option>
                    <option value="CVT">CVT</option>
                    <option value="DCT">Doble Embrague</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Combustible *</label>
                  <select required value={newVehicle.fuel_type} onChange={e => setNewVehicle({...newVehicle, fuel_type: e.target.value})} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                    <option value="GASOLINE">Gasolina</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="HYBRID">Híbrido</option>
                    <option value="ELECTRIC">Eléctrico</option>
                    <option value="GNC_GLP">Gas (GNC/GLP)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Número VIN</label>
                  <input type="text" value={newVehicle.vin} onChange={e => setNewVehicle({...newVehicle, vin: e.target.value})} className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Número de Motor</label>
                  <input type="text" value={newVehicle.engine_number} onChange={e => setNewVehicle({...newVehicle, engine_number: e.target.value})} className="input-field" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Cilindrada Motor</label>
                  <input type="text" value={newVehicle.engine_displacement} onChange={e => setNewVehicle({...newVehicle, engine_displacement: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="2.0L" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Kilometraje Inicial (Opcional)</label>
                  <input type="number" value={newVehicle.mileage} onChange={e => setNewVehicle({...newVehicle, mileage: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Ej: 100000" />
                </div>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowVehicleModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Guardar Vehículo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientList;
