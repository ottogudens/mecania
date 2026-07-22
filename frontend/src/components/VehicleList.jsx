import React, { useState, useEffect } from 'react';
import axios from 'axios';

const MAINTENANCE_TYPES = [
  { value: 'OIL_CHANGE', label: 'Cambio de Aceite' },
  { value: 'FILTER_CHANGE', label: 'Cambio de Filtros' },
  { value: 'BELT_CHANGE', label: 'Cambio de Correas' },
  { value: 'BRAKE_SERVICE', label: 'Servicio de Frenos' },
  { value: 'TIRE_ROTATION', label: 'Rotación de Neumáticos' },
  { value: 'COOLANT_FLUSH', label: 'Cambio de Refrigerante' },
  { value: 'TRANSMISSION_SERVICE', label: 'Servicio de Transmisión' },
  { value: 'SPARK_PLUGS', label: 'Cambio de Bujías' },
  { value: 'TIMING_BELT', label: 'Correa de Distribución' },
  { value: 'GENERAL_SERVICE', label: 'Servicio General' },
  { value: 'OTHER', label: 'Otro' },
];

const PART_CATEGORIES = [
  { value: 'FILTER', label: 'Filtro' },
  { value: 'BELT', label: 'Correa' },
  { value: 'BRAKE', label: 'Frenos' },
  { value: 'SUSPENSION', label: 'Suspensión' },
  { value: 'ENGINE', label: 'Motor' },
  { value: 'ELECTRICAL', label: 'Eléctrico' },
  { value: 'BODY', label: 'Carrocería' },
  { value: 'COOLING', label: 'Refrigeración' },
  { value: 'TRANSMISSION', label: 'Transmisión' },
  { value: 'OTHER', label: 'Otro' },
];

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showMedicalModal, setShowMedicalModal] = useState(false);
  const [selectedMedicalVehicle, setSelectedMedicalVehicle] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('vehicle_view_mode') || 'grid');

  // Medical modal tabs and data
  const [medicalTab, setMedicalTab] = useState('info');
  const [fullRecord, setFullRecord] = useState(null);
  const [fullRecordLoading, setFullRecordLoading] = useState(false);

  // AI Tech Spec state
  const [aiSummary, setAiSummary] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // Forms for adding data
  const [showPartForm, setShowPartForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [showScheduledForm, setShowScheduledForm] = useState(false);

  const [newPart, setNewPart] = useState({ name: '', oem_number: '', brand: '', category: 'OTHER', installed_at: '', installed_mileage: '', notes: '' });
  const [newMaintenance, setNewMaintenance] = useState({ maintenance_type: 'GENERAL_SERVICE', description: '', mileage: '', date_performed: '', product_details: '', cost: '', performed_by: '' });
  const [newScheduled, setNewScheduled] = useState({ maintenance_type: 'GENERAL_SERVICE', description: '', due_mileage: '', due_date: '', notes: '' });

  const [currentVehicle, setCurrentVehicle] = useState({
    id: null, license_plate: '', make: '', model: '', year: '', color: '',
    transmission_type: 'MANUAL', fuel_type: 'GASOLINE', vin: '', engine_number: '',
    engine_displacement: '', mileage: '', client_id: ''
  });

  useEffect(() => { fetchData(); }, []);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Token ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, clientsRes] = await Promise.all([
        axios.get('/api/operations/vehicles/', { headers }),
        axios.get('/api/operations/clients/', { headers })
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

  const fetchFullRecord = async (vehicleId) => {
    setFullRecordLoading(true);
    try {
      const res = await axios.get(`/api/operations/vehicles/${vehicleId}/full_record/`, { headers });
      setFullRecord(res.data);
    } catch (err) {
      console.error("Error fetching full record", err);
    } finally {
      setFullRecordLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setCurrentVehicle({ ...currentVehicle, [e.target.name]: e.target.value });
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
      const payload = {
        license_plate: cleanedPlate, make: currentVehicle.make, model: currentVehicle.model,
        year: currentVehicle.year, color: currentVehicle.color || null,
        transmission_type: currentVehicle.transmission_type, fuel_type: currentVehicle.fuel_type,
        vin: currentVehicle.vin || null, engine_number: currentVehicle.engine_number || null,
        engine_displacement: currentVehicle.engine_displacement || null,
        mileage: currentVehicle.mileage ? parseInt(currentVehicle.mileage) : null,
        client_id: currentVehicle.client_id || null
      };

      if (isEditing) {
        await axios.patch(`/api/operations/vehicles/${currentVehicle.id}/`, payload, { headers });
        alert("¡Vehículo actualizado con éxito!");
      } else {
        await axios.post('/api/operations/vehicles/', payload, { headers });
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
    if (!window.confirm("¿Estás seguro de que quieres eliminar este vehículo? Esto también podría eliminar las OTs asociadas.")) return;
    try {
      await axios.delete(`/api/operations/vehicles/${id}/`, { headers });
      alert("Vehículo eliminado correctamente.");
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el vehículo.");
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setCurrentVehicle({ id: null, license_plate: '', make: '', model: '', year: '', color: '', transmission_type: 'MANUAL', fuel_type: 'GASOLINE', vin: '', engine_number: '', engine_displacement: '', mileage: '', client_id: '' });
    setShowModal(true);
  };

  const openEditModal = (vehicle) => {
    setIsEditing(true);
    setCurrentVehicle({
      id: vehicle.id, license_plate: vehicle.license_plate, make: vehicle.make, model: vehicle.model,
      year: vehicle.year, color: vehicle.color || '', transmission_type: vehicle.transmission_type || 'MANUAL',
      fuel_type: vehicle.fuel_type || 'GASOLINE', vin: vehicle.vin || '', engine_number: vehicle.engine_number || '',
      engine_displacement: vehicle.engine_displacement || '', mileage: vehicle.mileage || '',
      client_id: vehicle.client ? vehicle.client.id : ''
    });
    setShowModal(true);
  };

  const openMedicalModal = (vehicle) => {
    setSelectedMedicalVehicle(vehicle);
    setFullRecord(null);
    setAiSummary('');
    setMedicalTab('info');
    setShowPartForm(false);
    setShowMaintenanceForm(false);
    setShowScheduledForm(false);
    fetchFullRecord(vehicle.id);
    setShowMedicalModal(true);
  };

  const handleFetchAiSummary = async (vehicleId) => {
    setAiSummaryLoading(true);
    try {
      const res = await axios.post('/api/operations/vehicles/ai-summary/', { vehicle_id: vehicleId }, { headers });
      setAiSummary(res.data.summary);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar la Ficha Técnica IA.');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleSendAiSummaryWhatsApp = async (vehicle, summaryText) => {
    if (!vehicle.client || !vehicle.client.phone) {
      alert('El propietario no tiene número de WhatsApp registrado.');
      return;
    }
    const text = (
      `¡Hola ${vehicle.client.first_name}! 📋 *FICHA TÉCNICA Y PAUTA DE MANTENCIÓN EN MECANIA*\n\n` +
      `🚘 *Vehículo:* ${vehicle.make} ${vehicle.model} (${vehicle.year})\n` +
      `🚗 *Patente:* ${vehicle.license_plate}\n\n` +
      `${summaryText}\n\n` +
      `¡En MecanIA cuidamos tu vehículo con repuestos y fluidos según especificación de fábrica!`
    );
    try {
      await axios.post('/api/operations/whatsapp-messages/send-manual/', {
        phone: vehicle.client.phone,
        text: text
      }, { headers });
      alert(`Ficha técnica enviada por WhatsApp a ${vehicle.client.phone}`);
    } catch (err) {
      console.error(err);
      alert('No se pudo enviar la ficha técnica por WhatsApp.');
    }
  };

  const printAiSummary = (vehicle, summaryText) => {
    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ficha Técnica IA - ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})</title>
        <style>
          body { font-family: sans-serif; padding: 25px; line-height: 1.5; color: #1e293b; }
          h2 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; text-align: center; }
          .header { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0; font-size: 13px; }
          .content { white-space: pre-wrap; font-size: 13px; font-family: monospace; background: #fff; border: 1px solid #cbd5e1; padding: 15px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h2>MECANIA - FICHA TÉCNICA & PAUTA DE MANTENCIÓN</h2>
        <div class="header">
          <strong>Vehículo:</strong> ${vehicle.make} ${vehicle.model} (${vehicle.year})<br/>
          <strong>Patente:</strong> ${vehicle.license_plate} | <strong>VIN:</strong> ${vehicle.vin || 'N/A'}<br/>
          <strong>Motor:</strong> ${vehicle.engine_displacement || 'N/A'} | <strong>Transmisión:</strong> ${vehicle.transmission_type}
        </div>
        <div class="content">${summaryText}</div>
        <br/><br/>
        <div style="text-align:center; font-size:11px; color:#64748b;">MecanIA - Sistema Inteligente para Talleres Automotrices</div>
      </body>
      </html>
    `;
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 300);
  };

  // ── CRUD for Parts ──
  const handleAddPart = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/operations/vehicle-parts/', {
        vehicle: selectedMedicalVehicle.id, ...newPart,
        installed_mileage: newPart.installed_mileage || null,
      }, { headers });
      setShowPartForm(false);
      setNewPart({ name: '', oem_number: '', brand: '', category: 'OTHER', installed_at: '', installed_mileage: '', notes: '' });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) {
      console.error(err);
      alert('Error al agregar la parte.');
    }
  };

  const handleDeletePart = async (id) => {
    if (!window.confirm('¿Eliminar este repuesto del registro?')) return;
    try {
      await axios.delete(`/api/operations/vehicle-parts/${id}/`, { headers });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) { alert('Error al eliminar.'); }
  };

  // ── CRUD for Maintenance Records ──
  const handleAddMaintenance = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/operations/maintenance-records/', {
        vehicle: selectedMedicalVehicle.id, ...newMaintenance,
        cost: newMaintenance.cost || null,
      }, { headers });
      setShowMaintenanceForm(false);
      setNewMaintenance({ maintenance_type: 'GENERAL_SERVICE', description: '', mileage: '', date_performed: '', product_details: '', cost: '', performed_by: '' });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) {
      console.error(err);
      alert('Error al agregar la mantención.');
    }
  };

  const handleDeleteMaintenance = async (id) => {
    if (!window.confirm('¿Eliminar este registro de mantención?')) return;
    try {
      await axios.delete(`/api/operations/maintenance-records/${id}/`, { headers });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) { alert('Error al eliminar.'); }
  };

  // ── CRUD for Scheduled Maintenance ──
  const handleAddScheduled = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/operations/scheduled-maintenance/', {
        vehicle: selectedMedicalVehicle.id, ...newScheduled,
        due_mileage: newScheduled.due_mileage || null,
        due_date: newScheduled.due_date || null,
      }, { headers });
      setShowScheduledForm(false);
      setNewScheduled({ maintenance_type: 'GENERAL_SERVICE', description: '', due_mileage: '', due_date: '', notes: '' });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) {
      console.error(err);
      alert('Error al programar la mantención.');
    }
  };

  const handleMarkCompleted = async (id) => {
    try {
      await axios.post(`/api/operations/scheduled-maintenance/${id}/mark_completed/`, {}, { headers });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) { alert('Error al marcar como completada.'); }
  };

  const handleNotifyScheduled = async (id) => {
    try {
      const res = await axios.post(`/api/operations/scheduled-maintenance/${id}/notify_client/`, {}, { headers });
      alert(res.data.message || 'Notificación enviada.');
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Error al notificar.');
    }
  };

  const handleDeleteScheduled = async (id) => {
    if (!window.confirm('¿Eliminar esta mantención programada?')) return;
    try {
      await axios.delete(`/api/operations/scheduled-maintenance/${id}/`, { headers });
      fetchFullRecord(selectedMedicalVehicle.id);
    } catch (err) { alert('Error al eliminar.'); }
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

  const getStatusBadge = (status) => {
    const map = {
      PENDING: { color: 'var(--status-yellow)', label: 'Pendiente', icon: '⏳' },
      NOTIFIED: { color: 'var(--primary-color)', label: 'Notificado', icon: '📨' },
      COMPLETED: { color: 'var(--status-green)', label: 'Completado', icon: '✅' },
      OVERDUE: { color: 'var(--status-red)', label: 'Vencido', icon: '🔴' },
    };
    const s = map[status] || { color: 'var(--text-muted)', label: status, icon: '❓' };
    return (
      <span style={{ color: s.color, fontWeight: '600', fontSize: '0.85rem' }}>
        {s.icon} {s.label}
      </span>
    );
  };

  const tabStyle = (isActive) => ({
    padding: '0.6rem 1rem', background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
    border: 'none', borderBottom: isActive ? '2px solid var(--primary-color)' : '2px solid transparent',
    color: isActive ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: isActive ? '600' : '400', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
  });

  const formFieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.3rem' };
  const labelStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Vehículos...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="vehicle-list">
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2>Directorio de Vehículos</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Selector */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <button 
              type="button"
              onClick={() => { setViewMode('grid'); localStorage.setItem('vehicle_view_mode', 'grid'); }}
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
              onClick={() => { setViewMode('list'); localStorage.setItem('vehicle_view_mode', 'list'); }}
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

          <input type="text" className="glass-input" placeholder="Buscar por placa, marca o modelo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '250px' }} />
          <button className="btn" onClick={openNewModal}>+ Nuevo Vehículo</button>
        </div>
      </div>

      {filteredVehicles.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No hay vehículos registrados o coincidentes.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── Vista de Lista Detallada ── */
        <div className="glass-card" style={{ padding: '1rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.8rem 1rem' }}>Patente / Vehículo</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Especificaciones</th>
                  <th style={{ padding: '0.8rem 1rem' }}>Propietario / Cliente</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Ficha & Registro</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map(vehicle => (
                  <tr key={vehicle.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-card)', color: '#fff', fontSize: '0.9rem', padding: '0.3rem 0.6rem', border: '1px solid var(--border-color)', letterSpacing: 1, fontFamily: 'monospace' }}>
                          🚗 {vehicle.license_plate}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{vehicle.make} {vehicle.model}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Año {vehicle.year} {vehicle.color ? `• ${vehicle.color}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.82rem' }}>
                        <span>⚙️ Transmisión: <strong>{getTransmissionLabel(vehicle.transmission_type)}</strong></span>
                        <span>⛽ Combustible: <strong>{getFuelLabel(vehicle.fuel_type)}</strong></span>
                        {vehicle.mileage && <span style={{ color: 'var(--text-muted)' }}>🛣️ Km: {vehicle.mileage.toLocaleString()} km</span>}
                        {vehicle.vin && <span style={{ color: 'var(--text-muted)' }}>VIN: {vehicle.vin}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {vehicle.client ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{vehicle.client.first_name} {vehicle.client.last_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📞 {vehicle.client.phone}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--status-yellow)', fontSize: '0.82rem' }}>⚠️ Sin propietario</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {vehicle.parts_count > 0 && <span className="badge blue" style={{ fontSize: '0.72rem' }}>⚙️ {vehicle.parts_count}</span>}
                        {vehicle.maintenance_count > 0 && <span className="badge green" style={{ fontSize: '0.72rem' }}>🛠️ {vehicle.maintenance_count}</span>}
                        {vehicle.pending_maintenance_count > 0 && <span className="badge red" style={{ fontSize: '0.72rem' }}>📅 {vehicle.pending_maintenance_count}</span>}
                        {(!vehicle.parts_count && !vehicle.maintenance_count && !vehicle.pending_maintenance_count) && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin registros</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => openMedicalModal(vehicle)} title="Ficha Clínica">
                          📋 Ficha Clínica
                        </button>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => openEditModal(vehicle)} title="Editar">
                          ✏️
                        </button>
                        <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDelete(vehicle.id)} title="Eliminar">
                          🗑️
                        </button>
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
          {filteredVehicles.map(vehicle => (
            <div key={vehicle.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '10px' }}>
                <button onClick={() => openEditModal(vehicle)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }} title="Editar">✏️</button>
                <button onClick={() => handleDelete(vehicle.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }} title="Eliminar">🗑️</button>
              </div>
              
              <h3 style={{ textTransform: 'uppercase', marginBottom: '0.5rem' }}>🚗 {vehicle.license_plate}</h3>
              <p><strong>Marca/Modelo:</strong> {vehicle.make} {vehicle.model}</p>
              <p><strong>Año:</strong> {vehicle.year}</p>
              <p><strong>Transmisión:</strong> {getTransmissionLabel(vehicle.transmission_type)}</p>
              <p><strong>Combustible:</strong> {getFuelLabel(vehicle.fuel_type)}</p>

              {/* Badges for parts/maintenance */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {vehicle.parts_count > 0 && <span className="badge blue" style={{ fontSize: '0.75rem' }}>⚙️ {vehicle.parts_count} repuesto{vehicle.parts_count > 1 ? 's' : ''}</span>}
                {vehicle.maintenance_count > 0 && <span className="badge green" style={{ fontSize: '0.75rem' }}>🛠️ {vehicle.maintenance_count} mantención{vehicle.maintenance_count > 1 ? 'es' : ''}</span>}
                {vehicle.pending_maintenance_count > 0 && <span className="badge red" style={{ fontSize: '0.75rem' }}>📅 {vehicle.pending_maintenance_count} pendiente{vehicle.pending_maintenance_count > 1 ? 's' : ''}</span>}
              </div>
              
              <button className="btn btn-outline" style={{ marginTop: '1rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => openMedicalModal(vehicle)}>
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

      {/* ═══════ Modal for New/Edit Vehicle ═══════ */}
      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{isEditing ? 'Editar Vehículo' : 'Añadir Vehículo'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
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
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Cilindrada Motor</label>
                  <input type="text" name="engine_displacement" value={currentVehicle.engine_displacement} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="1.6L" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Kilometraje Inicial (Opcional)</label>
                  <input type="number" name="mileage" value={currentVehicle.mileage} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} placeholder="Ej: 100000" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>Cliente / Propietario</label>
                <select name="client_id" value={currentVehicle.client_id} onChange={handleInputChange} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                  <option value="">-- Sin asignar --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.first_name} {client.last_name} ({client.phone})</option>
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

      {/* ═══════ FICHA CLÍNICA MODAL (4 tabs) ═══════ */}
      {showMedicalModal && selectedMedicalVehicle && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>📋 Ficha Clínica: {selectedMedicalVehicle.make} {selectedMedicalVehicle.model} ({selectedMedicalVehicle.license_plate})</h3>
              <button onClick={() => setShowMedicalModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)', overflowX: 'auto' }}>
              <button onClick={() => setMedicalTab('info')} style={tabStyle(medicalTab === 'info')}>🔧 Ficha Técnica</button>
              <button onClick={() => setMedicalTab('parts')} style={tabStyle(medicalTab === 'parts')}>
                ⚙️ Repuestos {fullRecord?.parts?.length > 0 && <span className="badge blue" style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }}>{fullRecord.parts.length}</span>}
              </button>
              <button onClick={() => setMedicalTab('maintenance')} style={tabStyle(medicalTab === 'maintenance')}>
                🛠️ Mantenciones {fullRecord?.maintenance_records?.length > 0 && <span className="badge green" style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }}>{fullRecord.maintenance_records.length}</span>}
              </button>
              <button onClick={() => setMedicalTab('scheduled')} style={tabStyle(medicalTab === 'scheduled')}>
                📅 Próximas {fullRecord?.scheduled_maintenance?.filter(s => s.status !== 'COMPLETED')?.length > 0 && <span className="badge red" style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }}>{fullRecord.scheduled_maintenance.filter(s => s.status !== 'COMPLETED').length}</span>}
              </button>
            </div>

            {fullRecordLoading ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>Cargando ficha completa...</p>
            ) : (
              <>
                {/* ── TAB: Ficha Técnica ── */}
                {medicalTab === 'info' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
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

                    {/* ── Integración IA: Fluidos, Filtros y Pauta por Kilometraje ── */}
                    <div style={{ marginTop: '1.5rem', background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.95))', padding: '1.25rem', borderRadius: 12, border: '1px solid rgba(59,130,246,0.3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
                        <div>
                          <h4 style={{ margin: 0, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            🤖 MecanIA - Especificaciones de Fluidos, Filtros y Pauta de Mantención
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Información técnica detallada (Viscosidades, litros, números OEM Mann/Tecfil/Wega y pauta por km)
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          disabled={aiSummaryLoading}
                          onClick={() => handleFetchAiSummary(selectedMedicalVehicle.id)}
                          style={{
                            background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                            border: 'none',
                            fontSize: '0.85rem',
                            fontWeight: 650,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          {aiSummaryLoading ? '⏳ Generando Ficha Técnica...' : (aiSummary ? '🔄 Actualizar Ficha IA' : '🤖 Generar Ficha Técnica IA')}
                        </button>
                      </div>

                      {aiSummaryLoading && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#60a5fa' }}>
                          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
                          <div>Consultando especificaciones de fluidos (aceites motor, transmisión, refrigerante), códigos OEM de filtros y pauta por kilometraje...</div>
                        </div>
                      )}

                      {!aiSummaryLoading && aiSummary && (
                        <div style={{ marginTop: '1rem' }}>
                          <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '1.2rem',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff',
                            fontSize: '0.9rem',
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'Outfit, sans-serif'
                          }}>
                            {aiSummary}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => printAiSummary(selectedMedicalVehicle, aiSummary)}
                              style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                              🖨️ Imprimir Ficha Técnica
                            </button>
                            {selectedMedicalVehicle.client?.phone && (
                              <button
                                type="button"
                                className="btn btn-whatsapp"
                                onClick={() => handleSendAiSummaryWhatsApp(selectedMedicalVehicle, aiSummary)}
                                style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                              >
                                💬 Enviar por WhatsApp
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Work order history */}
                    {fullRecord?.work_orders?.length > 0 && (
                      <div style={{ marginTop: '2rem' }}>
                        <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1rem' }}>🩺 Historial de Órdenes de Trabajo</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {fullRecord.work_orders.map(ot => (
                            <div key={ot.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <strong>OT #{ot.id} — {ot.status}</strong>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(ot.created_at).toLocaleDateString()}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Kilometraje:</span> {ot.mileage?.toLocaleString()} km</div>
                                {ot.mechanic_name && <div><span style={{ color: 'var(--text-muted)' }}>Mecánico:</span> {ot.mechanic_name}</div>}
                              </div>
                              {ot.visit_reason && <div style={{ fontSize: '0.9rem', marginTop: '0.3rem' }}><span style={{ color: 'var(--text-muted)' }}>Motivo:</span> {ot.visit_reason}</div>}
                              {ot.items?.length > 0 && (
                                <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0, fontSize: '0.85rem' }}>
                                  {ot.items.map(item => <li key={item.id}>{item.quantity}x {item.description}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Repuestos & Partes ── */}
                {medicalTab === 'parts' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>⚙️ Repuestos y Partes Instaladas</h4>
                      <button className="btn" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => setShowPartForm(!showPartForm)}>
                        {showPartForm ? 'Cancelar' : '+ Agregar Repuesto'}
                      </button>
                    </div>

                    {showPartForm && (
                      <form onSubmit={handleAddPart} style={{ padding: '1rem', backgroundColor: 'rgba(59,130,246,0.05)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Nombre *</label>
                            <input type="text" required className="input-field" value={newPart.name} onChange={e => setNewPart({...newPart, name: e.target.value})} placeholder="Filtro de aceite" />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Número OEM *</label>
                            <input type="text" required className="input-field" value={newPart.oem_number} onChange={e => setNewPart({...newPart, oem_number: e.target.value})} placeholder="04152-YZZA1" />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Marca</label>
                            <input type="text" className="input-field" value={newPart.brand} onChange={e => setNewPart({...newPart, brand: e.target.value})} placeholder="Mann-Filter" />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Categoría</label>
                            <select className="input-field" value={newPart.category} onChange={e => setNewPart({...newPart, category: e.target.value})} style={{ backgroundColor: 'var(--bg-card)' }}>
                              {PART_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Fecha Instalación *</label>
                            <input type="date" required className="input-field" value={newPart.installed_at} onChange={e => setNewPart({...newPart, installed_at: e.target.value})} />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Kilometraje Instalación</label>
                            <input type="number" className="input-field" value={newPart.installed_mileage} onChange={e => setNewPart({...newPart, installed_mileage: e.target.value})} placeholder="85000" />
                          </div>
                        </div>
                        <div style={formFieldStyle}>
                          <label style={labelStyle}>Notas</label>
                          <input type="text" className="input-field" value={newPart.notes} onChange={e => setNewPart({...newPart, notes: e.target.value})} placeholder="Observaciones..." />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="submit" className="btn" style={{ fontSize: '0.85rem' }}>💾 Guardar Repuesto</button>
                        </div>
                      </form>
                    )}

                    {(!fullRecord?.parts || fullRecord.parts.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No hay repuestos registrados para este vehículo.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {fullRecord.parts.map(part => (
                          <div key={part.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid var(--secondary-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong>{part.name}</strong>
                                <span className="badge blue" style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>{part.category_display}</span>
                              </div>
                              <button onClick={() => handleDeletePart(part.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', fontSize: '0.9rem' }}>🗑️</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                              <div><span style={{ color: 'var(--text-muted)' }}>OEM:</span> <strong style={{ fontFamily: 'monospace' }}>{part.oem_number}</strong></div>
                              {part.brand && <div><span style={{ color: 'var(--text-muted)' }}>Marca:</span> {part.brand}</div>}
                              <div><span style={{ color: 'var(--text-muted)' }}>Instalado:</span> {new Date(part.installed_at).toLocaleDateString()}</div>
                              {part.installed_mileage && <div><span style={{ color: 'var(--text-muted)' }}>Km:</span> {part.installed_mileage.toLocaleString()}</div>}
                              {part.work_order_display && <div><span style={{ color: 'var(--text-muted)' }}>OT:</span> {part.work_order_display}</div>}
                            </div>
                            {part.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>📝 {part.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Mantenciones ── */}
                {medicalTab === 'maintenance' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>🛠️ Historial de Mantenciones</h4>
                      <button className="btn" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => setShowMaintenanceForm(!showMaintenanceForm)}>
                        {showMaintenanceForm ? 'Cancelar' : '+ Registrar Mantención'}
                      </button>
                    </div>

                    {showMaintenanceForm && (
                      <form onSubmit={handleAddMaintenance} style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.05)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', border: '1px solid rgba(34,197,94,0.15)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Tipo de Mantención *</label>
                            <select className="input-field" required value={newMaintenance.maintenance_type} onChange={e => setNewMaintenance({...newMaintenance, maintenance_type: e.target.value})} style={{ backgroundColor: 'var(--bg-card)' }}>
                              {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Fecha *</label>
                            <input type="date" required className="input-field" value={newMaintenance.date_performed} onChange={e => setNewMaintenance({...newMaintenance, date_performed: e.target.value})} />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Kilometraje *</label>
                            <input type="number" required className="input-field" value={newMaintenance.mileage} onChange={e => setNewMaintenance({...newMaintenance, mileage: e.target.value})} placeholder="90000" />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Costo ($)</label>
                            <input type="number" className="input-field" value={newMaintenance.cost} onChange={e => setNewMaintenance({...newMaintenance, cost: e.target.value})} placeholder="50000" />
                          </div>
                        </div>
                        <div style={formFieldStyle}>
                          <label style={labelStyle}>Descripción *</label>
                          <textarea required className="input-field" value={newMaintenance.description} onChange={e => setNewMaintenance({...newMaintenance, description: e.target.value})} rows="2" placeholder="Detalle de lo realizado..." style={{ resize: 'vertical' }} />
                        </div>
                        <div style={formFieldStyle}>
                          <label style={labelStyle}>Detalles del Producto (marca, viscosidad, especificación, etc.)</label>
                          <input type="text" className="input-field" value={newMaintenance.product_details} onChange={e => setNewMaintenance({...newMaintenance, product_details: e.target.value})} placeholder="Aceite Mobil 1 5W-30, Filtro Mann HU 719/7x" />
                        </div>
                        <div style={formFieldStyle}>
                          <label style={labelStyle}>Realizado por</label>
                          <input type="text" className="input-field" value={newMaintenance.performed_by} onChange={e => setNewMaintenance({...newMaintenance, performed_by: e.target.value})} placeholder="Nombre del mecánico" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="submit" className="btn" style={{ fontSize: '0.85rem' }}>💾 Guardar Mantención</button>
                        </div>
                      </form>
                    )}

                    {(!fullRecord?.maintenance_records || fullRecord.maintenance_records.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No hay mantenciones registradas para este vehículo.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {fullRecord.maintenance_records.map(rec => (
                          <div key={rec.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid var(--status-green)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong>{rec.maintenance_type_display}</strong>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>— {new Date(rec.date_performed).toLocaleDateString()}</span>
                              </div>
                              <button onClick={() => handleDeleteMaintenance(rec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', fontSize: '0.9rem' }}>🗑️</button>
                            </div>
                            <p style={{ margin: '0.3rem 0', fontSize: '0.9rem' }}>{rec.description}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.3rem', fontSize: '0.85rem' }}>
                              <div><span style={{ color: 'var(--text-muted)' }}>Km:</span> {rec.mileage?.toLocaleString()}</div>
                              {rec.cost && <div><span style={{ color: 'var(--text-muted)' }}>Costo:</span> ${parseFloat(rec.cost).toLocaleString()}</div>}
                              {rec.performed_by && <div><span style={{ color: 'var(--text-muted)' }}>Mecánico:</span> {rec.performed_by}</div>}
                              {rec.work_order_display && <div><span style={{ color: 'var(--text-muted)' }}>OT:</span> {rec.work_order_display}</div>}
                            </div>
                            {rec.product_details && (
                              <div style={{ marginTop: '0.4rem', padding: '0.5rem', backgroundColor: 'rgba(59,130,246,0.05)', borderRadius: '4px', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>🧴 Productos:</span> {rec.product_details}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Próximas Mantenciones ── */}
                {medicalTab === 'scheduled' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>📅 Mantenciones Programadas</h4>
                      <button className="btn" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => setShowScheduledForm(!showScheduledForm)}>
                        {showScheduledForm ? 'Cancelar' : '+ Programar Mantención'}
                      </button>
                    </div>

                    {showScheduledForm && (
                      <form onSubmit={handleAddScheduled} style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Tipo de Mantención *</label>
                            <select className="input-field" required value={newScheduled.maintenance_type} onChange={e => setNewScheduled({...newScheduled, maintenance_type: e.target.value})} style={{ backgroundColor: 'var(--bg-card)' }}>
                              {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Descripción *</label>
                            <input type="text" required className="input-field" value={newScheduled.description} onChange={e => setNewScheduled({...newScheduled, description: e.target.value})} placeholder="Próximo cambio de aceite" />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Fecha Límite</label>
                            <input type="date" className="input-field" value={newScheduled.due_date} onChange={e => setNewScheduled({...newScheduled, due_date: e.target.value})} />
                          </div>
                          <div style={formFieldStyle}>
                            <label style={labelStyle}>Kilometraje Límite</label>
                            <input type="number" className="input-field" value={newScheduled.due_mileage} onChange={e => setNewScheduled({...newScheduled, due_mileage: e.target.value})} placeholder="100000" />
                          </div>
                        </div>
                        <div style={formFieldStyle}>
                          <label style={labelStyle}>Notas</label>
                          <input type="text" className="input-field" value={newScheduled.notes} onChange={e => setNewScheduled({...newScheduled, notes: e.target.value})} placeholder="Notas adicionales..." />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="submit" className="btn" style={{ fontSize: '0.85rem' }}>💾 Programar Mantención</button>
                        </div>
                      </form>
                    )}

                    {(!fullRecord?.scheduled_maintenance || fullRecord.scheduled_maintenance.length === 0) ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No hay mantenciones programadas para este vehículo.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {fullRecord.scheduled_maintenance.map(sch => (
                          <div key={sch.id} style={{ 
                            padding: '1rem', borderRadius: '8px',
                            backgroundColor: sch.status === 'OVERDUE' ? 'rgba(239,68,68,0.08)' : sch.status === 'COMPLETED' ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.05)',
                            borderLeft: `4px solid ${sch.status === 'OVERDUE' ? 'var(--status-red)' : sch.status === 'COMPLETED' ? 'var(--status-green)' : 'var(--status-yellow)'}`,
                            opacity: sch.status === 'COMPLETED' ? 0.6 : 1,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong>{sch.maintenance_type_display}</strong>
                                <span style={{ marginLeft: '0.5rem' }}>{getStatusBadge(sch.status)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {sch.status !== 'COMPLETED' && (
                                  <>
                                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleNotifyScheduled(sch.id)} title="Notificar al cliente">
                                      📨 Notificar
                                    </button>
                                    <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--status-green)' }} onClick={() => handleMarkCompleted(sch.id)} title="Marcar como completada">
                                      ✅ Completar
                                    </button>
                                  </>
                                )}
                                <button onClick={() => handleDeleteScheduled(sch.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', fontSize: '0.9rem' }}>🗑️</button>
                              </div>
                            </div>
                            <p style={{ margin: '0.3rem 0', fontSize: '0.9rem' }}>{sch.description}</p>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                              {sch.due_date && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>📅 Fecha:</span> {new Date(sch.due_date).toLocaleDateString()}
                                  {sch.days_remaining !== null && (
                                    <span style={{ marginLeft: '0.3rem', fontWeight: '600', color: sch.days_remaining < 0 ? 'var(--status-red)' : sch.days_remaining <= 30 ? 'var(--status-yellow)' : 'var(--status-green)' }}>
                                      ({sch.days_remaining < 0 ? `${Math.abs(sch.days_remaining)} días vencido` : `${sch.days_remaining} días restantes`})
                                    </span>
                                  )}
                                </div>
                              )}
                              {sch.due_mileage && <div><span style={{ color: 'var(--text-muted)' }}>🛣️ Km:</span> {sch.due_mileage.toLocaleString()}</div>}
                              {sch.notified_at && <div><span style={{ color: 'var(--text-muted)' }}>📨 Notificado:</span> {new Date(sch.notified_at).toLocaleDateString()}</div>}
                            </div>
                            {sch.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>📝 {sch.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

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
