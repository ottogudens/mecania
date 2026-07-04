import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const Settings = ({ onSettingsUpdate }) => {
  const [activeTab, setActiveTab] = useState('taller');
  const [waStatus, setWaStatus] = useState('loading');
  const [qrCode, setQrCode] = useState(null);
  
  const [workshopSettings, setWorkshopSettings] = useState({
    name: '', phone: '', address: '', email: '', website: '', logo_url: '', google_maps_link: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // States for WhatsApp Flows
  const [flows, setFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null);
  const [flowForm, setFlowForm] = useState({
    name: '',
    trigger_type: 'keyword',
    keywords: '',
    action_type: 'static',
    response_text: '',
    is_active: true
  });

  useEffect(() => {
    fetchWhatsAppStatus();
    fetchWorkshopSettings();
    
    // Poll every 5 seconds for status changes
    const interval = setInterval(fetchWhatsAppStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'flujos') {
      fetchFlows();
    }
  }, [activeTab]);

  const fetchWorkshopSettings = async () => {
    try {
      const res = await axios.get('/api/operations/settings/');
      setWorkshopSettings(res.data);
    } catch (err) {
      console.error("Error fetching workshop settings:", err);
    }
  };

  const fetchWhatsAppStatus = async () => {
    try {
      const baseUrl = import.meta.env.VITE_WHATSAPP_SERVICE_URL || 'http://localhost:3001';
      const response = await axios.get(`${baseUrl}/api/status`);
      setWaStatus(response.data.status);
      setQrCode(response.data.qr);
    } catch (err) {
      console.error("Error connecting to WhatsApp microservice:", err);
      setWaStatus('error');
    }
  };

  const fetchFlows = async () => {
    setLoadingFlows(true);
    try {
      const res = await axios.get('/api/operations/whatsapp-flows/');
      setFlows(res.data);
    } catch (err) {
      console.error("Error fetching flows:", err);
    } finally {
      setLoadingFlows(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setWorkshopSettings(prev => ({
        ...prev,
        logo: reader.result,
        logo_url: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setSavingSettings(true);

    try {
      const res = await axios.put('/api/operations/settings/', {
        name: workshopSettings.name,
        phone: workshopSettings.phone,
        address: workshopSettings.address,
        email: workshopSettings.email,
        website: workshopSettings.website || '',
        google_maps_link: workshopSettings.google_maps_link || '',
        logo: workshopSettings.logo || null
      });
      setWorkshopSettings(res.data);
      if (onSettingsUpdate) {
        onSettingsUpdate();
      }
      alert('Configuración guardada exitosamente.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveFlow = async (e) => {
    e.preventDefault();
    try {
      if (editingFlow && editingFlow.id) {
        await axios.put(`/api/operations/whatsapp-flows/${editingFlow.id}/`, flowForm);
        alert('Flujo de automatización actualizado correctamente.');
      } else {
        await axios.post('/api/operations/whatsapp-flows/', flowForm);
        alert('Flujo de automatización creado de forma exitosa.');
      }
      setEditingFlow(null);
      fetchFlows();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el flujo de automatización.');
    }
  };

  const handleDeleteFlow = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este flujo?')) return;
    try {
      await axios.delete(`/api/operations/whatsapp-flows/${id}/`);
      alert('Flujo eliminado correctamente.');
      fetchFlows();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar el flujo.');
    }
  };

  const handleToggleFlowActive = async (flow) => {
    try {
      await axios.patch(`/api/operations/whatsapp-flows/${flow.id}/`, {
        is_active: !flow.is_active
      });
      fetchFlows();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el estado del flujo.');
    }
  };

  return (
    <div className="settings-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Configuración del Sistema</h2>
        <p style={{ color: 'var(--text-muted)' }}>Gestiona la información del taller, flujos del bot y la mensajería.</p>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('taller')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'taller' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'taller' ? 'white' : 'var(--text-muted)',
            fontWeight: '600',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <i className="fa-solid fa-gears"></i> Perfil del Taller
        </button>
        <button 
          onClick={() => setActiveTab('whatsapp')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'whatsapp' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'whatsapp' ? 'white' : 'var(--text-muted)',
            fontWeight: '600',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <i className="fa-brands fa-whatsapp"></i> Vinculación WhatsApp
        </button>
        <button 
          onClick={() => setActiveTab('flujos')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'flujos' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'flujos' ? 'white' : 'var(--text-muted)',
            fontWeight: '600',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <i className="fa-solid fa-diagram-project"></i> Flujos de Automatización
        </button>
      </div>

      {/* Tab 1: Workshop Settings */}
      {activeTab === 'taller' && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="glass-card" style={{ border: '1px solid var(--border-color)', maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Perfil del Taller (Logos y PDF)</h3>
            <form onSubmit={handleSettingsSubmit} className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nombre del Taller</label>
                <input className="input-field" type="text" value={workshopSettings.name} onChange={e => setWorkshopSettings({...workshopSettings, name: e.target.value})} required />
              </div>
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Logo del Taller (Para PDFs)</label>
                {workshopSettings.logo_url && (
                  <div style={{ marginBottom: '0.5rem', display: 'inline-block', padding: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px' }}>
                    <img src={workshopSettings.logo_url} alt="Logo" style={{ maxHeight: '60px', display: 'block' }} />
                  </div>
                )}
                <input className="input-field" type="file" accept="image/*" onChange={handleLogoChange} style={{ background: 'rgba(0,0,0,0.2)' }} />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Teléfono</label>
                <input className="input-field" type="text" value={workshopSettings.phone} onChange={e => setWorkshopSettings({...workshopSettings, phone: e.target.value})} />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Dirección</label>
                <input className="input-field" type="text" value={workshopSettings.address} onChange={e => setWorkshopSettings({...workshopSettings, address: e.target.value})} />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enlace Google Maps</label>
                <input className="input-field" type="url" placeholder="https://maps.google.com/..." value={workshopSettings.google_maps_link || ''} onChange={e => setWorkshopSettings({...workshopSettings, google_maps_link: e.target.value})} />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Email Correo</label>
                <input className="input-field" type="email" value={workshopSettings.email} onChange={e => setWorkshopSettings({...workshopSettings, email: e.target.value})} />
              </div>

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--primary)' }} disabled={savingSettings}>
                {savingSettings ? 'Guardando...' : 'Guardar Perfil'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: WhatsApp Link */}
      {activeTab === 'whatsapp' && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="glass-card" style={{ border: '1px solid var(--border-color)', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>
                <i className="fa-brands fa-whatsapp" style={{ color: '#25D366', marginRight: '8px' }}></i> 
                Integración WhatsApp
              </h3>
              <span className={`badge ${waStatus === 'connected' ? 'in_progress' : waStatus === 'qr_ready' ? 'pending' : 'error'}`} style={{ backgroundColor: waStatus === 'connected' ? 'rgba(16, 185, 129, 0.2)' : undefined, color: waStatus === 'connected' ? '#10b981' : undefined }}>
                {waStatus === 'connected' ? 'Conectado' : waStatus === 'qr_ready' ? 'Esperando Escaneo' : waStatus === 'loading' ? 'Cargando...' : 'Desconectado'}
              </span>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Escanea el código QR con tu aplicación móvil de WhatsApp (Dispositivos Vinculados) para permitir que MecanIA responda de manera automatizada y envíe el acceso al portal de clientes.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '260px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              {waStatus === 'connected' ? (
                <div style={{ textAlign: 'center', color: '#10b981' }}>
                  <i className="fa-solid fa-circle-check" style={{ fontSize: '4rem', marginBottom: '1rem' }}></i>
                  <h4>WhatsApp Vinculado</h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>El servicio de mensajería está activo e interactuando.</p>
                </div>
              ) : waStatus === 'qr_ready' && qrCode ? (
                <div style={{ padding: '1rem', background: 'white', borderRadius: '12px', display: 'inline-block' }}>
                  <QRCodeSVG value={qrCode} size={200} />
                </div>
              ) : waStatus === 'loading' ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--primary)' }}></i>
                  <p>Verificando estado de sincronización...</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#ef4444', padding: '2rem' }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '3.5rem', marginBottom: '1rem' }}></i>
                  <h4>Servicio no disponible temporalmente</h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '380px', margin: '0.5rem auto 0' }}>
                    El microservicio de mensajería Baileys no pudo ser contactado. Verifique que el servicio esté activo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Bot Flows Manager */}
      {activeTab === 'flujos' && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {editingFlow === null ? (
            <div className="glass-card" style={{ border: '1px solid var(--border-color)', padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--primary)' }}>Gestión de Respuestas y Flujos del Asistente</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                    Configura respuestas automáticas, desvíos rápidos a humanos o asistentes interactivos con IA.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setEditingFlow({ id: null });
                    setFlowForm({
                      name: '',
                      trigger_type: 'keyword',
                      keywords: '',
                      action_type: 'static',
                      response_text: '',
                      is_active: true
                    });
                  }} 
                  className="btn" 
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--success)' }}
                >
                  <i className="fa-solid fa-plus"></i> Nuevo Flujo
                </button>
              </div>

              {loadingFlows ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '1rem' }}></i>
                  <p style={{ color: 'var(--text-muted)' }}>Cargando flujos de trabajo...</p>
                </div>
              ) : flows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                  <i className="fa-solid fa-robot" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem' }}></i>
                  <h4>Sin flujos agregados</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '440px', margin: '0.5rem auto 1.5rem' }}>
                    Agrega flujos para responder palabras clave específicas como "horario", "ubicación", redireccinar a agentes humanos, o personalizar el comportamiento del bot de IA.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Nombre</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Disparador</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Keywords</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Acción</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Estado</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flows.map(flow => (
                        <tr key={flow.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                          <td style={{ padding: '16px 8px', fontWeight: '500' }}>{flow.name}</td>
                          <td style={{ padding: '16px 8px' }}>
                            <span 
                              style={{ 
                                padding: '4px 8px', 
                                borderRadius: '4px', 
                                fontSize: '0.8rem', 
                                backgroundColor: flow.trigger_type === 'welcome' ? 'rgba(16, 185, 129, 0.15)' : flow.trigger_type === 'keyword' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                                color: flow.trigger_type === 'welcome' ? '#10b981' : flow.trigger_type === 'keyword' ? '#3b82f6' : '#9ca3af'
                              }}
                            >
                              {flow.trigger_type_display || flow.trigger_type}
                            </span>
                          </td>
                          <td style={{ padding: '16px 8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {flow.trigger_type === 'keyword' ? flow.keywords : '—'}
                          </td>
                          <td style={{ padding: '16px 8px' }}>
                            <span 
                              style={{ 
                                padding: '4px 8px', 
                                borderRadius: '4px', 
                                fontSize: '0.8rem', 
                                backgroundColor: flow.action_type === 'ai_assistant' ? 'rgba(139, 92, 246, 0.15)' : flow.action_type === 'portal_link' ? 'rgba(59, 130, 246, 0.15)' : flow.action_type === 'human_transfer' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: flow.action_type === 'ai_assistant' ? '#8b5cf6' : flow.action_type === 'portal_link' ? '#3b82f6' : flow.action_type === 'human_transfer' ? '#ef4444' : '#f59e0b'
                              }}
                            >
                              {flow.action_type_display || flow.action_type}
                            </span>
                          </td>
                          <td style={{ padding: '16px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                checked={flow.is_active} 
                                onChange={() => handleToggleFlowActive(flow)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                              <span style={{ fontSize: '0.85rem', color: flow.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                                {flow.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <button 
                                onClick={() => {
                                  setEditingFlow(flow);
                                  setFlowForm({
                                    name: flow.name,
                                    trigger_type: flow.trigger_type,
                                    keywords: flow.keywords,
                                    action_type: flow.action_type,
                                    response_text: flow.response_text,
                                    is_active: flow.is_active
                                  });
                                }} 
                                style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              </button>
                              <button 
                                onClick={() => handleDeleteFlow(flow.id)} 
                                style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card" style={{ border: '1px solid var(--border-color)', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
              <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
                {editingFlow.id ? 'Editar Flujo de Automatización' : 'Crear Flujo de Automatización'}
              </h3>
              
              <form onSubmit={handleSaveFlow} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Nombre del Flujo *</label>
                    <input 
                      className="input-field" 
                      type="text" 
                      placeholder="Ej: Dudas de Ubicación, Respuestas de Precios..." 
                      value={flowForm.name} 
                      onChange={e => setFlowForm({...flowForm, name: e.target.value})} 
                      required 
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Tipo de Disparador (Trigger) *</label>
                    <select 
                      className="input-field" 
                      value={flowForm.trigger_type} 
                      onChange={e => setFlowForm({...flowForm, trigger_type: e.target.value})}
                      style={{ background: '#1e1e24', color: 'var(--text)', border: '1px solid var(--border-color)', borderRadius: '6px', height: '42px', padding: '0 10px' }}
                    >
                      <option value="keyword">Palabra Clave (Keyword)</option>
                      <option value="welcome">Mensaje de Bienvenida (Welcome)</option>
                      <option value="default">Respuesta por Defecto (Fallback)</option>
                    </select>
                  </div>
                </div>

                {flowForm.trigger_type === 'keyword' && (
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Palabras Clave (Separadas por comas) *</label>
                    <input 
                      className="input-field" 
                      type="text" 
                      placeholder="Ej: direccion, ubicación, taller, mapa, donde quedan" 
                      value={flowForm.keywords} 
                      onChange={e => setFlowForm({...flowForm, keywords: e.target.value})} 
                      required={flowForm.trigger_type === 'keyword'}
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Si el mensaje del cliente contiene alguna de estas palabras, se disparará este flujo.
                    </small>
                  </div>
                )}

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Acción a Ejecutar *</label>
                  <select 
                    className="input-field" 
                    value={flowForm.action_type} 
                    onChange={e => setFlowForm({...flowForm, action_type: e.target.value})}
                    style={{ background: '#1e1e24', color: 'var(--text)', border: '1px solid var(--border-color)', borderRadius: '6px', height: '42px', padding: '0 10px' }}
                  >
                    <option value="static">Mensaje de Texto Estático</option>
                    <option value="ai_assistant">Agente de IA (GPT)</option>
                    <option value="portal_link">Enviar Enlace de Acceso al Portal</option>
                    <option value="human_transfer">Derivar a Humano (Pausar Bot y Notificar)</option>
                  </select>
                </div>

                {flowForm.action_type !== 'portal_link' && (
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>
                      {flowForm.action_type === 'static' ? 'Mensaje de Respuesta Estático *' : 
                       flowForm.action_type === 'ai_assistant' ? 'Instrucciones Personalizadas del Agente (System Prompt) *' : 
                       'Mensaje al Derivar a Humano'}
                    </label>
                    <textarea 
                      className="input-field" 
                      rows={6}
                      placeholder={
                        flowForm.action_type === 'static' ? 'Ingrese el texto de la respuesta automática...' : 
                        flowForm.action_type === 'ai_assistant' ? 'Instrucciones específicas (ej: Eres especialista en cotizaciones, pídele la patente...)' : 
                        'Texto de respuesta para la transición a la atención humana...'
                      }
                      value={flowForm.response_text} 
                      onChange={e => setFlowForm({...flowForm, response_text: e.target.value})} 
                      required={flowForm.action_type === 'static' || flowForm.action_type === 'ai_assistant'}
                      style={{ padding: '10px', height: 'auto' }}
                    />
                  </div>
                )}

                {flowForm.action_type === 'portal_link' && (
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Mensaje Personalizado de Envío (Opcional)</label>
                    <textarea 
                      className="input-field" 
                      rows={3}
                      placeholder="Ej: Hola! Puedes ver el estado de tu vehículo en tu portal: {link}"
                      value={flowForm.response_text} 
                      onChange={e => setFlowForm({...flowForm, response_text: e.target.value})}
                      style={{ padding: '10px', height: 'auto' }}
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Usa la etiqueta `{'{link}'}` para indicar dónde quieres que se coloque la URL del portal del cliente.
                    </small>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    id="flow-active-checkbox"
                    checked={flowForm.is_active} 
                    onChange={e => setFlowForm({...flowForm, is_active: e.target.checked})}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="flow-active-checkbox" style={{ cursor: 'pointer', fontWeight: '500' }}>Activar este flujo</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setEditingFlow(null)} 
                    style={{ padding: '10px 20px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn" 
                    style={{ padding: '10px 20px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {editingFlow.id ? 'Guardar Cambios' : 'Crear Flujo'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Settings;
