import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

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
      .catch(err => toast({ title: "Error al cargar presupuestos", type: "error" }))
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
        .then(res => {
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
        .then(res => {
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
      .then(res => {
        toast({ title: "Mensaje enviado exitosamente", type: "success" });
        fetchEstimates();
      })
      .catch(err => {
        console.error(err);
        toast({ title: "Error al enviar WhatsApp. Asegúrese de que el cliente tiene teléfono y el servicio WA está activo.", type: "error" });
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
      'DRAFT': { bg: '#e2e8f0', color: '#475569', label: 'Borrador' },
      'SENT': { bg: '#dbeafe', color: '#2563eb', label: 'Enviado' },
      'ACCEPTED': { bg: '#dcfce3', color: '#16a34a', label: 'Aceptado' },
      'REJECTED': { bg: '#fee2e2', color: '#dc2626', label: 'Rechazado' }
    };
    const style = map[status] || map['DRAFT'];
    return (
      <span style={{ backgroundColor: style.bg, color: style.color, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>
        {style.label}
      </span>
    );
  };

  if (viewState === 'new') {
    const total = newEstimate.items.reduce((acc, i) => acc + (i.price * i.qty), 0);
    const tax = total * 0.19;
    const grandTotal = total + tax;

    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>{editingId ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</h2>
          <button className="btn btn-secondary" onClick={() => { setViewState('list'); setNewEstimate({ client_id: '', vehicle_id: '', valid_until: '', items: [] }); setEditingId(null); }}>Volver</button>
        </div>
        <form onSubmit={handleSaveEstimate} className="form-grid">
          <div className="form-group">
            <label>Cliente</label>
            <select value={newEstimate.client_id} onChange={e => setNewEstimate({...newEstimate, client_id: e.target.value})} required>
              <option value="">Seleccione un cliente...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Vehículo (Opcional)</label>
            <select value={newEstimate.vehicle_id} onChange={e => setNewEstimate({...newEstimate, vehicle_id: e.target.value})} disabled={!newEstimate.client_id}>
              <option value="">Ninguno o Seleccione...</option>
              {filteredVehicles.map(v => <option key={v.id} value={v.id}>{v.license_plate} - {v.make} {v.model}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Válido Hasta (Opcional)</label>
            <input type="date" value={newEstimate.valid_until} onChange={e => setNewEstimate({...newEstimate, valid_until: e.target.value})} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <h3>Ítems del Presupuesto</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>Tipo</label>
                <select value={cartItem.type} onChange={e => setCartItem({...cartItem, type: e.target.value, id: ''})}>
                  <option value="product">Producto</option>
                  <option value="service">Servicio</option>
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label>Ítem</label>
                <select value={cartItem.id} onChange={e => setCartItem({...cartItem, id: e.target.value})}>
                  <option value="">Seleccione...</option>
                  {(cartItem.type === 'product' ? inventory.products : inventory.services).map(item => (
                    <option key={item.id} value={item.id}>{item.name} (${item.price})</option>
                  ))}
                </select>
              </div>
              <div style={{ width: '80px' }}>
                <label>Cant.</label>
                <input type="number" min="1" value={cartItem.qty} onChange={e => setCartItem({...cartItem, qty: e.target.value})} />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAddItem}>Agregar</button>
            </div>

            <table className="data-table" style={{ marginBottom: '1rem' }}>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Cant.</th>
                  <th>Precio Unit.</th>
                  <th>Subtotal</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {newEstimate.items.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay ítems en el presupuesto.</td></tr>
                ) : newEstimate.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td>${item.price}</td>
                    <td>${item.price * item.qty}</td>
                    <td><button type="button" className="btn" style={{ color: 'red' }} onClick={() => handleRemoveItem(idx)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
              {newEstimate.items.length > 0 && (
                <tfoot>
                  <tr><td colSpan="3" style={{ textAlign: 'right' }}><strong>Neto:</strong></td><td>${total.toFixed(2)}</td><td></td></tr>
                  <tr><td colSpan="3" style={{ textAlign: 'right' }}><strong>IVA (19%):</strong></td><td>${tax.toFixed(2)}</td><td></td></tr>
                  <tr><td colSpan="3" style={{ textAlign: 'right' }}><strong>Total:</strong></td><td><strong>${grandTotal.toFixed(2)}</strong></td><td></td></tr>
                </tfoot>
              )}
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
                {editingId ? 'Actualizar Presupuesto' : 'Guardar Presupuesto'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Presupuestos</h2>
        <button className="btn btn-primary" onClick={() => setViewState('new')}>+ Nuevo Presupuesto</button>
      </div>
      
      {loading ? (
        <div>Cargando presupuestos...</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Vehículo</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map(e => (
              <tr key={e.id}>
                <td>PRE-{e.id}</td>
                <td>{e.client_name} {e.client_last_name}</td>
                <td>{e.vehicle_license_plate || '-'}</td>
                <td>{new Date(e.created_at).toLocaleDateString()}</td>
                <td>${parseFloat(e.total_amount).toFixed(0)}</td>
                <td>{getStatusBadge(e.status)}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" onClick={() => downloadPDF(e.id)} title="Descargar PDF">📄</button>
                  <button className="btn" onClick={() => sendWhatsApp(e.id)} style={{ color: '#16a34a' }} title="Enviar por WhatsApp">💬</button>
                  {e.status !== 'ACCEPTED' && (
                    <button className="btn" onClick={() => handleEditEstimate(e)} title="Editar Presupuesto">✏️</button>
                  )}
                  {e.status !== 'ACCEPTED' && (
                    <button className="btn" onClick={() => handleDeleteEstimate(e.id)} style={{ color: 'red' }} title="Eliminar Presupuesto">🗑️</button>
                  )}
                  {e.status !== 'ACCEPTED' && e.vehicle && (
                    <button className="btn btn-secondary" onClick={() => convertToWorkOrder(e.id)} title="Convertir a Orden de Trabajo">➡️ OT</button>
                  )}
                </td>
              </tr>
            ))}
            {estimates.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No hay presupuestos registrados.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
