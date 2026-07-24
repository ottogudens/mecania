import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

export default function EstimatesDashboard() {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [viewState, setViewState] = useState('list'); // 'list' or 'new'
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Products & Services for the cart
  const [inventory, setInventory] = useState({ products: [], services: [] });
  
  const [newEstimate, setNewEstimate] = useState({
    client_id: '',
    vehicle_id: '',
    valid_until: '',
    items: [] // { type: 'product'|'service', id, name, price, qty }
  });

  const [cartItem, setCartItem] = useState({ type: 'product', id: '', qty: 1 });

  useEffect(() => {
    fetchEstimates();
    fetchFormDependencies();
  }, []);

  const fetchEstimates = () => {
    setLoading(true);
    axios.get('/api/finance/estimates/')
      .then(res => setEstimates(res.data.results || res.data))
      .catch(() => toast({ title: "Error al cargar presupuestos", type: "error" }))
      .finally(() => setLoading(false));
  };

  const fetchFormDependencies = () => {
    Promise.all([
      axios.get('/api/operations/clients/'),
      axios.get('/api/operations/vehicles/'),
      axios.get('/api/inventory/products/'),
      axios.get('/api/inventory/services/')
    ]).then(([cliRes, vehRes, prodRes, servRes]) => {
      setClients(cliRes.data.results || cliRes.data);
      setVehicles(vehRes.data.results || vehRes.data);
      setInventory({
        products: prodRes.data.results || prodRes.data,
        services: servRes.data.results || servRes.data
      });
    }).catch(console.error);
  };

  const filteredVehicles = vehicles.filter(v => v.client?.id === parseInt(newEstimate.client_id) || v.client_id === parseInt(newEstimate.client_id));

  const handleAddItem = () => {
    if (!cartItem.id) return;
    const isProd = cartItem.type === 'product';
    const itemData = isProd 
      ? inventory.products.find(p => p.id == cartItem.id)
      : inventory.services.find(s => s.id == cartItem.id);
      
    if (!itemData) return;
    
    // Check if already in cart
    const existing = newEstimate.items.findIndex(i => i.type === cartItem.type && i.id == cartItem.id);
    if (existing >= 0) {
      const newItems = [...newEstimate.items];
      newItems[existing].qty += parseInt(cartItem.qty);
      setNewEstimate({ ...newEstimate, items: newItems });
    } else {
      setNewEstimate({
        ...newEstimate, 
        items: [...newEstimate.items, {
          type: cartItem.type,
          id: itemData.id,
          name: itemData.name,
          price: parseFloat(itemData.price),
          qty: parseInt(cartItem.qty)
        }]
      });
    }
  };

  const [editingId, setEditingId] = useState(null);

  const handleRemoveItem = (index) => {
    const newItems = [...newEstimate.items];
    newItems.splice(index, 1);
    setNewEstimate({ ...newEstimate, items: newItems });
  };

  const handleEditEstimate = (estimate) => {
    setEditingId(estimate.id);
    setNewEstimate({
      client_id: String(estimate.client),
      vehicle_id: estimate.vehicle ? String(estimate.vehicle) : '',
      valid_until: estimate.valid_until || '',
      items: estimate.items.map(item => ({
        type: item.product ? 'product' : 'service',
        id: item.product || item.service,
        name: item.description,
        price: parseFloat(item.unit_price),
        qty: parseInt(item.quantity)
      }))
    });
    setViewState('new');
  };

  const handleDeleteEstimate = (id) => {
    if (!window.confirm("¿Está seguro de eliminar este presupuesto?")) return;
    axios.delete(`/api/finance/estimates/${id}/`)
      .then(() => {
        toast({ title: "Presupuesto eliminado exitosamente", type: "success" });
        fetchEstimates();
      })
      .catch(err => {
        console.error(err);
        toast({ title: "Error al eliminar presupuesto", type: "error" });
      });
  };

  const handleSaveEstimate = (e) => {
    e.preventDefault();
    if (!newEstimate.client_id || newEstimate.items.length === 0) {
      toast({ title: "Seleccione un cliente y añada ítems", type: "error" });
      return;
    }

    const payload = {
      client_id: parseInt(newEstimate.client_id),
      vehicle_id: newEstimate.vehicle_id ? parseInt(newEstimate.vehicle_id) : null,
      valid_until: newEstimate.valid_until || null,
      items: newEstimate.items.map(i => ({
        product_id: i.type === 'product' ? i.id : null,
        service_id: i.type === 'service' ? i.id : null,
        description: i.name,
        quantity: i.qty,
        unit_price: i.price
      }))
    };

    if (editingId) {
      axios.put(`/api/finance/estimates/${editingId}/`, payload)
        .then(() => {
          toast({ title: "Presupuesto actualizado exitosamente", type: "success" });
          setViewState('list');
          setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] });
          setEditingId(null);
          fetchEstimates();
        })
        .catch(err => {
          console.error(err);
          toast({ title: "Error al actualizar presupuesto", type: "error" });
        });
    } else {
      axios.post('/api/finance/estimates/', payload)
        .then(() => {
          toast({ title: "Presupuesto creado exitosamente", type: "success" });
          setViewState('list');
          setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] });
          fetchEstimates();
        })
        .catch(err => {
          console.error(err);
          toast({ title: "Error al crear presupuesto", type: "error" });
        });
    }
  };

  const downloadPDF = async (id) => {
    try {
      toast({ title: "Generando PDF...", type: "info" });
      const res = await axios.get(`/api/finance/estimates/${id}/pdf/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err) {
      console.error("PDF Error:", err);
      toast({ title: "Error al generar PDF", type: "error" });
    }
  };

  const sendWhatsApp = (id) => {
    toast({ title: "Enviando por WhatsApp...", type: "info" });
    axios.post(`/api/finance/estimates/${id}/share_whatsapp/`)
      .then(() => {
        toast({ title: "Mensaje enviado exitosamente", type: "success" });
        fetchEstimates();
      })
      .catch(err => {
        console.error(err);
        toast({ title: "Error al enviar WhatsApp. Asegúrese de que el cliente tiene teléfono.", type: "error" });
      });
  };
  
  const convertToWorkOrder = (id) => {
    if (!window.confirm("¿Convertir este presupuesto a una Orden de Trabajo?")) return;
    axios.post(`/api/finance/estimates/${id}/convert_to_work_order/`)
      .then(res => {
        toast({ title: `Orden de Trabajo OT-${res.data.work_order_id} creada!`, type: "success" });
        fetchEstimates();
      })
      .catch(err => {
        toast({ title: err.response?.data?.error || "Error al convertir a OT", type: "error" });
      });
  };

  const getStatusBadge = (status) => {
    const map = {
      'DRAFT': { cls: 'DRAFT', label: 'Borrador' },
      'SENT': { cls: 'SENT', label: 'Enviado' },
      'ACCEPTED': { cls: 'PAID', label: 'Aceptado' },
      'REJECTED': { cls: 'CANCELLED', label: 'Rechazado' }
    };
    const style = map[status] || map['DRAFT'];
    return (
      <span className={`badge ${style.cls}`}>
        {style.label}
      </span>
    );
  };

  if (viewState === 'new') {
    const grossTotal = newEstimate.items.reduce((acc, i) => acc + (i.price * i.qty), 0);
    const neto = Math.round(grossTotal / 1.19);
    const tax = grossTotal - neto;

    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <h2 style={{ color: 'var(--primary-color)', margin: 0 }}>
              {editingId ? '✏️ Editar Presupuesto' : '📋 Nuevo Presupuesto'}
            </h2>
            <button className="btn btn-ghost" onClick={() => { setViewState('list'); setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] }); setEditingId(null); }}>
              ← Volver
            </button>
          </div>

          <form onSubmit={handleSaveEstimate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                  Cliente *
                </label>
                <select 
                  className="glass-input" 
                  value={newEstimate.client_id} 
                  onChange={e => setNewEstimate({...newEstimate, client_id: e.target.value, vehicle_id: ''})} 
                  required
                >
                  <option value="">Seleccione un cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.rut || 'Sin RUT'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                  Vehículo (Opcional)
                </label>
                <select 
                  className="glass-input" 
                  value={newEstimate.vehicle_id} 
                  onChange={e => setNewEstimate({...newEstimate, vehicle_id: e.target.value})} 
                  disabled={!newEstimate.client_id}
                >
                  <option value="">Ninguno / Sin vehículo asignado</option>
                  {filteredVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.license_plate} - {v.make} {v.model}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                  Válido Hasta (Opcional)
                </label>
                <input 
                  type="date" 
                  className="glass-input" 
                  value={newEstimate.valid_until} 
                  onChange={e => setNewEstimate({...newEstimate, valid_until: e.target.value})} 
                />
              </div>
            </div>

            {/* Ítems Section */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                🛒 Ítems del Presupuesto
              </h3>

              {/* Agregar item bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 120px', gap: '0.75rem', alignItems: 'end', marginBottom: '1.25rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Tipo</label>
                  <select className="glass-input" style={{ padding: '0.4rem 0.6rem' }} value={cartItem.type} onChange={e => setCartItem({...cartItem, type: e.target.value, id: ''})}>
                    <option value="product">📦 Producto</option>
                    <option value="service">🔧 Servicio</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Ítem Catálogo</label>
                  <select className="glass-input" style={{ padding: '0.4rem 0.6rem' }} value={cartItem.id} onChange={e => setCartItem({...cartItem, id: e.target.value})}>
                    <option value="">Seleccionar ítem...</option>
                    {(cartItem.type === 'product' ? inventory.products : inventory.services).map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({fmt(item.price)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cant.</label>
                  <input type="number" min="1" className="glass-input" style={{ padding: '0.4rem 0.6rem' }} value={cartItem.qty} onChange={e => setCartItem({...cartItem, qty: e.target.value})} />
                </div>

                <button type="button" className="btn btn-primary" style={{ padding: '0.45rem 1rem' }} onClick={handleAddItem}>
                  + Agregar
                </button>
              </div>

              {/* Tabla de Ítems */}
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem' }}>Descripción</th>
                      <th style={{ padding: '0.75rem', width: '80px', textAlign: 'center' }}>Cant.</th>
                      <th style={{ padding: '0.75rem', width: '120px', textAlign: 'right' }}>Precio Unit.</th>
                      <th style={{ padding: '0.75rem', width: '120px', textAlign: 'right' }}>Subtotal</th>
                      <th style={{ padding: '0.75rem', width: '80px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newEstimate.items.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          No hay ítems agregados al presupuesto. Usa el selector superior para añadir repuestos o servicios.
                        </td>
                      </tr>
                    ) : newEstimate.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 500 }}>{item.name}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.qty}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{fmt(item.price)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary-color)' }}>
                          {fmt(item.price * item.qty)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: 'var(--status-red)', cursor: 'pointer', fontSize: '1rem' }} 
                            onClick={() => handleRemoveItem(idx)}
                            title="Quitar ítem"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              {newEstimate.items.length > 0 && (
                <div style={{
                  maxWidth: '320px', marginLeft: 'auto', background: 'rgba(0,0,0,0.3)',
                  padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <span>Monto Neto:</span>
                    <span>{fmt(neto)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <span>IVA (19%):</span>
                    <span>{fmt(tax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontWeight: 700, fontSize: '1.15rem' }}>
                    <span>TOTAL:</span>
                    <span style={{ color: 'var(--primary-color)' }}>{fmt(grossTotal)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => { setViewState('list'); setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] }); setEditingId(null); }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                  {editingId ? '💾 Actualizar Presupuesto' : '✅ Guardar Presupuesto'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>📄 Presupuestos y Cotizaciones</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Crea, envía e imprime cotizaciones para tus clientes
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] }); setViewState('new'); }}>
            + Nuevo Presupuesto
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Cargando presupuestos...
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Folio</th>
                  <th style={{ padding: '0.75rem' }}>Cliente</th>
                  <th style={{ padding: '0.75rem' }}>Vehículo</th>
                  <th style={{ padding: '0.75rem' }}>Fecha</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.85rem 0.75rem', fontWeight: 'bold' }}>PRE-{e.id}</td>
                    <td style={{ padding: '0.85rem 0.75rem' }}>{e.client_name} {e.client_last_name}</td>
                    <td style={{ padding: '0.85rem 0.75rem' }}>
                      {e.vehicle_license_plate ? (
                        <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white' }}>
                          {e.vehicle_license_plate}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(e.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      {fmt(parseFloat(e.total_amount))}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                      {getStatusBadge(e.status)}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => downloadPDF(e.id)} title="Descargar PDF">
                          📄 PDF
                        </button>
                        <button className="btn btn-whatsapp" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => sendWhatsApp(e.id)} title="Enviar por WhatsApp">
                          💬 WA
                        </button>
                        {e.status !== 'ACCEPTED' && (
                          <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleEditEstimate(e)} title="Editar Presupuesto">
                            ✏️
                          </button>
                        )}
                        <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDeleteEstimate(e.id)} title="Eliminar Presupuesto">
                          🗑️
                        </button>
                        {e.status !== 'ACCEPTED' && e.vehicle && (
                          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => convertToWorkOrder(e.id)} title="Convertir a Orden de Trabajo">
                            ➡️ OT
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {estimates.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No hay presupuestos registrados. Haz clic en "+ Nuevo Presupuesto" para crear la primera cotización.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
