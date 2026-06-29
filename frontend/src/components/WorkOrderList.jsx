import React, { useState, useEffect } from 'react';
import axios from 'axios';

const WorkOrderList = () => {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // AI State
  const [aiSymptoms, setAiSymptoms] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Catálogo de servicios y productos para agregar a OT
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [itemSource, setItemSource] = useState('manual'); // 'manual' | 'service' | 'product'
  const [selectedCatalogItem, setSelectedCatalogItem] = useState(null);
  const [newOrder, setNewOrder] = useState({
    vehicle_id: '',
    mileage: '',
    fuel_level: 50,
    status: 'PENDING'
  });

  const [newItem, setNewItem] = useState({
    description: '',
    quantity: 1,
    unit_price: 0
  });

  useEffect(() => {
    fetchData();

    // WebSocket connection for real-time updates
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running via Vite proxy (port 5173), we need to connect directly to Django (port 8000) or Railway backend
    const backendHost = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
    const wsUrl = `${wsProtocol}//${backendHost}/ws/work_orders/`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('Connected to WorkOrders WebSocket');
    };
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'work_order_updated') {
        console.log("WebSocket Update Received:", data.message);
        // Toast notification could go here
        fetchData(); // Re-fetch the orders to get the latest changes
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    return () => {
      socket.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [ordersRes, vehiclesRes] = await Promise.all([
        axios.get('/api/operations/work-orders/', { headers: { Authorization: `Token ${token}` } }),
        axios.get('/api/operations/vehicles/', { headers: { Authorization: `Token ${token}` } })
      ]);
      setOrders(ordersRes.data);
      setVehicles(vehiclesRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar datos. ¿Está funcionando el servidor Django?");
      setLoading(false);
    }
  };

  const handleNotifyClient = async (orderId) => {
    try {
      alert("Enviando notificación...");
      const token = localStorage.getItem('token');
      await axios.post(`/api/operations/work-orders/${orderId}/notify_client/`, {}, {
        headers: { Authorization: `Token ${token}` }
      });
      alert("¡Cliente notificado por WhatsApp con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al notificar al cliente. Verifique que el cliente tenga un número válido.");
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/operations/work-orders/', newOrder, {
        headers: { Authorization: `Token ${token}` }
      });
      setShowNewModal(false);
      setNewOrder({ vehicle_id: '', mileage: '', fuel_level: 50, status: 'PENDING' });
      fetchData();
      alert("OT creada exitosamente");
    } catch (err) {
      console.error(err);
      alert("Error al crear OT.");
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    
    try {
      const token = localStorage.getItem('token');
      let payload = { ...newItem, work_order: selectedOrder.id };

      // Si viene del catálogo, agregar referencia al servicio o producto
      if (itemSource === 'service' && selectedCatalogItem) {
        payload.service = selectedCatalogItem.id;
        payload.description = selectedCatalogItem.name;
        payload.unit_price = selectedCatalogItem.price;
      } else if (itemSource === 'product' && selectedCatalogItem) {
        payload.product = selectedCatalogItem.id;
        payload.description = selectedCatalogItem.name;
        payload.unit_price = selectedCatalogItem.price;
      }

      await axios.post('/api/operations/work-order-items/', payload, {
        headers: { Authorization: `Token ${token}` }
      });
      
      setNewItem({ description: '', quantity: 1, unit_price: 0 });
      setSelectedCatalogItem(null);
      setItemSource('manual');
      fetchData();
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      
    } catch (err) {
      console.error(err);
      alert("Error al añadir ítem.");
    }
  };

  const openDetails = (order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
    // Cargar catálogo al abrir el modal
    const token = localStorage.getItem('token');
    const h = { headers: { Authorization: `Token ${token}` } };
    Promise.all([
      axios.get('/api/inventory/services/?is_active=true', h),
      axios.get('/api/inventory/products/', h),
    ]).then(([s, p]) => {
      setCatalogServices(s.data.results || s.data);
      setCatalogProducts(p.data.results || p.data);
    }).catch(() => {});
  };

  const openAiModal = (order) => {
    setSelectedOrder(order);
    setAiSymptoms('');
    setAiResponse('');
    setShowAiModal(true);
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    setAiLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-diagnostics/', {
        symptoms: aiSymptoms
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      setAiResponse(response.data.diagnosis);
    } catch (err) {
      console.error(err);
      setAiResponse("Hubo un error al contactar a MecanIA. Por favor, intenta de nuevo.");
    }
    setAiLoading(false);
    setAiLoading(false);
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/generate_pdf/`, {
        headers: { Authorization: `Token ${token}` },
        responseType: 'blob' // Important for downloading files
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OT_${selectedOrder.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert("Error al generar PDF.");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Órdenes de Trabajo...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Órdenes de Trabajo Digitales (OT)</h2>
        <button className="btn" onClick={() => setShowNewModal(true)}>Crear Nueva OT</button>
      </div>
      
      {orders.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p>No se encontraron órdenes de trabajo. ¡Crea una para comenzar!</p>
        </div>
      ) : (
        <div className="grid-container">
          {orders.map(order => (
            <div key={order.id} className="glass-card">
              <div className="ot-header">
                <h3>{order.vehicle?.license_plate || 'N/A'}</h3>
                <span className={`badge ${order.status?.toLowerCase() || 'pending'}`}>
                  {order.status ? order.status.replace('_', ' ') : 'PENDIENTE'}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0', fontWeight: '500' }}>
                {order.vehicle?.make} {order.vehicle?.model}
              </p>
              
              <div className="ot-meta">
                <span>Kilometraje: {order.mileage?.toLocaleString()} km</span>
                <span>OT #{order.id}</span>
              </div>
              
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openDetails(order)}>Detalles / Repuestos</button>
                <button className="btn btn-outline" style={{ flex: 1, backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.3)' }} onClick={() => openAiModal(order)}>
                  🤖 Consultar MecanIA
                </button>
                <button 
                  className="btn" 
                  style={{ flex: '1 1 100%', backgroundColor: '#25D366', color: 'white' }}
                  onClick={() => handleNotifyClient(order.id)}
                >
                  <i className="fa-brands fa-whatsapp" style={{ marginRight: '8px' }}></i> Notificar WhatsApp
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nueva OT */}
      {showNewModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Crear Nueva OT</h3>
              <button onClick={() => setShowNewModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Vehículo</label>
                <select 
                  className="input-field" style={{ width: '100%' }} required
                  value={newOrder.vehicle_id} 
                  onChange={(e) => setNewOrder({...newOrder, vehicle_id: e.target.value})}
                >
                  <option value="">Seleccione un vehículo...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.license_plate} - {v.make} {v.model}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Kilometraje Actual</label>
                <input 
                  type="number" className="input-field" style={{ width: '100%' }} required
                  value={newOrder.mileage} 
                  onChange={(e) => setNewOrder({...newOrder, mileage: e.target.value})}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nivel de Combustible (%)</label>
                <input 
                  type="number" min="0" max="100" className="input-field" style={{ width: '100%' }} required
                  value={newOrder.fuel_level} 
                  onChange={(e) => setNewOrder({...newOrder, fuel_level: e.target.value})}
                />
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowNewModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Crear OT</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalles / Repuestos */}
      {showDetailsModal && selectedOrder && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>OT #{selectedOrder.id} - {selectedOrder.vehicle?.license_plate}</h3>
                <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', borderColor: '#3b82f6', color: '#3b82f6' }} onClick={handleDownloadPDF}>
                  <i className="fa-solid fa-file-pdf"></i> Descargar PDF
                </button>
              </div>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            <div style={{ marginBottom: '2rem' }}>
              <h4>Repuestos y Servicios</h4>
              {(!selectedOrder.items || selectedOrder.items.length === 0) ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay repuestos agregados a esta orden aún.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>Descripción</th>
                      <th style={{ padding: '0.5rem' }}>Cantidad</th>
                      <th style={{ padding: '0.5rem' }}>Precio Unitario</th>
                      <th style={{ padding: '0.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem' }}>{item.description}</td>
                        <td style={{ padding: '0.5rem' }}>{item.quantity}</td>
                        <td style={{ padding: '0.5rem' }}>${item.unit_price}</td>
                        <td style={{ padding: '0.5rem' }}>${(item.quantity * item.unit_price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h4>Añadir Repuesto / Servicio</h4>

              {/* selector de fuente */}
              <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', background: 'rgba(0,0,0,0.3)', padding: '0.3rem', borderRadius: 8, width: 'fit-content' }}>
                {[['manual','✏️ Manual'], ['service','🔧 Del catálogo'], ['product','📦 Del inventario']].map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => { setItemSource(val); setSelectedCatalogItem(null); setNewItem({ description: '', quantity: 1, unit_price: 0 }); }}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: itemSource === val ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                      color: itemSource === val ? '#000' : 'var(--text-muted)',
                      fontWeight: itemSource === val ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem',
                    }}>{lbl}</button>
                ))}
              </div>

              <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* selector de catálogo */}
                {itemSource === 'service' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Servicio del catálogo</label>
                    <select
                      style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.7rem', color: '#fff', fontFamily: 'Outfit, sans-serif' }}
                      value={selectedCatalogItem?.id || ''}
                      onChange={e => {
                        const s = catalogServices.find(x => String(x.id) === e.target.value);
                        setSelectedCatalogItem(s || null);
                        if (s) setNewItem(n => ({ ...n, description: s.name, unit_price: s.price }));
                      }}
                      required
                    >
                      <option value="">Seleccionar servicio...</option>
                      {catalogServices.map(s => (
                        <option key={s.id} value={s.id}>{s.name} — ${Number(s.price).toLocaleString('es-CL')}</option>
                      ))}
                    </select>
                  </div>
                )}

                {itemSource === 'product' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Producto del inventario</label>
                    <select
                      style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.7rem', color: '#fff', fontFamily: 'Outfit, sans-serif' }}
                      value={selectedCatalogItem?.id || ''}
                      onChange={e => {
                        const p = catalogProducts.find(x => String(x.id) === e.target.value);
                        setSelectedCatalogItem(p || null);
                        if (p) setNewItem(n => ({ ...n, description: p.name, unit_price: p.price }));
                      }}
                      required
                    >
                      <option value="">Seleccionar producto...</option>
                      {catalogProducts.map(p => (
                        <option key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                          {p.name} ({p.sku}) — Stock: {p.stock_quantity} — ${Number(p.price).toLocaleString('es-CL')}
                          {p.stock_quantity <= 0 ? ' ⚠️ Sin stock' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {itemSource === 'manual' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Descripción</label>
                    <input type="text" className="input-field" style={{ width: '100%' }} required
                      value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})}
                    />
                  </div>
                )}

                <div style={{ flex: '1 1 15%' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Cantidad</label>
                  <input type="number" step="0.01" min="0.01" className="input-field" style={{ width: '100%' }} required
                    value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})}
                  />
                </div>
                <div style={{ flex: '1 1 20%' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Precio U.</label>
                  <input type="number" step="0.01" className="input-field" style={{ width: '100%' }} required
                    value={newItem.unit_price} onChange={e => setNewItem({...newItem, unit_price: e.target.value})}
                  />
                </div>
                <div>
                  <button type="submit" className="btn" style={{ padding: '0.75rem 1.5rem' }}>Añadir</button>
                </div>
              </form>
            </div>
            
          </div>
        </div>
      )}

      {/* Modal Inteligencia Artificial */}
      {showAiModal && selectedOrder && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.95))', border: '1px solid rgba(59,130,246,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#60a5fa' }}>🤖 MecanIA - Diagnóstico Asistido</h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            <form onSubmit={handleAiSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Describe los síntomas del vehículo (OT #{selectedOrder.id})</label>
                <textarea 
                  className="input-field" style={{ width: '100%', minHeight: '100px', resize: 'vertical' }} required
                  placeholder="Ej: El motor hace un ruido metálico al pasar de 3000 RPM y el escape saca humo azul..."
                  value={aiSymptoms} 
                  onChange={(e) => setAiSymptoms(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn" style={{ background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', border: 'none' }} disabled={aiLoading}>
                  {aiLoading ? 'Analizando...' : 'Solicitar Pre-Diagnóstico'}
                </button>
              </div>
            </form>

            {aiResponse && (
              <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', borderLeft: '4px solid #8b5cf6' }}>
                <h4 style={{ color: '#c4b5fd', marginTop: 0, marginBottom: '1rem' }}>Respuesta de MecanIA:</h4>
                <div style={{ color: 'var(--text-light)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {aiResponse}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkOrderList;
