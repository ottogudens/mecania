import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ClientPortal = () => {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('LOGIN'); // LOGIN, OTP_SENT, AUTHENTICATED
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientData, setClientData] = useState([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (phone) {
      setLoading(true);
      setError('');
      try {
        await axios.post('/api/operations/client/login/', { phone });
        // Simular envío de Magic Link
        setStep('OTP_SENT');
      } catch (err) {
        setError(err.response?.data?.error || 'Número no registrado.');
      } finally {
        setLoading(false);
      }
    }
  };

  const simulateMagicLinkClick = () => {
    setLoading(true);
    setTimeout(() => {
      setStep('AUTHENTICATED');
      fetchClientData();
      setLoading(false);
    }, 1500);
  };

  const fetchClientData = async () => {
    try {
      const response = await axios.get(`/api/operations/client/data/?phone=${encodeURIComponent(phone)}`);
      setClientData(response.data);
    } catch (err) {
      console.error("Error fetching client data:", err);
    }
  };

  useEffect(() => {
    if (step === 'AUTHENTICATED') {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let backendHost = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
      backendHost = backendHost.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}//${backendHost}/ws/work_orders/`;
      
      const socket = new WebSocket(wsUrl);
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'work_order_updated') {
          console.log("Real-time update:", data.message);
          // Re-fetch client data to get the latest status
          fetchClientData();
        }
      };
      
      return () => socket.close();
    }
  }, [step]);

  // UI para Login
  if (step === 'LOGIN') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="glass-card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', padding: '3rem 2rem', background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <i className="fa-solid fa-car" style={{ fontSize: '2rem', color: 'white' }}></i>
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: '600', marginBottom: '0.5rem' }}>Portal de Clientes</h2>
            <p style={{ color: 'var(--text-muted)' }}>Ingresa tu número de WhatsApp para acceder al estado de tu vehículo en tiempo real.</p>
          </div>

          {error && (
            <div style={{ color: '#fca5a5', background: 'rgba(248, 113, 113, 0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <i className="fa-brands fa-whatsapp" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#25D366', fontSize: '1.2rem' }}></i>
              <input 
                type="tel" 
                placeholder="+56 9 1234 5678" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ 
                  width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '12px', 
                  border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(15,23,42,0.6)',
                  color: '#fff', fontFamily: 'Outfit', fontSize: '1rem',
                  outline: 'none', transition: 'all 0.3s ease'
                }}
                required
              />
            </div>
            
            <button type="submit" className="btn" style={{ width: '100%', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', border: 'none', padding: '1rem', fontSize: '1.1rem', fontWeight: '500' }} disabled={loading}>
              {loading ? 'Verificando...' : 'Obtener Enlace Mágico'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // UI para Magic Link Enviado
  if (step === 'OTP_SENT') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="glass-card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ marginBottom: '2rem' }}>
            <i className="fa-brands fa-whatsapp" style={{ fontSize: '4rem', color: '#25D366', marginBottom: '1rem' }}></i>
            <h2 style={{ color: '#fff', marginBottom: '1rem' }}>¡Enlace Enviado!</h2>
            <p style={{ color: 'var(--text-light)', lineHeight: '1.6' }}>
              Hemos enviado un enlace mágico a tu WhatsApp <strong>{phone}</strong>. 
              <br/><br/>En un entorno de producción, tocarías el enlace en tu celular. Para esta demo, presiona el botón abajo.
            </p>
          </div>
          
          <button onClick={simulateMagicLinkClick} className="btn" style={{ width: '100%', backgroundColor: '#25D366', color: 'white' }} disabled={loading}>
            {loading ? 'Accediendo...' : 'Simular Click en Enlace'}
          </button>
        </div>
      </div>
    );
  }

  // UI para Portal del Cliente (AUTHENTICATED)
  return (
    <div className="client-portal-dashboard" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div className="header" style={{ marginBottom: '3rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Mis Vehículos
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Monitorea el estado de tus reparaciones en tiempo real.</p>
        </div>
        <button onClick={() => setStep('LOGIN')} className="btn btn-outline" style={{ borderColor: 'rgba(255,76,76,0.5)', color: '#ff4c4c' }}>Cerrar Sesión</button>
      </div>

      {clientData.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <i className="fa-solid fa-car-side" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem' }}></i>
          <h3>Sin vehículos en el taller</h3>
          <p style={{ color: 'var(--text-muted)' }}>No tienes reparaciones activas en este momento.</p>
        </div>
      ) : (
        <div className="grid-container" style={{ gap: '2rem' }}>
          {clientData.map((data, index) => (
            <div key={index} className="glass-card" style={{ position: 'relative', overflow: 'hidden', padding: '2rem' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, rgba(0,0,0,0) 70%)', transform: 'translate(30%, -30%)' }}></div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <i className="fa-solid fa-car" style={{ fontSize: '1.8rem', color: '#60a5fa' }}></i>
                </div>
                <div>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>{data.vehicle.make} {data.vehicle.model}</h3>
                  <div style={{ display: 'inline-block', padding: '0.2rem 0.8rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', letterSpacing: '2px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    {data.vehicle.license_plate}
                  </div>
                </div>
              </div>
              
              <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Órdenes de Trabajo Activas</h4>
              
              {data.active_orders.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>El vehículo está listo o no tiene órdenes activas.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {data.active_orders.map(order => {
                    // Determinar colores y progreso según estado
                    let statusColor = '#94a3b8';
                    let progress = 0;
                    
                    if(order.raw_status === 'PENDING') { statusColor = '#f59e0b'; progress = 25; }
                    else if(order.raw_status === 'IN_PROGRESS') { statusColor = '#3b82f6'; progress = 60; }
                    else if(order.raw_status === 'READY_FOR_PICKUP') { statusColor = '#10b981'; progress = 100; }
                    
                    return (
                      <div key={order.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <span style={{ fontWeight: '600' }}>OT #{order.id} - {order.service}</span>
                          <span style={{ color: statusColor, fontWeight: 'bold', fontSize: '0.9rem', padding: '0.3rem 0.8rem', background: `${statusColor}20`, borderRadius: '20px' }}>
                            {order.status}
                          </span>
                        </div>
                        
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: statusColor, transition: 'width 1s ease-in-out' }}></div>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <span>Recepcionado</span>
                          <span>En Revisión/Taller</span>
                          <span>Listo para Retiro</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {data.past_orders && data.past_orders.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                  <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>
                    <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '8px' }}></i>
                    Historial de Reparaciones (Completadas)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {data.past_orders.map(order => (
                      <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                        <div>
                          <span style={{ fontWeight: '500', display: 'block' }}>OT #{order.id} - {order.service}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString()}</span>
                        </div>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>Ver Detalle</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientPortal;
