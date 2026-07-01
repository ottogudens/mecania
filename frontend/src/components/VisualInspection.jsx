import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const VEHICLE_PARTS = [
  { id: 'engine', name: 'Motor', icon: '🔧', desc: 'Nivel de aceite, mangueras, fugas y batería.' },
  { id: 'brakes', name: 'Frenos', icon: '🛑', desc: 'Pastillas, discos y líquido de frenos.' },
  { id: 'suspension', name: 'Suspensión', icon: '↕️', desc: 'Amortiguadores, bandejas y rótulas.' },
  { id: 'tires', name: 'Neumáticos', icon: '🛞', desc: 'Desgaste, presión y estado de llantas.' },
  { id: 'lights', name: 'Luces', icon: '💡', desc: 'Focos delanteros, traseros, intermitentes.' },
  { id: 'bodywork', name: 'Carrocería', icon: '🚗', desc: 'Rayones, abolladuras, golpes exteriores.' },
  { id: 'interior', name: 'Interior', icon: '💺', desc: 'Cinturones, aire acondicionado, tablero.' },
  { id: 'exhaust', name: 'Escape', icon: '💨', desc: 'Fugas de humo, catalizador y silenciador.' }
];

const VisualInspection = () => {
  const toast = useToast();
  
  // App Roles/Auth
  const userRole = localStorage.getItem('role') || 'admin';
  const username = localStorage.getItem('username') || '';

  // Inspection lists
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active View / Modal States
  const [activeTab, setActiveTab] = useState('all'); // all, pending, my_work, completed
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showActiveInspection, setShowActiveInspection] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);

  // Quick Vehicle Form / Search
  const [plateQuery, setPlateQuery] = useState('');
  const [searchedVehicle, setSearchedVehicle] = useState(null);
  const [searchedError, setSearchedError] = useState('');
  const [showQuickVehicleForm, setShowQuickVehicleForm] = useState(false);
  
  const [newVehicle, setNewVehicle] = useState({
    license_plate: '', make: '', model: '', year: new Date().getFullYear(),
    transmission_type: 'MANUAL', fuel_type: 'GASOLINE',
    vin: '', engine_number: '', engine_displacement: '', mileage: ''
  });

  // Active Audit Item / Details
  const [selectedPartId, setSelectedPartId] = useState('engine');
  const [activeItemsData, setActiveItemsData] = useState({});

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Budget/Estimate modal states
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [estimateItems, setEstimateItems] = useState([
    { description: 'Mano de Obra - Reparación General', quantity: 1, unit_price: 35000 }
  ]);

  useEffect(() => {
    fetchInspections();
  }, []);

  const fetchInspections = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/inspections/', {
        headers: { Authorization: `Token ${token}` }
      });
      setInspections(response.data.results || response.data);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudieron cargar las inspecciones.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Search vehicle by plate
  const handleSearchVehicle = async () => {
    setSearchedError('');
    setSearchedVehicle(null);
    const cleaned = plateQuery.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    if (!cleaned) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/operations/vehicles/', {
        headers: { Authorization: `Token ${token}` }
      });
      const vehicles = res.data.results || res.data;
      const found = vehicles.find(v => v.license_plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '') === cleaned);
      
      if (found) {
        setSearchedVehicle(found);
      } else {
        setSearchedError('Vehículo no registrado. Regístralo a continuación.');
        setShowQuickVehicleForm(true);
        setNewVehicle(prev => ({ ...prev, license_plate: cleaned }));
      }
    } catch (err) {
      console.error(err);
      setSearchedError('Error al buscar el vehículo.');
    }
  };

  // Create Quick Vehicle
  const handleCreateQuickVehicle = async (e) => {
    e.preventDefault();
    const cleaned = newVehicle.license_plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const plateRegex = /^[A-Z]{2}\d{4}$|^[A-Z]{4}\d{2}$/;
    if (!plateRegex.test(cleaned)) {
      alert("La patente debe tener formato válido chileno: AB1234 o ABCD12.");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/operations/vehicles/', {
        ...newVehicle,
        license_plate: cleaned,
        mileage: newVehicle.mileage ? parseInt(newVehicle.mileage) : null
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Vehículo Creado', message: 'Registrado correctamente.', type: 'success' });
      setSearchedVehicle(res.data);
      setShowQuickVehicleForm(false);
      setSearchedError('');
    } catch (err) {
      console.error(err);
      alert('Error al crear el vehículo.');
    }
  };

  // Save new inspection in state PENDING
  const handleCreateInspection = async () => {
    if (!searchedVehicle) {
      alert("Debes seleccionar o registrar un vehículo.");
      return;
    }

    // Default inspection items values
    const initialItems = {};
    VEHICLE_PARTS.forEach(p => {
      initialItems[p.id] = { status: 'OK', note: '', image: null };
    });

    try {
      const token = localStorage.getItem('token');
      const payload = {
        vehicle_id: searchedVehicle.id,
        status: 'PENDING',
        items_json: initialItems,
        notes: `Inspección inicial de ${searchedVehicle.make} ${searchedVehicle.model}`
      };

      await axios.post('/api/operations/inspections/', payload, {
        headers: { Authorization: `Token ${token}` }
      });

      toast({ title: 'Inspección Creada', message: 'Registrada en estado Pendiente.', type: 'success' });
      setShowCreateModal(false);
      setSearchedVehicle(null);
      setPlateQuery('');
      fetchInspections();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la inspección.');
    }
  };

  // Mechanic takes the inspection
  const handleTakeInspection = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/operations/inspections/${id}/take_inspection/`, {}, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Inspección Tomada', message: 'Iniciada con éxito.', type: 'success' });
      
      const inspection = res.data;
      setSelectedInspection(inspection);
      setActiveItemsData(inspection.items_json || {});
      setShowActiveInspection(true);
      fetchInspections();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo tomar la inspección.', type: 'error' });
    }
  };

  // Update inspection findings in state
  const handleUpdatePart = (partId, key, value) => {
    setActiveItemsData(prev => {
      const updated = {
        ...prev,
        [partId]: {
          ...prev[partId],
          [key]: value
        }
      };
      // Auto-save changes locally on change to keep database updated
      saveProgress(updated);
      return updated;
    });
  };

  const saveProgress = async (items) => {
    if (!selectedInspection) return;
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`/api/operations/inspections/${selectedInspection.id}/`, {
        items_json: items
      }, {
        headers: { Authorization: `Token ${token}` }
      });
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  };

  // Image Upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      handleUpdatePart(selectedPartId, 'image', reader.result);
      toast({ title: 'Foto Adjunta', message: 'Evidencia cargada.', type: 'success' });
    };
    reader.readAsDataURL(file);
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendAudioForTranscription(audioBlob, mimeType);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast({ title: 'Grabando...', message: 'Habla ahora para diagnosticar...', type: 'info' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error de micrófono', message: 'No se pudo acceder al micrófono.', type: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const sendAudioForTranscription = async (audioBlob, mimeType) => {
    setLoadingAi(true);
    try {
      const formData = new FormData();
      let ext = 'webm';
      if (mimeType.includes('mp4')) ext = 'mp4';
      
      formData.append('audio', audioBlob, `nota_voz.${ext}`);
      
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-transcribe/', formData, {
        headers: { 
          'Authorization': `Token ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const transText = response.data.transcription;
      const existingNote = activeItemsData[selectedPartId]?.note || '';
      handleUpdatePart(selectedPartId, 'note', existingNote ? `${existingNote} ${transText}` : transText);
      toast({ title: 'Transcripción completada', message: 'Texto ingresado.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo transcribir con la IA.', type: 'error' });
    } finally {
      setLoadingAi(false);
    }
  };

  // Complete visual inspection
  const handleCompleteInspection = async () => {
    if (!selectedInspection) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/operations/inspections/${selectedInspection.id}/complete_inspection/`, {}, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Inspección Finalizada', message: 'Lista para la entrega y presupuesto.', type: 'success' });
      setShowActiveInspection(false);
      setSelectedInspection(null);
      fetchInspections();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo finalizar la inspección.', type: 'error' });
    }
  };

  // Open active view (either to audit or read)
  const openAuditView = (inspection) => {
    setSelectedInspection(inspection);
    setActiveItemsData(inspection.items_json || {});
    setShowActiveInspection(true);
  };

  // Create Quick Estimate Modal Pre-filled
  const openEstimateDraft = (inspection) => {
    setSelectedInspection(inspection);
    
    // Auto generate items from warning or critical parts
    const items = [];
    const parts = inspection.items_json || {};
    
    Object.keys(parts).forEach(key => {
      const part = parts[key];
      const partInfo = VEHICLE_PARTS.find(p => p.id === key);
      
      if (part.status === 'CRITICAL' || part.status === 'WARNING') {
        items.push({
          description: `Repuesto / Reparación: ${partInfo?.name || key} (${part.note || 'Revisión crítica requerida'})`,
          quantity: 1,
          unit_price: part.status === 'CRITICAL' ? 45000 : 15000
        });
      }
    });
    
    // Fallback if all parts were OK
    if (items.length === 0) {
      items.push({
        description: 'Mantención General / Inspección Visual OK',
        quantity: 1,
        unit_price: 25000
      });
    }

    setEstimateItems(items);
    setShowEstimateModal(true);
  };

  const handleCreateEstimate = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // We can mock saving the estimate, or if there is a real endpoint:
      // Let's check if there is an endpoint `/api/operations/estimates/` or similar.
      // Usually, there is a WorkOrder estimate or standalone estimate.
      // Let's create a WorkOrder in status PENDING with the pre-filled items!
      // This will act as the budget/quote!
      
      const payload = {
        vehicle_id: selectedInspection.vehicle_id,
        status: 'PENDING',
        mileage: 0,
        fuel_level: 0,
        symptoms: `Generado desde Inspección Visual #${selectedInspection.id}`,
        visit_reason: 'Cotización / Presupuesto post-inspección'
      };

      // Create WorkOrder
      const woRes = await axios.post('/api/operations/work-orders/', payload, {
        headers: { Authorization: `Token ${token}` }
      });
      const workOrderId = woRes.data.id;

      // Add items
      for (const item of estimateItems) {
        await axios.post('/api/operations/work-order-items/', {
          work_order: workOrderId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price
        }, {
          headers: { Authorization: `Token ${token}` }
        });
      }

      toast({ title: 'Presupuesto Creado', message: `Se generó la cotización asociada (OT #${workOrderId})`, type: 'success' });
      setShowEstimateModal(false);
    } catch (err) {
      console.error(err);
      alert('Error al generar el presupuesto.');
    }
  };

  // Filter list
  const filteredInspections = inspections.filter(ins => {
    if (activeTab === 'pending') return ins.status === 'PENDING';
    if (activeTab === 'my_work') return ins.status === 'IN_PROGRESS' && ins.mechanic_username === username;
    if (activeTab === 'completed') return ins.status === 'COMPLETED';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Visual Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary)' }}>📋 Inspecciones Visuales</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Crea y gestiona inspecciones detalladas para diagnóstico móvil y presupuestos.</p>
        </div>
        <button className="btn" onClick={() => setShowCreateModal(true)}>
          ➕ Nueva Inspección
        </button>
      </div>

      {/* Tabs / Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className={`btn ${activeTab === 'all' ? '' : 'btn-outline'}`} onClick={() => setActiveTab('all')}>Todas</button>
        <button className={`btn ${activeTab === 'pending' ? '' : 'btn-outline'}`} onClick={() => setActiveTab('pending')}>Pendientes (Disponibles)</button>
        <button className={`btn ${activeTab === 'my_work' ? '' : 'btn-outline'}`} onClick={() => setActiveTab('my_work')}>Mis Inspecciones activas</button>
        <button className={`btn ${activeTab === 'completed' ? '' : 'btn-outline'}`} onClick={() => setActiveTab('completed')}>Completadas</button>
      </div>

      {/* Audit View Mode (Active Checklist) */}
      {showActiveInspection && selectedInspection ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>Inspección Activa: {selectedInspection.vehicle_plate}</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>{selectedInspection.vehicle_make} {selectedInspection.vehicle_model} | Estado: <strong>{selectedInspection.status}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {selectedInspection.status === 'IN_PROGRESS' && (
                <button className="btn" style={{ backgroundColor: '#10b981' }} onClick={handleCompleteInspection}>
                  ✓ Finalizar y Marcar Lista para Entrega
                </button>
              )}
              <button className="btn btn-outline" onClick={() => { setShowActiveInspection(false); setSelectedInspection(null); fetchInspections(); }}>
                Volver
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap-reverse' }}>
            
            {/* Parts Checklist GRID */}
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                {VEHICLE_PARTS.map(part => {
                  const data = activeItemsData[part.id] || { status: 'OK' };
                  const isSelected = part.id === selectedPartId;
                  
                  let statusBg = 'rgba(255,255,255,0.05)';
                  let statusBorder = 'transparent';
                  if (data.status === 'WARNING') {
                    statusBg = 'rgba(245,158,11,0.08)';
                    statusBorder = 'var(--secondary)';
                  } else if (data.status === 'CRITICAL') {
                    statusBg = 'rgba(239,68,68,0.08)';
                    statusBorder = 'var(--status-red)';
                  } else if (data.status === 'OK') {
                    statusBg = 'rgba(16,185,129,0.05)';
                    statusBorder = 'var(--status-green)';
                  }

                  return (
                    <button
                      key={part.id}
                      onClick={() => setSelectedPartId(part.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: isSelected ? `2px solid var(--primary)` : `1px solid ${statusBorder}`,
                        background: isSelected ? 'rgba(255, 206, 0, 0.08)' : statusBg,
                        cursor: 'pointer',
                        color: 'white',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span style={{ fontSize: '2rem' }}>{part.icon}</span>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{part.name}</span>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: data.status === 'OK' ? '#10b981' : data.status === 'WARNING' ? '#f59e0b' : '#ef4444',
                        color: 'black',
                        fontWeight: 'bold'
                      }}>
                        {data.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checklist Editor */}
            {selectedPartId && (
              <div className="glass-card" style={{ flex: '2 1 450px', display: 'flex', flexDirection: 'column', gap: '1.25rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.8rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>{selectedPartId && VEHICLE_PARTS.find(p => p.id === selectedPartId)?.icon}</span>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--primary)' }}>{selectedPartId && VEHICLE_PARTS.find(p => p.id === selectedPartId)?.name}</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedPartId && VEHICLE_PARTS.find(p => p.id === selectedPartId)?.desc}</p>
                  </div>
                </div>

                {/* Status Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Estado</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                        background: activeItemsData[selectedPartId]?.status === 'OK' ? '#10b981' : 'rgba(16,185,129,0.1)',
                        color: activeItemsData[selectedPartId]?.status === 'OK' ? 'black' : '#10b981'
                      }}
                      onClick={() => handleUpdatePart(selectedPartId, 'status', 'OK')}
                    >
                      ✓ Todo OK
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                        background: activeItemsData[selectedPartId]?.status === 'WARNING' ? '#f59e0b' : 'rgba(245,158,11,0.1)',
                        color: activeItemsData[selectedPartId]?.status === 'WARNING' ? 'black' : '#f59e0b'
                      }}
                      onClick={() => handleUpdatePart(selectedPartId, 'status', 'WARNING')}
                    >
                      ⚠️ Advertencia
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                        background: activeItemsData[selectedPartId]?.status === 'CRITICAL' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                        color: activeItemsData[selectedPartId]?.status === 'CRITICAL' ? 'white' : '#ef4444'
                      }}
                      onClick={() => handleUpdatePart(selectedPartId, 'status', 'CRITICAL')}
                    >
                      🚨 Crítico / Falla
                    </button>
                  </div>
                </div>

                {/* Media Recording */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>🎙️ Nota por Voz (IA)</label>
                    <button
                      className={`btn ${isRecording ? 'btn-danger' : 'btn-outline'}`}
                      style={{ width: '100%', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={loadingAi}
                    >
                      {isRecording ? <>🔴 Detener Grabación</> : <>🎤 Grabar Nota</>}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📸 Tomar Evidencia</label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      id="camera-upload-audit"
                      style={{ display: 'none' }}
                      onChange={handleImageUpload}
                    />
                    <button
                      className="btn btn-outline"
                      style={{ width: '100%', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                      onClick={() => document.getElementById('camera-upload-audit').click()}
                    >
                      📷 Subir Foto
                    </button>
                  </div>
                </div>

                {/* Preview and Text Note */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {activeItemsData[selectedPartId]?.image && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '120px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Foto:</span>
                      <div style={{ position: 'relative', width: '120px', height: '90px', borderRadius: '6px', overflow: 'hidden' }}>
                        <img src={activeItemsData[selectedPartId].image} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => handleUpdatePart(selectedPartId, 'image', null)}
                          style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer' }}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Notas de Diagnóstico</label>
                    <textarea
                      className="input-field"
                      style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
                      value={activeItemsData[selectedPartId]?.note || ''}
                      onChange={(e) => handleUpdatePart(selectedPartId, 'note', e.target.value)}
                    />
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>
      ) : (
        /* Regular List View */
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando listado de inspecciones...</div>
          ) : filteredInspections.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron inspecciones en este filtro.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '1rem' }}>Patente / Vehículo</th>
                  <th style={{ padding: '1rem' }}>Fecha</th>
                  <th style={{ padding: '1rem' }}>Mecánico</th>
                  <th style={{ padding: '1rem' }}>Estado</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInspections.map(ins => (
                  <tr key={ins.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ins.vehicle_plate}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ins.vehicle_make} {ins.vehicle_model}</div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{new Date(ins.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '1rem' }}>{ins.mechanic_username || 'S/A'}</td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`badge ${ins.status === 'COMPLETED' ? 'completed' : ins.status === 'IN_PROGRESS' ? 'in_progress' : 'pending'}`}>
                        {ins.status === 'COMPLETED' ? 'Completada' : ins.status === 'IN_PROGRESS' ? 'En Proceso' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      {ins.status === 'PENDING' ? (
                        <button className="btn btn-sm" onClick={() => handleTakeInspection(ins.id)}>
                          🛠️ Iniciar Auditoría
                        </button>
                      ) : ins.status === 'IN_PROGRESS' ? (
                        <button className="btn btn-outline btn-sm" onClick={() => openAuditView(ins)}>
                          ✏️ Continuar
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openAuditView(ins)}>
                            👁️ Ver Ficha
                          </button>
                          <button className="btn btn-sm" style={{ backgroundColor: 'var(--secondary)', color: 'black' }} onClick={() => openEstimateDraft(ins)}>
                            💰 Presupuesto
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Nueva Inspección Visual</h3>
              <button onClick={() => { setShowCreateModal(false); setShowQuickVehicleForm(false); setPlateQuery(''); setSearchedVehicle(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>

            {/* Step 1: Search Vehicle */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Buscar por Patente (Chilena)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Ej: AB1234 o ABCD12"
                  className="input-field"
                  value={plateQuery}
                  onChange={e => setPlateQuery(e.target.value)}
                />
                <button className="btn" onClick={handleSearchVehicle}>Buscar</button>
              </div>
              {searchedError && <p style={{ color: 'var(--status-red)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{searchedError}</p>}
            </div>

            {/* Quick Vehicle Form */}
            {showQuickVehicleForm && (
              <form onSubmit={handleCreateQuickVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: 0, color: 'var(--primary)' }}>🛠️ Registrar Vehículo Rápido</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Marca *</label>
                    <input className="input-field" type="text" required value={newVehicle.make} onChange={e => setNewVehicle({...newVehicle, make: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Modelo *</label>
                    <input className="input-field" type="text" required value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Año *</label>
                    <input className="input-field" type="number" required value={newVehicle.year} onChange={e => setNewVehicle({...newVehicle, year: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Kilometraje</label>
                    <input className="input-field" type="number" value={newVehicle.mileage} onChange={e => setNewVehicle({...newVehicle, mileage: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Transmisión</label>
                    <select className="input-field" style={{ backgroundColor: 'var(--bg-card)' }} value={newVehicle.transmission_type} onChange={e => setNewVehicle({...newVehicle, transmission_type: e.target.value})}>
                      <option value="MANUAL">Manual</option>
                      <option value="AUTOMATIC">Automática</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem' }}>Combustible</label>
                    <select className="input-field" style={{ backgroundColor: 'var(--bg-card)' }} value={newVehicle.fuel_type} onChange={e => setNewVehicle({...newVehicle, fuel_type: e.target.value})}>
                      <option value="GASOLINE">Gasolina</option>
                      <option value="DIESEL">Diesel</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn btn-outline" style={{ marginTop: '0.5rem' }}>✓ Guardar Vehículo</button>
              </form>
            )}

            {/* Selected Vehicle Info */}
            {searchedVehicle && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>✓ Vehículo Seleccionado</h4>
                <p style={{ margin: '0.2rem 0' }}><strong>Patente:</strong> {searchedVehicle.license_plate}</p>
                <p style={{ margin: '0.2rem 0' }}><strong>Vehículo:</strong> {searchedVehicle.make} {searchedVehicle.model} ({searchedVehicle.year})</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => { setShowCreateModal(false); setShowQuickVehicleForm(false); setPlateQuery(''); setSearchedVehicle(null); }}>Cancelar</button>
              <button className="btn" onClick={handleCreateInspection} disabled={!searchedVehicle}>Crear Inspección</button>
            </div>
          </div>
        </div>
      )}

      {/* Estimate/Budget Modal */}
      {showEstimateModal && selectedInspection && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Generar Presupuesto - {selectedInspection.vehicle_plate}</h3>
              <button onClick={() => setShowEstimateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              A continuación se listan las reparaciones y presupuestos sugeridos para los componentes marcados como <strong>Advertencia</strong> o <strong>Crítico</strong>:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {estimateItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '6px' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 2 }}
                    value={item.description}
                    onChange={e => {
                      const updated = [...estimateItems];
                      updated[idx].description = e.target.value;
                      setEstimateItems(updated);
                    }}
                  />
                  <input
                    type="number"
                    className="input-field"
                    style={{ width: '70px' }}
                    value={item.quantity}
                    onChange={e => {
                      const updated = [...estimateItems];
                      updated[idx].quantity = parseInt(e.target.value) || 0;
                      setEstimateItems(updated);
                    }}
                  />
                  <input
                    type="number"
                    className="input-field"
                    style={{ width: '110px' }}
                    value={item.unit_price}
                    onChange={e => {
                      const updated = [...estimateItems];
                      updated[idx].unit_price = parseFloat(e.target.value) || 0;
                      setEstimateItems(updated);
                    }}
                  />
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--status-red)', cursor: 'pointer', fontSize: '1.2rem' }}
                    onClick={() => {
                      setEstimateItems(estimateItems.filter((_, i) => i !== idx));
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setEstimateItems([...estimateItems, { description: 'Nuevo repuesto o servicio', quantity: 1, unit_price: 10000 }])}
              >
                + Añadir Item
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowEstimateModal(false)}>Cancelar</button>
              <button className="btn" onClick={handleCreateEstimate}>Generar Presupuesto</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default VisualInspection;
