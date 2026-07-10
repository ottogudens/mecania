import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';

const VEHICLE_PARTS = [
  { id: 'engine', name: 'Motor', icon: '🔧', desc: 'Nivel de aceite, mangueras, fugas y batería.' },
  { id: 'brakes', name: 'Frenos', icon: '🛑', desc: 'Pastillas, discos y líquido de frenos.' },
  { id: 'suspension', name: 'Suspensión', icon: '↕️', desc: 'Amortiguadores, bandejas y rótulas.' },
  { id: 'tires', name: 'Neumáticos', icon: '🛞', desc: 'Desgaste, presión y estado de llantas.' },
  { id: 'lights', name: 'Luces', icon: '💡', desc: 'Focos del., traseros, intermitentes.' },
  { id: 'bodywork', name: 'Carrocería', icon: '🚗', desc: 'Rayones, abolladuras, golpes exteriores.' },
  { id: 'interior', name: 'Interior', icon: '💺', desc: 'Cinturones, aire acondicionado, tablero.' },
  { id: 'exhaust', name: 'Escape', icon: '💨', desc: 'Fugas de humo, catalizador y silenciador.' }
];

const resizeImage = (file, maxWidth, maxHeight, quality) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      image.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const MechanicPortal = ({ onLogout }) => {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [assignedOrders, setAssignedOrders] = useState([]);
  
  // Visual Inspection States
  const [pendingInspections, setPendingInspections] = useState([]);
  const [assignedInspections, setAssignedInspections] = useState([]);
  
  const [portalTab, setPortalTab] = useState('orders'); // orders, inspections
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Details Modal State (Work Orders)
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mechanicFinding, setMechanicFinding] = useState('');
  const [savingFinding, setSavingFinding] = useState(false);

  // Active Inspection Modal State
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [selectedPartId, setSelectedPartId] = useState('engine');
  const [activeItemsData, setActiveItemsData] = useState({});

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const toast = useToast();

  useEffect(() => {
    if (token) {
      if (role !== 'mechanic') {
        setError("Acceso denegado. Este portal es de uso exclusivo para mecánicos.");
        setLoading(false);
      } else {
        fetchAllData();
      }
    } else {
      setLoading(false);
    }
  }, [token, role]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const currentToken = localStorage.getItem('token');
      
      // Fetch OTs
      const ordersRes = await axios.get('/api/operations/work-orders/', {
        headers: { Authorization: `Token ${currentToken}` }
      });
      const ordersData = ordersRes.data.results || ordersRes.data;
      setPendingOrders(ordersData.filter(ot => ot.status === 'PENDING' && !ot.mechanic));
      setAssignedOrders(ordersData.filter(ot => ot.mechanic_name === username));

      // Fetch Inspections
      const insRes = await axios.get('/api/operations/inspections/', {
        headers: { Authorization: `Token ${currentToken}` }
      });
      const insData = insRes.data.results || insRes.data;
      setPendingInspections(insData.filter(ins => ins.status === 'PENDING'));
      setAssignedInspections(insData.filter(ins => ins.mechanic_username === username));
      
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Error al cargar las tareas asignadas.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const response = await axios.post('/api/operations/login/', loginData);
      const data = response.data;
      if (data.role !== 'mechanic') {
        setLoginError("Acceso denegado. Este portal es de uso exclusivo para mecánicos.");
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('username', data.username);
      axios.defaults.headers.common['Authorization'] = `Token ${data.token}`;
      setToken(data.token);
      setRole(data.role);
      setUsername(data.username);
      if (onLogout) {
        onLogout(); 
      }
    } catch (err) {
      setLoginError("Credenciales incorrectas.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setRole(null);
    setUsername('');
    if (onLogout) {
      onLogout();
    }
  };

  // Work Orders status and taking
  const handleTakeOrder = async (orderId) => {
    try {
      const currentToken = localStorage.getItem('token');
      await axios.post(`/api/operations/work-orders/${orderId}/take_order/`, {}, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Orden Tomada', message: 'La OT ha sido asignada a tu lista de trabajo.', type: 'success' });
      fetchAllData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo tomar la orden.', type: 'error' });
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const currentToken = localStorage.getItem('token');
      const res = await axios.post(`/api/operations/work-orders/${orderId}/change_status/`, {
        status: newStatus
      }, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Estado Actualizado', message: `Orden pasada a ${newStatus}`, type: 'success' });
      fetchAllData();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.data);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Error de cambio de estado.';
      toast({ title: 'Error', message: msg, type: 'error' });
    }
  };

  const handleSaveFindings = async () => {
    if (!selectedOrder) return;
    setSavingFinding(true);
    try {
      const currentToken = localStorage.getItem('token');
      const res = await axios.patch(`/api/operations/work-orders/${selectedOrder.id}/`, {
        additional_findings: mechanicFinding
      }, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Hallazgo Guardado', message: 'Detalle registrado.', type: 'success' });
      setSelectedOrder(res.data);
      fetchAllData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo registrar.', type: 'error' });
    } finally {
      setSavingFinding(false);
    }
  };

  // Inspections taking & management
  const handleTakeInspection = async (id) => {
    try {
      const currentToken = localStorage.getItem('token');
      const res = await axios.post(`/api/operations/inspections/${id}/take_inspection/`, {}, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Inspección Tomada', message: 'Iniciada con éxito.', type: 'success' });
      
      const inspection = res.data;
      setSelectedInspection(inspection);
      setActiveItemsData(inspection.items_json || {});
      setShowInspectionModal(true);
      fetchAllData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo tomar la inspección.', type: 'error' });
    }
  };

  const openInspectionAudit = async (ins) => {
    let fullInspection = ins;
    if (!ins.items_json) {
      try {
        const currentToken = localStorage.getItem('token');
        const res = await axios.get(`/api/operations/inspections/${ins.id}/`, {
          headers: { Authorization: `Token ${currentToken}` }
        });
        fullInspection = res.data;
      } catch (err) {
        console.error("Error fetching inspection detail:", err);
        toast({ title: 'Error', message: 'No se pudo cargar el detalle de la inspección.', type: 'error' });
        return;
      }
    }
    setSelectedInspection(fullInspection);
    setActiveItemsData(fullInspection.items_json || {});
    setShowInspectionModal(true);
  };

  const handleUpdatePart = (partId, key, value) => {
    setActiveItemsData(prev => {
      const updated = {
        ...prev,
        [partId]: {
          ...prev[partId],
          [key]: value
        }
      };
      saveInspectionProgress(updated);
      return updated;
    });
  };

  const saveInspectionProgress = async (items) => {
    if (!selectedInspection) return;
    try {
      const currentToken = localStorage.getItem('token');
      await axios.patch(`/api/operations/inspections/${selectedInspection.id}/`, {
        items_json: items
      }, {
        headers: { Authorization: `Token ${currentToken}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const resized = await resizeImage(file, 1024, 1024, 0.7);
      handleUpdatePart(selectedPartId, 'image', resized);
      toast({ title: 'Foto Adjunta', message: 'Evidencia optimizada y cargada.', type: 'success' });
    } catch (err) {
      console.error("Error resizing image:", err);
      toast({ title: 'Error', message: 'No se pudo procesar la imagen.', type: 'error' });
    }
  };

  // Voice recording
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
      toast({ title: 'Grabando...', message: 'Habla ahora...', type: 'info' });
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
      
      const currentToken = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-transcribe/', formData, {
        headers: { 
          'Authorization': `Token ${currentToken}`,
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

  const handleCompleteInspection = async () => {
    if (!selectedInspection) return;
    try {
      const currentToken = localStorage.getItem('token');
      await axios.post(`/api/operations/inspections/${selectedInspection.id}/complete_inspection/`, {}, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Inspección Finalizada', message: 'Inspección completada con éxito.', type: 'success' });
      setShowInspectionModal(false);
      setSelectedInspection(null);
      fetchAllData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo completar la inspección.', type: 'error' });
    }
  };

  const openDetails = (order) => {
    setSelectedOrder(order);
    setMechanicFinding(order.additional_findings || '');
    setShowDetailsModal(true);
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)', width: '100vw', padding: '1rem' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '400px', border: '1px solid var(--border-accent)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ color: 'var(--primary)', fontWeight: 800 }}>MecanIA</h2>
            <p style={{ color: 'var(--text-muted)' }}>Portal de Mecánicos</p>
          </div>
          {loginError && <div style={{ color: 'var(--status-red)', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>{loginError}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Usuario</label>
              <input type="text" required className="input-field" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Contraseña</label>
              <input type="password" required className="input-field" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} />
            </div>
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem' }}>Iniciar Sesión</button>
          </form>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', flex: 1 }}></span>
              <span style={{ padding: '0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>¿No eres Mecánico?</span>
              <span style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', flex: 1 }}></span>
            </div>
            <Link to="/login" className="btn btn-outline" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '0.5rem', textDecoration: 'none' }}>
              ← Ir al Acceso Principal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
        <p style={{ color: 'var(--status-red)', fontSize: '1.2rem', marginBottom: '1rem' }}>{error}</p>
        <button className="btn" onClick={handleLogout}>Cerrar Sesión / Volver</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* Header */}
      <div className="mechanic-header">
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary)' }}>🛠️ Portal de Mecánicos</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Bienvenido, <strong>{username}</strong></p>
        </div>
        <button className="btn btn-outline" onClick={handleLogout}>Cerrar Sesión</button>
      </div>

      {/* Tabs */}
      <div className="mechanic-tabs-container">
        <button className={`btn ${portalTab === 'orders' ? '' : 'btn-outline'}`} onClick={() => setPortalTab('orders')}>
          📋 Órdenes de Trabajo (OT)
        </button>
        <button className={`btn ${portalTab === 'inspections' ? '' : 'btn-outline'}`} onClick={() => setPortalTab('inspections')}>
          🔍 Inspecciones Visuales
        </button>
      </div>

      {loading ? (
        <p>Cargando tareas pendientes...</p>
      ) : (
        <div>
          {portalTab === 'orders' ? (
            /* Work Orders view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              {/* OTs Disponibles (PENDING) */}
              <div>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>📋 OTs Pendientes Disponibles</h3>
                {pendingOrders.length === 0 ? (
                  <div className="glass-card" style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No hay nuevas OTs disponibles en este momento.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1rem' }}>
                    {pendingOrders.map(ot => (
                      <div key={ot.id} className="glass-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ot.vehicle?.license_plate}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>OT #{ot.id}</span>
                        </div>
                        <p style={{ margin: '0.2rem 0' }}>{ot.vehicle?.make} {ot.vehicle?.model} ({ot.vehicle?.year})</p>
                        <button className="btn" style={{ width: '100%', marginTop: '1rem' }} onClick={() => handleTakeOrder(ot.id)}>
                          🛠️ Iniciar Servicio
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mis OTs asignadas */}
              <div>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>🩺 Mis OTs Activas y Completadas</h3>
                {assignedOrders.length === 0 ? (
                  <div className="glass-card" style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Aún no tienes órdenes de trabajo asignadas.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.5rem' }}>
                    {assignedOrders.map(ot => (
                      <div key={ot.id} className="glass-card" style={{ borderLeft: ot.status === 'IN_PROGRESS' ? '4px solid var(--secondary)' : '4px solid var(--status-green)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ot.vehicle?.license_plate}</span>
                          <span className={`badge ${ot.status}`}>{ot.status}</span>
                        </div>
                        <p style={{ margin: '0.2rem 0' }}>{ot.vehicle?.make} {ot.vehicle?.model} ({ot.vehicle?.year})</p>
                        <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={() => openDetails(ot)}>
                          ✏️ Ver Detalles / Actualizar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Inspections view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              
              {/* Inspecciones Pendientes (PENDING) */}
              <div>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>📋 Inspecciones Pendientes Disponibles</h3>
                {pendingInspections.length === 0 ? (
                  <div className="glass-card" style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No hay inspecciones visuales pendientes en este momento.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1rem' }}>
                    {pendingInspections.map(ins => (
                      <div key={ins.id} className="glass-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ins.vehicle_plate}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Inspección #{ins.id}</span>
                        </div>
                        <p style={{ margin: '0.2rem 0' }}>{ins.vehicle_make} {ins.vehicle_model}</p>
                        <button className="btn" style={{ width: '100%', marginTop: '1rem' }} onClick={() => handleTakeInspection(ins.id)}>
                          🔍 Iniciar Inspección
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mis Inspecciones asignadas */}
              <div>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>🩺 Mis Inspecciones Activas y Completadas</h3>
                {assignedInspections.length === 0 ? (
                  <div className="glass-card" style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Aún no has tomado ninguna inspección visual.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.5rem' }}>
                    {assignedInspections.map(ins => (
                      <div key={ins.id} className="glass-card" style={{ borderLeft: ins.status === 'IN_PROGRESS' ? '4px solid var(--secondary)' : '4px solid var(--status-green)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ins.vehicle_plate}</span>
                          <span className={`badge ${ins.status}`}>{ins.status}</span>
                        </div>
                        <p style={{ margin: '0.2rem 0' }}>{ins.vehicle_make} {ins.vehicle_model}</p>
                        <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={() => openInspectionAudit(ins)}>
                          ✏️ Realizar / Ver Inspección
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* Details Modal (Work Orders) */}
      {showDetailsModal && selectedOrder && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card mechanic-modal-card" style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>OT #{selectedOrder.id} - {selectedOrder.vehicle?.license_plate}</h3>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            {/* OT content */}
            <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '1rem', fontSize: '0.95rem' }}>
              <div><strong>Auto:</strong> {selectedOrder.vehicle?.make} {selectedOrder.vehicle?.model}</div>
              <div><strong>Año:</strong> {selectedOrder.vehicle?.year}</div>
            </div>
            {/* Status action buttons */}
            {selectedOrder.status === 'IN_PROGRESS' && (
              <button className="btn" style={{ backgroundColor: '#10b981', width: '100%', marginBottom: '1rem' }} onClick={() => handleStatusChange(selectedOrder.id, 'COMPLETED')}>
                ✓ Terminar OT
              </button>
            )}
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowDetailsModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Inspection Modal (Audit Checklist) */}
      {showInspectionModal && selectedInspection && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card mechanic-modal-card" style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>Inspección #{selectedInspection.id} - {selectedInspection.vehicle_plate}</h3>
              <button onClick={() => setShowInspectionModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{selectedInspection.vehicle_make} {selectedInspection.vehicle_model} | Mecánico: {selectedInspection.mechanic_username}</p>
              {selectedInspection.status === 'IN_PROGRESS' && (
                <button className="btn btn-sm" style={{ backgroundColor: '#10b981' }} onClick={handleCompleteInspection}>
                  ✓ Finalizar Inspección
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap-reverse' }}>
              
              {/* Checklist selector */}
              <div style={{ flex: '1 1 250px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
                  {VEHICLE_PARTS.map(part => {
                    const data = activeItemsData[part.id] || { status: 'OK' };
                    const isSelected = part.id === selectedPartId;

                    let statusBorder = 'transparent';
                    if (data.status === 'WARNING') statusBorder = 'var(--secondary)';
                    else if (data.status === 'CRITICAL') statusBorder = 'var(--status-red)';
                    else if (data.status === 'OK') statusBorder = 'var(--status-green)';

                    return (
                      <button
                        key={part.id}
                        onClick={() => setSelectedPartId(part.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          border: isSelected ? `2px solid var(--primary)` : `1px solid ${statusBorder}`,
                          background: isSelected ? 'rgba(255, 206, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                          cursor: 'pointer',
                          color: 'white'
                        }}
                      >
                        <span style={{ fontSize: '1.5rem' }}>{part.icon}</span>
                        <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{part.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Checklist Editor */}
              {selectedPartId && (
                <div className="glass-card" style={{ flex: '2 1 280px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-color)', padding: '1rem', minWidth: '0' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)' }}>
                    {VEHICLE_PARTS.find(p => p.id === selectedPartId)?.icon} {VEHICLE_PARTS.find(p => p.id === selectedPartId)?.name}
                  </h4>
                  
                  {selectedInspection.status === 'IN_PROGRESS' ? (
                    <>
                      {/* Status selectors */}
                      <div className="status-selectors">
                        <button
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: activeItemsData[selectedPartId]?.status === 'OK' ? '#10b981' : 'rgba(16,185,129,0.1)', color: activeItemsData[selectedPartId]?.status === 'OK' ? 'black' : '#10b981' }}
                          onClick={() => handleUpdatePart(selectedPartId, 'status', 'OK')}
                        >Todo OK</button>
                        <button
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: activeItemsData[selectedPartId]?.status === 'WARNING' ? '#f59e0b' : 'rgba(245,158,11,0.1)', color: activeItemsData[selectedPartId]?.status === 'WARNING' ? 'black' : '#f59e0b' }}
                          onClick={() => handleUpdatePart(selectedPartId, 'status', 'WARNING')}
                        >Advertencia</button>
                        <button
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: activeItemsData[selectedPartId]?.status === 'CRITICAL' ? '#ef4444' : 'rgba(239,68,68,0.1)', color: activeItemsData[selectedPartId]?.status === 'CRITICAL' ? 'white' : '#ef4444' }}
                          onClick={() => handleUpdatePart(selectedPartId, 'status', 'CRITICAL')}
                        >Crítico</button>
                      </div>

                      {/* Recording and Camera */}
                      <div className="action-selectors">
                        <button className={`btn btn-sm ${isRecording ? 'btn-danger' : 'btn-outline'}`} style={{ flex: 1 }} onClick={isRecording ? stopRecording : startRecording}>
                          {isRecording ? '🔴 Parar' : '🎤 Grabar Voz'}
                        </button>
                        <input type="file" accept="image/*" capture="environment" id="mech-camera" style={{ display: 'none' }} onChange={handleImageUpload} />
                        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => document.getElementById('mech-camera').click()}>
                          📷 Foto
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Read-Only State badge */
                    <div>
                      Estado: <span className="badge">{activeItemsData[selectedPartId]?.status || 'OK'}</span>
                    </div>
                  )}

                  {/* Preview & Note */}
                  <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                    {activeItemsData[selectedPartId]?.image && (
                      <div style={{ position: 'relative', width: '120px', height: '90px', borderRadius: '6px', overflow: 'hidden' }}>
                        <img src={activeItemsData[selectedPartId].image} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {selectedInspection.status === 'IN_PROGRESS' && (
                          <button onClick={() => handleUpdatePart(selectedPartId, 'image', null)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer' }}>&times;</button>
                        )}
                      </div>
                    )}
                    <textarea
                      className="input-field"
                      style={{ width: '100%', minHeight: '85px' }}
                      value={activeItemsData[selectedPartId]?.note || ''}
                      onChange={(e) => selectedInspection.status === 'IN_PROGRESS' && handleUpdatePart(selectedPartId, 'note', e.target.value)}
                      readOnly={selectedInspection.status !== 'IN_PROGRESS'}
                      placeholder="Sin observaciones."
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <button className="btn btn-outline" onClick={() => setShowInspectionModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MechanicPortal;
