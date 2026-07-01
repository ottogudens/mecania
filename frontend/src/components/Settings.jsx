import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const Settings = () => {
  const [waStatus, setWaStatus] = useState('loading');
  const [qrCode, setQrCode] = useState(null);
  
  const [workshopSettings, setWorkshopSettings] = useState({
    name: '', phone: '', address: '', email: '', website: '', logo_url: '', google_maps_link: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchWhatsAppStatus();
    fetchWorkshopSettings();
    
    // Poll every 5 seconds for status changes
    const interval = setInterval(fetchWhatsAppStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    const formData = new FormData();
    formData.append('name', workshopSettings.name);
    formData.append('phone', workshopSettings.phone);
    formData.append('address', workshopSettings.address);
    formData.append('email', workshopSettings.email);
    formData.append('website', workshopSettings.website || '');
    formData.append('google_maps_link', workshopSettings.google_maps_link || '');
    if (logoFile) {
      formData.append('logo', logoFile);
    }

    try {
      const res = await axios.put('/api/operations/settings/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setWorkshopSettings(res.data);
      setLogoFile(null);
      alert('Configuración guardada exitosamente.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="settings-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Configuración del Sistema</h2>
        <p style={{ color: 'var(--text-muted)' }}>Gestiona integraciones y servicios externos.</p>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* Workshop Profile Config */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1rem' }}>Perfil del Taller (Logos y PDF)</h3>
          <form onSubmit={handleSettingsSubmit} className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Nombre del Taller</label>
              <input type="text" value={workshopSettings.name} onChange={e => setWorkshopSettings({...workshopSettings, name: e.target.value})} required />
            </div>
            
            <div className="form-group">
              <label>Logo del Taller (Para PDFs)</label>
              {workshopSettings.logo_url && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <img src={workshopSettings.logo_url} alt="Logo" style={{ maxHeight: '60px' }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files[0])} />
            </div>

            <div className="form-group">
              <label>Teléfono</label>
              <input type="text" value={workshopSettings.phone} onChange={e => setWorkshopSettings({...workshopSettings, phone: e.target.value})} />
            </div>

            <div className="form-group">
              <label>Dirección</label>
              <input type="text" value={workshopSettings.address} onChange={e => setWorkshopSettings({...workshopSettings, address: e.target.value})} />
            </div>

            <div className="form-group">
              <label>Enlace Google Maps</label>
              <input type="url" placeholder="https://maps.google.com/..." value={workshopSettings.google_maps_link || ''} onChange={e => setWorkshopSettings({...workshopSettings, google_maps_link: e.target.value})} />
            </div>

            <div className="form-group">
              <label>Email Correo</label>
              <input type="email" value={workshopSettings.email} onChange={e => setWorkshopSettings({...workshopSettings, email: e.target.value})} />
            </div>

            <button type="submit" className="btn btn-primary" disabled={savingSettings}>
              {savingSettings ? 'Guardando...' : 'Guardar Perfil'}
            </button>
          </form>
        </div>

        {/* WhatsApp Bot Config */}
        <div className="glass-card" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
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
            Escanea el código QR con tu aplicación móvil de WhatsApp (Dispositivos Vinculados) para permitir que MecanIA envíe notificaciones automáticas y enlaces mágicos a los clientes.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '200px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            {waStatus === 'connected' ? (
              <div style={{ textAlign: 'center', color: '#10b981' }}>
                <i className="fa-solid fa-circle-check" style={{ fontSize: '4rem', marginBottom: '1rem' }}></i>
                <h4>WhatsApp Vinculado</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>El servicio de mensajería está activo.</p>
              </div>
            ) : waStatus === 'qr_ready' && qrCode ? (
              <div style={{ padding: '1rem', background: 'white', borderRadius: '12px' }}>
                <QRCodeSVG value={qrCode} size={200} />
              </div>
            ) : waStatus === 'loading' ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem' }}></i>
                <p>Verificando estado...</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#ef4444' }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
                <h4>Servicio No Disponible</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>El microservicio de Baileys no está en ejecución. Asegúrate de iniciar `node index.js` en el puerto 3001.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
