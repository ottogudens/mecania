import React, { useState, useEffect } from 'react';
import axios from 'axios';

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showMedicalModal, setShowMedicalModal] = useState(false);
  const [selectedMedicalVehicle, setSelectedMedicalVehicle] = useState(null);
  const [vehicleHistory, setVehicleHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentVehicle, setCurrentVehicle] = useState({
    id: null,
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
    mileage: '',
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

  const fetchVehicleHistory = async (vehicleId) => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Fetch all work orders for this vehicle
      const res = await axios.get(`/api/operations/work-orders/?vehicle=${vehicleId}`, {
        headers: { Authorization: `Token ${token}` }
      });
      const data = res.data.results || res.data;
      // Filter specifically for this vehicle in case backend list doesn't filter on querystring by default
      const filtered = data.filter(ot => ot.vehicle?.id === vehicleId || ot.vehicle === vehicleId);
      setVehicleHistory(filtered);
    } catch (err) {
      console.error("Error fetching vehicle history", err);
    } finally {
      setHistoryLoading(false);
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
    const cleanedPlate = currentVehicle.license_plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const plateRegex = /^[A-Z]{2}\d{4}$|^[A-Z]{4}\d{2}$/;
    if (!plateRegex.test(cleanedPlate)) {
      alert("La patente debe tener formato válido chileno: 2 letras y 4 números (ej. AB1234) o 4 letras y 2 números (ej. ABCD12).");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        license_plate: cleanedPlate,
        make: currentVehicle.make,
        model: currentVehicle.model,
        year: currentVehicle.year,
        color: currentVehicle.color || null,
        transmission_type: currentVehicle.transmission_type,
        fuel_type: currentVehicle.fuel_type,
        vin: currentVehicle.vin || null,
        engine_number: currentVehicle.engine_number || null,
        engine_displacement: currentVehicle.engine_displacement || null,
        mileage: currentVehicle.mileage ? parseInt(currentVehicle.mileage) : null,
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
      id: null,
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
      mileage: '',
      client_id: ''
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
      transmission_type: vehicle.transmission_type || 'MANUAL',
      fuel_type: vehicle.fuel_type || 'GASOLINE',
      vin: vehicle.vin || '',
      engine_number: vehicle.engine_number || '',
      engine_displacement: vehicle.engine_displacement || '',
      mileage: vehicle.mileage || '',
      client_id: vehicle.client ? vehicle.client.id : ''
    });
    setShowModal(true);
  };

  const openMedicalModal = (vehicle) => {
    setSelectedMedicalVehicle(vehicle);
    setVehicleHistory([]);
    fetchVehicleHistory(vehicle.id);
    setShowMedicalModal(true);
  };

  const filteredVehicles = vehicles.filter(v => 
    v.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTransmissionLabel = (val) => {
    const map = { MANUAL: 'Manual', AUTOMATIC: 'Automática', CVT: 'CVT', DCT: 'Doble Embrague' };
    return map[val] || val;
  };

  const getFuelLabel = (val) => {
    const map = { GASOLINE: 'Gasolina', DIESEL: 'Diesel', HYBRID: 'Híbrido', ELECTRIC: 'Eléctrico', GNC_GLP: 'Gas (GNC/GLP)' };
    return map[val] || val;
  };

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
              
              <h3 style={{ textTransform: 'uppercase', marginBottom: '0.5rem' }}>🚗 {vehicle.license_plate}</h3>
              <p><strong>Marca/Modelo:</strong> {vehicle.make} {vehicle.model}</p>
              <p><strong>Año:</strong> {vehicle.year}</p>
              <p><strong>Transmisión:</strong> {getTransmissionLabel(vehicle.transmission_type)}</p>
              <p><strong>Combustible:</strong> {getFuelLabel(vehicle.fuel_type)}</p>
              
              <button 
                className="btn btn-outline" 
                style={{ marginTop: '1rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                onClick={() => openMedicalModal(vehicle)}
              >
                📋 Ver Ficha Clínica
              </button>

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
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
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
                <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Patente (Placa) *</label>
                <input type="text" name="license_plate" required value={currentVehicle.license_plate} onChange={handleInputChange} className="input-field" style={{ width: '100%', textTransform: 'uppercase' }} placeholder="AB12CD" />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Marca *</label>
                  <input type="text" name="make" required value={currentVehicle.make} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Toyota" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Modelo *</label>
                  <input type="text" name="model" required value={currentVehicle.model} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Yaris" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Año *</label>
                  <input type="number" name="year" required value={currentVehicle.year} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="2020" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Color</label>
                  <input type="text" name="color" value={currentVehicle.color} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Rojo, Azul, etc." />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Transmisión *</label>
                  <select name="transmission_type" required value={currentVehicle.transmission_type} onChange={handleInputChange} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                    <option value="MANUAL">Manual</option>
                    <option value="AUTOMATIC">Automática</option>
                    <option value="CVT">CVT</option>
                    <option value="DCT">Doble Embrague</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Combustible *</label>
                  <select name="fuel_type" required value={currentVehicle.fuel_type} onChange={handleInputChange} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
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
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Número VIN (Chasis)</label>
                  <input type="text" name="vin" value={currentVehicle.vin} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Nº de chasis" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Número de Motor</label>
                  <input type="text" name="engine_number" value={currentVehicle.engine_number} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Nº de motor" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Cilindrada Motor (ej: 1.6, 2.0L)</label>
                  <input type="text" name="engine_displacement" value={currentVehicle.engine_displacement} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="1.6L" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Kilometraje Inicial</label>
                  <input type="number" name="mileage" value={currentVehicle.mileage} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="100000" />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Cliente / Propietario</label>
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

      {/* Modal Ficha Clínica / Historial Médico */}
      {showMedicalModal && selectedMedicalVehicle && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>📋 Ficha Clínica: {selectedMedicalVehicle.make} {selectedMedicalVehicle.model} ({selectedMedicalVehicle.license_plate})</h3>
              <button 
                onClick={() => setShowMedicalModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>

            {/* Ficha Técnica */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1rem' }}>🔧 Ficha Técnica</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Patente:</span> <strong style={{ textTransform: 'uppercase' }}>{selectedMedicalVehicle.license_plate}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Marca/Modelo:</span> <strong>{selectedMedicalVehicle.make} {selectedMedicalVehicle.model}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Año:</span> <strong>{selectedMedicalVehicle.year}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Color:</span> <strong>{selectedMedicalVehicle.color || 'No especificado'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Transmisión:</span> <strong>{getTransmissionLabel(selectedMedicalVehicle.transmission_type)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Combustible:</span> <strong>{getFuelLabel(selectedMedicalVehicle.fuel_type)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Número VIN:</span> <strong>{selectedMedicalVehicle.vin || 'No registrado'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Número de Motor:</span> <strong>{selectedMedicalVehicle.engine_number || 'No registrado'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Cilindrada:</span> <strong>{selectedMedicalVehicle.engine_displacement || 'No especificado'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Kilometraje Inicial:</span> <strong>{selectedMedicalVehicle.mileage ? `${selectedMedicalVehicle.mileage.toLocaleString()} km` : 'No especificado'}</strong></div>
              </div>
            </div>

            {/* Historial Clínico de Servicios */}
            <div>
              <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1rem' }}>🩺 Historial de Servicios (Ordenes de Trabajo)</h4>
              {historyLoading ? (
                <p>Cargando historial clínico...</p>
              ) : vehicleHistory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Este vehículo aún no cuenta con registros de visitas u órdenes de trabajo.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {vehicleHistory.map(ot => (
                    <div key={ot.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong>OT #{ot.id} — {ot.get_status_display || ot.status}</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(ot.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Kilometraje:</span> {ot.mileage?.toLocaleString()} km</div>
                        {ot.mechanic_name && <div><span style={{ color: 'var(--text-muted)' }}>Mecánico:</span> {ot.mechanic_name}</div>}
                      </div>

                      {ot.visit_reason && (
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Motivo Visita:</span> {ot.visit_reason}
                        </div>
                      )}
                      {ot.desired_service && (
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Servicio Solicitado:</span> {ot.desired_service}
                        </div>
                      )}
                      {ot.symptoms && (
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Síntomas Reportados:</span> {ot.symptoms}
                        </div>
                      )}

                      {ot.items && ot.items.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Servicios & Repuestos Realizados:</span>
                          <ul style={{ margin: '0.2rem 0 0 1rem', padding: 0, fontSize: '0.85rem' }}>
                            {ot.items.map(item => (
                              <li key={item.id}>
                                {item.quantity}x {item.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {ot.additional_findings && (
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', borderLeft: '3px solid var(--status-red)', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#f87171' }}>Detalle Encontrado (Mecánico):</strong> {ot.additional_findings}
                          {ot.findings_approved && <span style={{ color: '#4ade80', marginLeft: '0.5rem' }}>(Aprobado por Cliente ✓)</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowMedicalModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleList;
