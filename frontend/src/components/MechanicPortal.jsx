import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const MechanicPortal = () => {
  const [orders, setOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [assignedOrders, setAssignedOrders] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Details Modal State
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mechanicFinding, setMechanicFinding] = useState('');
  const [savingFinding, setSavingFinding] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (token) {
      if (role !== 'mechanic') {
        setError("Acceso denegado. Este portal es de uso exclusivo para mecánicos.");
        setLoading(false);
      } else {
        fetchOrders();
      }
    } else {
      setLoading(false);
    }
  }, [token, role]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const currentToken = localStorage.getItem('token');
      const response = await axios.get('/api/operations/work-orders/', {
        headers: { Authorization: `Token ${currentToken}` }
      });
      const data = response.data.results || response.data;
      
      // Filter pending orders (no mechanic assigned and status PENDING)
      const pending = data.filter(ot => ot.status === 'PENDING' && !ot.mechanic);
      // Filter assigned to this user
      const assigned = data.filter(ot => ot.mechanic_name === username);
      
      setPendingOrders(pending);
      setAssignedOrders(assigned);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Error al cargar las órdenes de trabajo.");
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
    } catch (err) {
      setLoginError("Credenciales incorrectas o problema de conexión.");
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
  };

  const handleTakeOrder = async (orderId) => {
    try {
      const currentToken = localStorage.getItem('token');
      await axios.post(`/api/operations/work-orders/${orderId}/take_order/`, {}, {
        headers: { Authorization: `Token ${currentToken}` }
      });
      toast({ title: 'Orden Tomada', message: 'La OT ha sido asignada a tu lista de trabajo.', type: 'success' });
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo tomar la orden de trabajo.', type: 'error' });
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
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.data);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'No se pudo cambiar el estado.';
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
      toast({ title: 'Hallazgo Guardado', message: 'Detalle ingresado correctamente.', type: 'success' });
      setSelectedOrder(res.data);
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo registrar el hallazgo.', type: 'error' });
    } finally {
      setSavingFinding(false);
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
              <input 
                type="text" 
                required 
                className="input-field" 
                value={loginData.username} 
                onChange={e => setLoginData({...loginData, username: e.target.value})} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Contraseña</label>
              <input 
                type="password" 
                required 
                className="input-field" 
                value={loginData.password} 
                onChange={e => setLoginData({...loginData, password: e.target.value})} 
              />
            </div>
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem' }}>Iniciar Sesión</button>
          </form>
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
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary)' }}>🛠️ Portal de Mecánicos</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Bienvenido, <strong>{username}</strong></p>
        </div>
        <button className="btn btn-outline" onClick={handleLogout}>Cerrar Sesión</button>
      </div>

      {loading ? (
        <p>Cargando órdenes de trabajo...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          
          {/* OTs Disponibles (PENDING) */}
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>📋 Órdenes de Trabajo Pendientes (Disponibles)</h3>
            {pendingOrders.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)' }}>No hay nuevas órdenes de trabajo disponibles en este momento.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {pendingOrders.map(ot => (
                  <div key={ot.id} className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ot.vehicle?.license_plate}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>OT #{ot.id}</span>
                    </div>
                    <p style={{ margin: '0.2rem 0' }}>{ot.vehicle?.make} {ot.vehicle?.model} ({ot.vehicle?.year})</p>
                    {ot.symptoms && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontSize: '0.9rem' }}>
                        <strong>Síntomas:</strong> {ot.symptoms}
                      </div>
                    )}
                    <button 
                      className="btn" 
                      style={{ width: '100%', marginTop: '1rem', backgroundColor: 'var(--primary)' }}
                      onClick={() => handleTakeOrder(ot.id)}
                    >
                      🛠️ Tomar OT (Iniciar Trabajo)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mis OTs asignadas */}
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>🩺 Mi Historial y Trabajo Asignado</h3>
            {assignedOrders.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)' }}>Aún no has tomado ninguna orden de trabajo.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {assignedOrders.map(ot => (
                  <div key={ot.id} className="glass-card" style={{ borderLeft: ot.status === 'IN_PROGRESS' ? '4px solid var(--secondary)' : '4px solid var(--status-green)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🚗 {ot.vehicle?.license_plate}</span>
                      <span className={`badge ${ot.status}`}>{ot.status}</span>
                    </div>
                    <p style={{ margin: '0.2rem 0' }}>{ot.vehicle?.make} {ot.vehicle?.model} ({ot.vehicle?.year})</p>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      <div>OT #{ot.id} | {new Date(ot.created_at).toLocaleDateString()}</div>
                      <div>Kilometraje: {ot.mileage?.toLocaleString()} km</div>
                    </div>
                    <button 
                      className="btn btn-outline" 
                      style={{ width: '100%', marginTop: '1rem' }}
                      onClick={() => openDetails(ot)}
                    >
                      ✏️ Ver Detalles / Actualizar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>OT #{selectedOrder.id} - {selectedOrder.vehicle?.license_plate}</h3>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>

            <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.95rem' }}>
              <div><strong>Auto:</strong> {selectedOrder.vehicle?.make} {selectedOrder.vehicle?.model}</div>
              <div><strong>Año:</strong> {selectedOrder.vehicle?.year}</div>
              <div><strong>Transmisión:</strong> {selectedOrder.vehicle?.transmission_type}</div>
              <div><strong>Combustible:</strong> {selectedOrder.vehicle?.fuel_type}</div>
            </div>

            {selectedOrder.symptoms && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <strong>Síntomas Reportados:</strong>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>{selectedOrder.symptoms}</p>
              </div>
            )}

            {/* Status Control */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--secondary)' }}>Acciones de Estado</h4>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span>Estado: <span className="badge">{selectedOrder.status}</span></span>
                {selectedOrder.status === 'IN_PROGRESS' && (
                  <button className="btn" style={{ backgroundColor: '#10b981' }} onClick={() => handleStatusChange(selectedOrder.id, 'COMPLETED')}>
                    ✓ Terminar Servicio (Completado)
                  </button>
                )}
              </div>
            </div>

            {/* Findings */}
            {selectedOrder.status === 'IN_PROGRESS' && (
              <div style={{ marginBottom: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>⚠️ Detalle o Hallazgo Encontrado</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Si detectas algún problema extra que requiera revisión, regístralo aquí:</p>
                <textarea 
                  className="input-field"
                  style={{ width: '100%', minHeight: '80px' }}
                  placeholder="Describa el problema extra encontrado..."
                  value={mechanicFinding}
                  onChange={e => setMechanicFinding(e.target.value)}
                />
                <button className="btn" style={{ marginTop: '0.5rem' }} onClick={handleSaveFindings} disabled={savingFinding}>
                  {savingFinding ? 'Guardando...' : 'Guardar Hallazgo'}
                </button>
              </div>
            )}

            {selectedOrder.additional_findings && (
              <div style={{ padding: '0.8rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', borderLeft: '4px solid var(--status-red)' }}>
                <div><strong>Problema extra reportado:</strong> "{selectedOrder.additional_findings}"</div>
                <div>Aprobación del cliente: <strong>{selectedOrder.findings_approved ? 'APROBADO ✓' : 'PENDIENTE'}</strong></div>
              </div>
            )}

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowDetailsModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MechanicPortal;
