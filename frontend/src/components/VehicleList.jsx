import React, { useState, useEffect } from 'react';
import axios from 'axios';

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentVehicle, setCurrentVehicle] = useState({
    id: null,
    license_plate: '',
    make: '',
    model: '',
    year: '',
    color: '',
    client_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [vehiclesRes, clientsRes] = await Promise.all([
        axios.get('/api/operations/vehicles/', { headers: { Authorization: `Token ${token}` } }),
        axios.get('/api/operations/clients/', { headers: { Authorization: `Token ${token}` } })
      ]);
      setVehicles(vehiclesRes.data.results || vehiclesRes.data);
      setClients(clientsRes.data.results || clientsRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar los datos.");
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setCurrentVehicle({
      ...currentVehicle,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = {
        license_plate: currentVehicle.license_plate,
        make: currentVehicle.make,
        model: currentVehicle.model,
        year: currentVehicle.year,
        color: currentVehicle.color,
        client_id: currentVehicle.client_id || null
      };

      if (isEditing) {
        await axios.patch(`/api/operations/vehicles/${currentVehicle.id}/`, payload, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("¡Vehículo actualizado con éxito!");
      } else {
        await axios.post('/api/operations/vehicles/', payload, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("¡Vehículo creado con éxito!");
      }
      
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al guardar el vehículo. Verifica los datos.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este vehículo? Esto también podría eliminar las OTs asociadas.")) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/vehicles/${id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      alert("Vehículo eliminado correctamente.");
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el vehículo.");
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setCurrentVehicle({
      id: null, license_plate: '', make: '', model: '', year: '', color: '', client_id: ''
    });
    setShowModal(true);
  };

  const openEditModal = (vehicle) => {
    setIsEditing(true);
    setCurrentVehicle({
      id: vehicle.id,
      license_plate: vehicle.license_plate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color || '',
      client_id: vehicle.client ? vehicle.client.id : ''
    });
    setShowModal(true);
  };

  const filteredVehicles = vehicles.filter(v => 
    v.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Vehículos...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="vehicle-list">
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Directorio de Vehículos</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Buscar por placa, marca o modelo..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn" onClick={openNewModal}>Nuevo Vehículo</button>
        </div>
      </div>

      {filteredVehicles.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p>No hay vehículos registrados.</p>
        </div>
      ) : (
        <div className="grid-container">
          {filteredVehicles.map(vehicle => (
            <div key={vehicle.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => openEditModal(vehicle)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                  title="Editar"
                >
                  ✏️
                </button>
                <button 
                  onClick={() => handleDelete(vehicle.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                  title="Eliminar"
                >
                  🗑️
                </button>
              </div>
              
              <h3 style={{ textTransform: 'uppercase' }}>🚗 {vehicle.license_plate}</h3>
              <p><strong>Marca:</strong> {vehicle.make}</p>
              <p><strong>Modelo:</strong> {vehicle.model}</p>
              <p><strong>Año:</strong> {vehicle.year}</p>
              {vehicle.color && <p><strong>Color:</strong> {vehicle.color}</p>}
              
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {vehicle.client ? (
                  <>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Propietario:</p>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{vehicle.client.first_name} {vehicle.client.last_name}</p>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>📞 {vehicle.client.phone}</p>
                  </>
                ) : (
                  <p style={{ color: 'var(--status-yellow)' }}>⚠️ Sin propietario asignado</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for New/Edit Vehicle */}
      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{isEditing ? 'Editar Vehículo' : 'Añadir Vehículo'}</h3>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Patente (Placa)</label>
                <input type="text" name="license_plate" required value={currentVehicle.license_plate} onChange={handleInputChange} className="input-field" style={{ width: '100%', textTransform: 'uppercase' }} placeholder="AB12CD" />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Marca</label>
                  <input type="text" name="make" required value={currentVehicle.make} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Toyota" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Modelo</label>
                  <input type="text" name="model" required value={currentVehicle.model} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Yaris" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Año</label>
                  <input type="number" name="year" required value={currentVehicle.year} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="2020" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Color</label>
                  <input type="text" name="color" value={currentVehicle.color} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Rojo, Azul, etc." />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Cliente / Propietario</label>
                <select 
                  name="client_id" 
                  value={currentVehicle.client_id} 
                  onChange={handleInputChange} 
                  className="input-field" 
                  style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}
                >
                  <option value="">-- Sin asignar --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.first_name} {client.last_name} ({client.phone})
                    </option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn">{isEditing ? 'Actualizar Vehículo' : 'Guardar Vehículo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleList;
