import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── helpers ──────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');
const authHeader = () => ({ Authorization: `Token ${token()}` });
const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const PAYMENT_METHODS = [
  { value: 'CASH',     label: '💵 Efectivo' },
  { value: 'CARD',     label: '💳 Tarjeta' },
  { value: 'TRANSFER', label: '🏦 Transferencia' },
];

const STATUS_LABELS = {
  DRAFT:          { label: 'Borrador',    cls: 'pending' },
  SENT:           { label: 'Pendiente',   cls: 'yellow'  },
  PARTIALLY_PAID: { label: 'Abono',       cls: 'yellow'  },
  PAID:           { label: 'Pagado',      cls: 'green'   },
  CANCELLED:      { label: 'Cancelado',   cls: 'red'     },
  VOID:           { label: 'Anulado',     cls: 'red'     },
};

// ─── sub-component: resumen de factura ────────────────────────────────────────
const InvoiceSummary = ({ invoice }) => {
  if (!invoice) return null;
  const st = STATUS_LABELS[invoice.status] || { label: invoice.status, cls: 'pending' };
  const origin = invoice.source === 'COUNTER_SALE' ? '🛒 Venta de mostrador' : `📋 OT #${invoice.work_order}`;

  return (
    <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
      <div className="ot-header">
        <div>
          <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>Factura #{invoice.id}</h3>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{origin}</span>
        </div>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', margin: '1rem 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>SUBTOTAL</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{fmt(invoice.subtotal)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>IVA (19%)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{fmt(invoice.tax_amount)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>TOTAL</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)' }}>{fmt(invoice.total_amount)}</div>
        </div>
      </div>
      {parseFloat(invoice.amount_paid) > 0 && (
        <div style={{
          background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)',
          borderRadius: 8, padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between',
          fontSize: '0.9rem'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Pagado hasta ahora:</span>
          <span style={{ color: 'var(--status-green)', fontWeight: 600 }}>{fmt(invoice.amount_paid)}</span>
          <span style={{ color: 'var(--text-muted)' }}>Saldo pendiente:</span>
          <span style={{ color: 'var(--status-yellow)', fontWeight: 600 }}>
            {fmt(parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid))}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── pantalla 1: cobrar OT ────────────────────────────────────────────────────
const ChargeWorkOrder = () => {
  const [search, setSearch]     = useState('');
  const [searchType, setType]   = useState('work_order_id');
  const [invoice, setInvoice]   = useState(null);
  const [amount, setAmount]     = useState('');
  const [method, setMethod]     = useState('CASH');
  const [reference, setRef]     = useState('');
  const [msg, setMsg]           = useState(null);
  const [loading, setLoading]   = useState(false);

  // List of active invoices/OTs
  const [activeInvoices, setActiveInvoices] = useState([]);
  const [loadingActive, setLoadingActive] = useState(false);

  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemData, setEditItemData] = useState({ description: '', quantity: 1, unit_price: 0 });
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [itemSource, setItemSource] = useState('manual');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState(null);
  const [newItem, setNewItem] = useState({ description: '', quantity: 1, unit_price: 0 });
  const [barcodeInput, setBarcodeInput] = useState('');

  useEffect(() => {
    const h = authHeader();
    Promise.all([
      axios.get('/api/inventory/services/?is_active=true', h),
      axios.get('/api/inventory/products/', h),
    ]).then(([s, p]) => {
      setCatalogServices(s.data.results || s.data);
      setCatalogProducts(p.data.results || p.data);
    }).catch(console.error);
  }, []);

  const reloadInvoice = async (invoiceId) => {
    try {
      const { data } = await axios.get(`/api/finance/invoices/${invoiceId}/`, { headers: authHeader() });
      setInvoice(data);
      setAmount(String(parseFloat(data.total_amount) - parseFloat(data.amount_paid)));
      fetchActiveInvoices();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateItem = async (itemId) => {
    try {
      await axios.patch(`/api/operations/work-order-items/${itemId}/`, editItemData, {
        headers: authHeader()
      });
      setEditingItemId(null);
      setEditItemData({ description: '', quantity: 1, unit_price: 0 });
      reloadInvoice(invoice.id);
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar el ítem.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este ítem?')) return;
    try {
      await axios.delete(`/api/operations/work-order-items/${itemId}/`, {
        headers: authHeader()
      });
      reloadInvoice(invoice.id);
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el ítem.');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!invoice || !invoice.work_order) return;
    try {
      let payload = { ...newItem, work_order: invoice.work_order };
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
        headers: authHeader()
      });
      setNewItem({ description: '', quantity: 1, unit_price: 0 });
      setSelectedCatalogItem(null);
      setItemSource('manual');
      reloadInvoice(invoice.id);
    } catch (err) {
      console.error(err);
      alert('No se pudo agregar el ítem.');
    }
  };

  const handleScanBarcode = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const p = catalogProducts.find(prod => String(prod.barcode) === barcodeInput.trim() || String(prod.sku) === barcodeInput.trim() || String(prod.id) === barcodeInput.trim());
    if (p) {
      try {
        const payload = {
          work_order: invoice.work_order,
          product: p.id,
          description: p.name,
          unit_price: p.price,
          quantity: 1,
          is_labor: false
        };
        await axios.post('/api/operations/work-order-items/', payload, {
          headers: authHeader()
        });
        setBarcodeInput('');
        reloadInvoice(invoice.id);
      } catch (err) {
        alert('Error al agregar producto escaneado.');
      }
    } else {
      alert(`No existe ningún producto con SKU: ${barcodeInput}`);
    }
  };

  const fetchActiveInvoices = async () => {
    setLoadingActive(true);
    try {
      const { data } = await axios.get('/api/finance/invoices/active_pos/', { headers: authHeader() });
      setActiveInvoices(data);
    } catch (e) {
      console.error("Error al cargar OTs activas:", e);
    } finally {
      setLoadingActive(false);
    }
  };

  useEffect(() => {
    fetchActiveInvoices();
  }, []);

  const lookup = async () => {
    if (!search.trim()) return;
    setLoading(true); setMsg(null); setInvoice(null);
    try {
      const params = searchType === 'work_order_id'
        ? { work_order_id: search }
        : { license_plate: search.toUpperCase() };
      const { data } = await axios.get('/api/finance/pos/work-order-lookup/', {
        params, headers: authHeader()
      });
      setInvoice(data);
      setAmount(String(parseFloat(data.total_amount) - parseFloat(data.amount_paid)));
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'OT no encontrada o ya entregada.' });
    } finally { setLoading(false); }
  };

  const charge = async () => {
    if (!invoice || !amount) return;
    setLoading(true); setMsg(null);
    try {
      const { data } = await axios.post('/api/finance/pos/charge/', {
        invoice_id: invoice.id,
        amount: parseFloat(amount),
        payment_method: method,
        reference_number: reference,
      }, { headers: authHeader() });
      setInvoice(data.invoice);
      setMsg({ type: 'ok', text: `✅ Cobro de ${fmt(amount)} registrado correctamente.` });
      setAmount(String(parseFloat(data.invoice.total_amount) - parseFloat(data.invoice.amount_paid)));
      fetchActiveInvoices(); // Actualizar grilla
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Error al registrar cobro.' });
    } finally { setLoading(false); }
  };

  const cancel = async () => {
    if (!invoice) return;
    const reason = window.prompt('Motivo de cancelación (opcional):') ?? '';
    setLoading(true); setMsg(null);
    try {
      const { data } = await axios.post('/api/finance/pos/cancel-invoice/', {
        invoice_id: invoice.id, reason
      }, { headers: authHeader() });
      setInvoice(data);
      setMsg({ type: 'ok', text: '✅ Factura cancelada. El stock fue revertido si correspondía.' });
      fetchActiveInvoices(); // Actualizar grilla
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Error al cancelar.' });
    } finally { setLoading(false); }
  };

  const selectInvoice = (inv) => {
    setInvoice(inv);
    setMsg(null);
    setEditingItemId(null);
    setAmount(String(parseFloat(inv.total_amount) - parseFloat(inv.amount_paid)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isPaid = invoice?.status === 'PAID';
  const isCancelled = ['CANCELLED', 'VOID'].includes(invoice?.status);
  const balance = invoice ? parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid) : 0;

  return (
    <div>
      {/* búsqueda */}
      <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🔍 Buscar Orden de Trabajo</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {[['work_order_id', '# OT'], ['license_plate', 'Patente']].map(([val, lbl]) => (
              <button key={val}
                onClick={() => { setType(val); setSearch(''); setInvoice(null); setMsg(null); }}
                style={{
                  padding: '0.6rem 1rem', border: 'none', cursor: 'pointer',
                  background: searchType === val ? 'var(--secondary-color)' : 'transparent',
                  color: searchType === val ? '#000' : 'var(--text-muted)',
                  fontWeight: searchType === val ? 700 : 400, transition: 'all 0.2s',
                  fontFamily: 'Outfit, sans-serif'
                }}
              >{lbl}</button>
            ))}
          </div>
          <input
            className="glass-input"
            placeholder={searchType === 'work_order_id' ? 'Ej: 42' : 'Ej: ABCD12'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            style={{ flex: 1, minWidth: 140 }}
          />
          <button className="btn" onClick={lookup} disabled={loading} style={{ minWidth: 100 }}>
            {loading ? '...' : 'Buscar'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
          background: msg.type === 'ok' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
          border: `1px solid ${msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)'}`,
          color: msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)',
        }}>{msg.text}</div>
      )}

      {/* Grid de OTs y Checkout Split */}
      <div style={{ display: 'grid', gridTemplateColumns: invoice ? '1.2fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Grilla principal de OTs activas */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>📋 Órdenes de Trabajo Activas</h3>
            <button className="btn btn-outline" onClick={fetchActiveInvoices} disabled={loadingActive} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              {loadingActive ? 'Cargando...' : '🔄 Actualizar'}
            </button>
          </div>

          {loadingActive && activeInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Cargando OTs activas...
            </div>
          ) : activeInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No se encontraron órdenes de trabajo activas cobrables.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px' }}>OT #</th>
                    <th style={{ padding: '10px 8px' }}>Patente</th>
                    <th style={{ padding: '10px 8px' }}>Cliente</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Abonado</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Saldo</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Estado</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvoices.map(inv => {
                    const st = STATUS_LABELS[inv.status] || { label: inv.status, cls: 'pending' };
                    const isSelected = invoice && invoice.id === inv.id;
                    const bal = parseFloat(inv.total_amount) - parseFloat(inv.amount_paid);

                    return (
                      <tr 
                        key={inv.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-color)',
                          backgroundColor: isSelected ? 'rgba(102,252,241,0.08)' : 'transparent',
                          transition: 'background-color 0.2s',
                          cursor: 'pointer'
                        }}
                        onClick={() => selectInvoice(inv)}
                      >
                        <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>#{inv.work_order}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white' }}>
                            {inv.vehicle_license_plate || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                          {inv.client_name || 'Sin Cliente'}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>{fmt(inv.total_amount)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--status-green)' }}>{fmt(inv.amount_paid)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--status-yellow)', fontWeight: 'bold' }}>{fmt(bal)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <span className={`badge ${st.cls}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <button 
                            className="btn" 
                            style={{ 
                              padding: '4px 10px', 
                              fontSize: '0.8rem', 
                              backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--secondary-color)',
                              color: '#000'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectInvoice(inv);
                            }}
                          >
                            {isSelected ? 'Seleccionada' : 'Cobrar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel lateral de checkout de cobro */}
        {invoice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.25s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>Checkout Seleccionado</h4>
              <button 
                onClick={() => setInvoice(null)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--status-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}
              >
                ✕ Limpiar Selección
              </button>
            </div>
            
            <InvoiceSummary invoice={invoice} />

            {/* Gestión de Ítems de la OT (solo si source es de una OT) */}
            {invoice.work_order && (
              <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary-color)' }}>🔧 Gestión de Ítems de la OT #{invoice.work_order}</h4>
                
                {(!invoice.items || invoice.items.length === 0) ? (
                  <p style={{ color: 'var(--text-muted)' }}>Esta orden no tiene repuestos ni servicios agregados.</p>
                ) : (
                  <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Descripción</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', width: '50px' }}>Cant</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', width: '80px' }}>Precio</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.items.map(item => {
                          const isEditing = editingItemId === item.id;
                          const isReadOnly = ['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(invoice.status);
                          
                          if (isEditing) {
                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.5rem' }}>
                                  <input 
                                    type="text" 
                                    className="input-field" 
                                    style={{ width: '100%', padding: '0.2rem 0.5rem', fontSize: '0.88rem' }} 
                                    value={editItemData.description} 
                                    onChange={e => setEditItemData({ ...editItemData, description: e.target.value })} 
                                  />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    min="0.01"
                                    className="input-field" 
                                    style={{ width: '100%', padding: '0.2rem 0.5rem', fontSize: '0.88rem' }} 
                                    value={editItemData.quantity} 
                                    onChange={e => setEditItemData({ ...editItemData, quantity: e.target.value })} 
                                  />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    className="input-field" 
                                    style={{ width: '100%', padding: '0.2rem 0.5rem', fontSize: '0.88rem' }} 
                                    value={editItemData.unit_price} 
                                    onChange={e => setEditItemData({ ...editItemData, unit_price: e.target.value })} 
                                  />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      type="button"
                                      className="btn btn-outline" 
                                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', borderColor: 'var(--status-green)', color: 'var(--status-green)' }}
                                      onClick={() => handleUpdateItem(item.id)}
                                    >
                                      ✓
                                    </button>
                                    <button 
                                      type="button"
                                      className="btn btn-outline" 
                                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                                      onClick={() => { setEditingItemId(null); setEditItemData({ description: '', quantity: 1, unit_price: 0 }); }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem' }}>{item.description}</td>
                              <td style={{ padding: '0.5rem' }}>{item.quantity}</td>
                              <td style={{ padding: '0.5rem' }}>{fmt(item.unit_price)}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{fmt(item.quantity * item.unit_price)}</span>
                                  {!isReadOnly && (
                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                      <button 
                                        type="button"
                                        title="Editar"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#3b82f6' }}
                                        onClick={() => {
                                          setEditingItemId(item.id);
                                          setEditItemData({ description: item.description, quantity: item.quantity, unit_price: item.unit_price });
                                        }}
                                      >
                                        ✏️
                                      </button>
                                      <button 
                                        type="button"
                                        title="Eliminar"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--status-red)' }}
                                        onClick={() => handleDeleteItem(item.id)}
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Formulario de añadir item en Checkout POS */}
                {!['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(invoice.status) && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0' }}>Añadir Repuesto / Servicio rápido:</h5>
                    
                    {/* selector de fuente */}
                    <div style={{ display: 'flex', gap: '0.3rem', margin: '0.5rem 0', background: 'rgba(0,0,0,0.3)', padding: '0.2rem', borderRadius: 6, width: 'fit-content' }}>
                      {[['manual','✏️ Man'], ['service','🔧 Cat'], ['product','📦 Inv']].map(([val, lbl]) => (
                        <button key={val} type="button"
                          onClick={() => { setItemSource(val); setSelectedCatalogItem(null); setNewItem({ description: '', quantity: 1, unit_price: 0 }); }}
                          style={{
                            padding: '0.3rem 0.6rem', borderRadius: 4, border: 'none', cursor: 'pointer',
                            background: itemSource === val ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                            color: itemSource === val ? '#000' : 'var(--text-muted)',
                            fontWeight: itemSource === val ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.75rem',
                          }}>{lbl}</button>
                      ))}
                    </div>

                    <form onSubmit={handleScanBarcode} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.3rem' }}>
                      <input 
                        type="text" 
                        className="glass-input" 
                        placeholder="Escanear SKU..." 
                        value={barcodeInput} 
                        onChange={e => setBarcodeInput(e.target.value)} 
                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', fontSize: '0.8rem' }} 
                      />
                      <button type="submit" className="btn btn-outline" style={{ padding: '0 0.6rem', fontSize: '0.8rem' }}>Escanear</button>
                    </form>

                    <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {itemSource === 'service' && (
                        <div>
                          <select
                            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem', color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: '0.8rem' }}
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
                              <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {itemSource === 'product' && (
                        <div>
                          <select
                            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem', color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: '0.8rem' }}
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
                                {p.name} ({p.sku}) — Stock: {p.stock_quantity} — {fmt(p.price)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {itemSource === 'manual' && (
                        <div>
                          <input type="text" placeholder="Descripción" className="glass-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }} required
                            value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <input type="number" step="0.01" min="0.01" placeholder="Cant" className="glass-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }} required
                            value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})}
                          />
                        </div>
                        <div style={{ flex: 1.5 }}>
                          <input type="number" step="0.01" placeholder="Precio" className="glass-input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }} required
                            value={newItem.unit_price} onChange={e => setNewItem({...newItem, unit_price: e.target.value})}
                          />
                        </div>
                        <button type="submit" className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>Añadir</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {!isPaid && !isCancelled && balance > 0 && (
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)', fontSize: '1.15rem' }}>💳 Registrar Pago / Abono</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      MONTO A COBRAR (Abono)
                    </label>
                    <input
                      className="glass-input"
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Saldo restante: {fmt(balance)}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      REFERENCIA / VOUCHER
                    </label>
                    <input
                      className="glass-input"
                      placeholder="Opcional"
                      value={reference}
                      onChange={e => setRef(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                  {PAYMENT_METHODS.map(pm => (
                    <button key={pm.value}
                      onClick={() => setMethod(pm.value)}
                      style={{
                        padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${method === pm.value ? 'var(--primary-color)' : 'var(--border-color)'}`,
                        background: method === pm.value ? 'rgba(102,252,241,0.15)' : 'transparent',
                        color: method === pm.value ? 'var(--primary-color)' : 'var(--text-muted)',
                        fontWeight: method === pm.value ? 700 : 400, transition: 'all 0.2s',
                        fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
                      }}
                    >{pm.label}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn" style={{ flex: 1 }} onClick={charge} disabled={loading}>
                    {loading ? 'Procesando...' : `💰 Registrar Pago de ${fmt(amount)}`}
                  </button>
                  <button className="btn btn-outline" style={{ color: 'var(--status-red)', borderColor: 'var(--status-red)' }}
                    onClick={cancel} disabled={loading}>
                    ✕ Cancelar Factura
                  </button>
                </div>
              </div>
            )}

            {(isPaid) && (
              <div className="glass-card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ color: 'var(--status-green)', fontWeight: 600, marginBottom: '0.75rem' }}>
                  ✅ Esta factura ya está completamente pagada.
                </p>
                <button className="btn" onClick={async () => {
                  try {
                    const res = await axios.get(`/api/finance/invoices/${invoice.id}/pdf/`, {
                      headers: authHeader(), responseType: 'blob'
                    });
                    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                    window.open(url, '_blank');
                  } catch { alert('Error al generar PDF.'); }
                }}>🖨️ Ver / Imprimir Boleta</button>
              </div>
            )}
            {(isCancelled) && (
              <div className="glass-card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--status-red)', fontWeight: 600 }}>
                ✕ Esta factura fue cancelada.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── pantalla 2: venta de mostrador ──────────────────────────────────────────
const CounterSale = () => {
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [discountType, setDiscountType] = useState('amount'); // 'amount' | 'percent'
  const [discountVal, setDiscountVal] = useState('');
  const [cartItems, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [method, setMethod] = useState('CASH');
  const [invoice, setInvoice] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('products');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    const h = { headers: authHeader() };
    Promise.all([
      axios.get('/api/inventory/products/?popular=true', h),
      axios.get('/api/inventory/services/?popular=true', h),
      axios.get('/api/inventory/service-categories/', h),
      axios.get('/api/operations/clients/', h),
    ]).then(([p, s, c, cli]) => {
      setProducts(p.data.results || p.data);
      setServices(s.data.results || s.data);
      setCategories(c.data.results || c.data);
      setClients(cli.data.results || cli.data);
    }).catch(console.error);
  }, []);

  const addProduct = (p) => {
    setCart(prev => {
      const ex = prev.find(i => i.type === 'product' && i.id === p.id);
      if (ex) return prev.map(i => i === ex ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { type: 'product', id: p.id, name: p.name, price: parseFloat(p.price), qty: 1, stock: p.stock_quantity }];
    });
  };

  const handleScan = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const p = products.find(prod => String(prod.barcode) === barcodeInput.trim() || String(prod.sku) === barcodeInput.trim() || String(prod.id) === barcodeInput.trim());
    if (p) {
      addProduct(p);
      setBarcodeInput('');
    } else {
      alert("Producto/SKU no encontrado: " + barcodeInput);
    }
  };

  const addService = (s) => {
    setCart(prev => {
      const ex = prev.find(i => i.type === 'service' && i.id === s.id);
      if (ex) return prev.map(i => i === ex ? { ...i, qty: i.qty + 1 } : i);
      
      let calculatedPrice = parseFloat(s.price);
      if (s.is_bundle && s.bundle_items) {
        calculatedPrice += s.bundle_items.reduce((acc, item) => acc + (parseFloat(item.product_price) * item.quantity), 0);
      }
      
      return [...prev, { type: 'service', id: s.id, name: s.name, price: calculatedPrice, qty: 1 }];
    });
  };

  const updateQty = (idx, delta) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = item.qty + delta;
      return newQty <= 0 ? null : { ...item, qty: newQty };
    }).filter(Boolean));
  };

  const removeItem = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));

  // Cart calculations (Prices in cart include 19% IVA)
  const grossTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const rawDiscount = parseFloat(discountVal) || 0;
  const discountAmount = Math.min(
    grossTotal,
    discountType === 'percent' ? Math.round((grossTotal * rawDiscount) / 100) : rawDiscount
  );
  const finalTotal = Math.max(0, grossTotal - discountAmount);
  const neto = Math.round(finalTotal / 1.19);
  const iva = finalTotal - neto;

  const checkout = async () => {
    if (!cartItems.length) return;
    setLoading(true); setMsg(null);
    const items = cartItems.map(i =>
      i.type === 'product'
        ? { product_id: i.id, quantity: i.qty }
        : { service_id: i.id, quantity: i.qty, unit_price: i.price }
    );
    try {
      const payload = {
        client_id: selectedClientId ? parseInt(selectedClientId) : null,
        discount_amount: discountAmount,
        items
      };
      const { data: inv } = await axios.post('/api/finance/pos/counter-sale/', payload, { headers: authHeader() });
      const { data: charged } = await axios.post('/api/finance/pos/charge/', {
        invoice_id: inv.id,
        amount: parseFloat(inv.total_amount),
        payment_method: method,
      }, { headers: authHeader() });
      setInvoice(charged.invoice);
      setCart([]);
      setDiscountVal('');
      setSelectedClientId('');
      setMsg({ type: 'ok', text: `✅ Venta registrada — Factura #${charged.invoice.id} pagada con ${method === 'CASH' ? 'efectivo' : method === 'CARD' ? 'tarjeta' : 'transferencia'}.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Error al procesar la venta.' });
    } finally { setLoading(false); }
  };

  const groupedServices = categories.map(cat => ({
    ...cat,
    items: services.filter(s => s.category === cat.id && s.is_active)
  })).filter(c => c.items.length > 0);

  return (
    <div className="pos-grid">
      {/* catálogo */}
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[['products','📦 Productos'], ['services','🔧 Servicios']].map(([val, lbl]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === val ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'rgba(0,0,0,0.3)',
              color: tab === val ? '#000' : 'var(--text-muted)',
              fontWeight: tab === val ? 700 : 400, fontFamily: 'Outfit, sans-serif'
            }}>{lbl}</button>
          ))}
        </div>

        <form onSubmit={handleScan} style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Escanear SKU o Código de barras..." 
            value={barcodeInput} 
            onChange={e => setBarcodeInput(e.target.value)} 
            autoFocus 
            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', minWidth: '200px' }} 
          />
          <button type="submit" className="btn btn-outline" style={{ padding: '0 1rem' }}>Escanear</button>
        </form>

        {tab === 'products' && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <input 
                type="text" 
                className="glass-input" 
                placeholder="🔍 Buscar producto por nombre..." 
                value={searchFilter} 
                onChange={e => setSearchFilter(e.target.value)} 
                style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px' }} 
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {products.filter(p => !searchFilter || p.name.toLowerCase().includes(searchFilter.toLowerCase())).map(p => (
              <div key={p.id} className="glass-card" style={{ padding: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                onClick={() => p.stock_quantity > 0 && addProduct(p)}>
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.75rem' }} />
                )}
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>SKU: {p.sku}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(p.price)}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>IVA incl.</span>
                  </div>
                  <span style={{
                    fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12,
                    background: p.stock_quantity > 0 ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                    color: p.stock_quantity > 0 ? 'var(--status-green)' : 'var(--status-red)',
                    border: `1px solid ${p.stock_quantity > 0 ? 'var(--status-green)' : 'var(--status-red)'}`,
                  }}>
                    {p.stock_quantity > 0 ? `Stock: ${p.stock_quantity}` : 'Sin stock'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {tab === 'services' && (
          <div>
            {groupedServices.length === 0 && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                No hay servicios configurados. Agrégalos en el tab "Catálogo de Servicios".
              </div>
            )}
            {groupedServices.map(cat => (
              <div key={cat.id} style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase',
                  letterSpacing: 2, marginBottom: '0.75rem', paddingLeft: 4 }}>{cat.name}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {cat.items.map(s => (
                    <div key={s.id} className="glass-card" style={{ padding: '1rem', cursor: 'pointer' }}
                      onClick={() => addService(s)}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                      {s.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>{s.description}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(s.price)}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>IVA incl.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* carrito */}
      <div className="glass-card" style={{ position: 'sticky', top: 0 }}>
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>🛒 Carrito de Venta</h3>

        {/* Selección de Cliente */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>
            👤 Cliente (Opcional)
          </label>
          <select 
            value={selectedClientId} 
            onChange={e => setSelectedClientId(e.target.value)}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)',
              borderRadius: 8, padding: '0.5rem', color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
            }}
          >
            <option value="">Venta Anónima / Sin Cliente</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.rut || 'Sin RUT'})</option>
            ))}
          </select>
        </div>

        {cartItems.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
            Haz clic en un producto o servicio para agregar.
          </p>
        ) : (
          <>
            {cartItems.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmt(item.price)} (IVA incl.)</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
                  <button onClick={() => updateQty(idx, -1)} style={{
                    width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border-color)',
                    background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700, lineHeight: 1
                  }}>-</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{item.qty}</span>
                  <button onClick={() => updateQty(idx, 1)} style={{
                    width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border-color)',
                    background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700, lineHeight: 1
                  }}>+</button>
                  <button onClick={() => removeItem(idx)} style={{
                    marginLeft: 4, background: 'transparent', border: 'none',
                    color: 'var(--status-red)', cursor: 'pointer', fontSize: '1rem'
                  }}>✕</button>
                </div>
                <div style={{ marginLeft: '0.5rem', fontWeight: 700, color: 'var(--primary-color)', minWidth: 60, textAlign: 'right' }}>
                  {fmt(item.price * item.qty)}
                </div>
              </div>
            ))}

            {/* Opción de Descuento */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                🏷️ Aplicar Descuento
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('amount')}
                    style={{
                      padding: '0.3rem 0.6rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem',
                      background: discountType === 'amount' ? 'var(--secondary-color)' : 'transparent',
                      color: discountType === 'amount' ? '#000' : 'var(--text-muted)', fontWeight: 700
                    }}
                  >$</button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    style={{
                      padding: '0.3rem 0.6rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem',
                      background: discountType === 'percent' ? 'var(--secondary-color)' : 'transparent',
                      color: discountType === 'percent' ? '#000' : 'var(--text-muted)', fontWeight: 700
                    }}
                  >%</button>
                </div>
                <input 
                  type="number"
                  min="0"
                  placeholder={discountType === 'percent' ? 'Ej: 10 (%)' : 'Ej: 5000 ($)'}
                  value={discountVal}
                  onChange={e => setDiscountVal(e.target.value)}
                  style={{
                    flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)',
                    borderRadius: 6, padding: '0.3rem 0.6rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'Outfit, sans-serif'
                  }}
                />
              </div>
            </div>

            {/* Desglose de Totales */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span>Subtotal (IVA incl.)</span><span>{fmt(grossTotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--status-green)', fontSize: '0.85rem', fontWeight: 600 }}>
                  <span>Descuento aplicado</span><span>-{fmt(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span>Monto Neto (sin IVA)</span><span>{fmt(neto)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span>IVA (19%)</span><span>{fmt(iva)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 700, fontSize: '1.2rem', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem' }}>
                <span>TOTAL A PAGAR</span><span style={{ color: 'var(--primary-color)' }}>{fmt(finalTotal)}</span>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                Forma de pago
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.value} onClick={() => setMethod(pm.value)} style={{
                    flex: 1, padding: '0.5rem', borderRadius: 8, border: `1px solid ${method === pm.value ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    background: method === pm.value ? 'rgba(102,252,241,0.15)' : 'transparent',
                    color: method === pm.value ? 'var(--primary-color)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem',
                    fontWeight: method === pm.value ? 700 : 400, transition: 'all 0.2s'
                  }}>{pm.label}</button>
                ))}
              </div>
            </div>

            {msg && (
              <div style={{
                marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8,
                background: msg.type === 'ok' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                border: `1px solid ${msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)'}`,
                color: msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)',
                fontSize: '0.85rem'
              }}>{msg.text}</div>
            )}

            <button className="btn" style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}
              onClick={checkout} disabled={loading}>
              {loading ? 'Procesando...' : `✅ Cobrar ${fmt(finalTotal)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── pantalla 3: catálogo de servicios ───────────────────────────────────────
const ServiceCatalog = () => {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', price: '', description: '', is_bundle: false, bundle_items_data: [] });
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState('list');

  const reload = useCallback(async () => {
    const h = { headers: authHeader() };
    const [s, c, p] = await Promise.all([
      axios.get('/api/inventory/services/', h),
      axios.get('/api/inventory/service-categories/', h),
      axios.get('/api/inventory/products/', h),
    ]);
    setServices(s.data.results || s.data);
    setCategories(c.data.results || c.data);
    setProducts(p.data.results || p.data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const saveService = async () => {
    if (!form.name || !form.category || !form.price) {
      setMsg({ type: 'error', text: 'Nombre, categoría y precio son obligatorios.' });
      return;
    }
    setLoading(true); setMsg(null);
    try {
      await axios.post('/api/inventory/services/', { ...form, price: parseFloat(form.price), is_active: true }, { headers: authHeader() });
      setForm({ name: '', category: '', price: '', description: '', is_bundle: false, bundle_items_data: [] });
      setMsg({ type: 'ok', text: '✅ Servicio creado correctamente.' });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data ? JSON.stringify(e.response.data) : 'Error al guardar.' });
    } finally { setLoading(false); }
  };

  const saveCategory = async () => {
    if (!catForm.name) { setMsg({ type: 'error', text: 'El nombre de la categoría es obligatorio.' }); return; }
    setLoading(true); setMsg(null);
    try {
      await axios.post('/api/inventory/service-categories/', catForm, { headers: authHeader() });
      setCatForm({ name: '', description: '' });
      setMsg({ type: 'ok', text: '✅ Categoría creada.' });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data ? JSON.stringify(e.response.data) : 'Error.' });
    } finally { setLoading(false); }
  };

  const toggleActive = async (s) => {
    await axios.patch(`/api/inventory/services/${s.id}/`, { is_active: !s.is_active }, { headers: authHeader() });
    reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[['list','📋 Catálogo'], ['new_service','+ Nuevo Servicio'], ['new_cat','+ Nueva Categoría']].map(([val, lbl]) => (
          <button key={val} onClick={() => { setSubTab(val); setMsg(null); }} style={{
            padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: subTab === val ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'rgba(0,0,0,0.3)',
            color: subTab === val ? '#000' : 'var(--text-muted)',
            fontWeight: subTab === val ? 700 : 400, fontFamily: 'Outfit, sans-serif'
          }}>{lbl}</button>
        ))}
      </div>

      {msg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
          background: msg.type === 'ok' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
          border: `1px solid ${msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)'}`,
          color: msg.type === 'ok' ? 'var(--status-green)' : 'var(--status-red)',
        }}>{msg.text}</div>
      )}

      {subTab === 'list' && (
        <div>
          {categories.map(cat => {
            const catServices = services.filter(s => s.category === cat.id);
            if (!catServices.length) return null;
            return (
              <div key={cat.id} style={{ marginBottom: '2rem' }}>
                <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: 2, marginBottom: '0.75rem' }}>
                  {cat.name}
                </h4>
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {catServices.map((s, i) => (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.9rem 1.25rem',
                      borderBottom: i < catServices.length - 1 ? '1px solid var(--border-color)' : 'none'
                    }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        {s.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{s.description}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(s.price)}</span>
                        <button onClick={() => toggleActive(s)} style={{
                          padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: 'none',
                          background: s.is_active ? 'rgba(46,204,113,0.2)' : 'rgba(149,165,166,0.2)',
                          color: s.is_active ? 'var(--status-green)' : 'var(--text-muted)',
                          fontFamily: 'Outfit, sans-serif', fontSize: '0.8rem'
                        }}>
                          {s.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {services.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              Aún no hay servicios. Usa "+ Nueva Categoría" y luego "+ Nuevo Servicio" para comenzar.
            </p>
          )}
        </div>
      )}

      {subTab === 'new_service' && (
        <div className="glass-card" style={{ maxWidth: 480 }}>
          <h3 style={{ color: 'var(--primary-color)', marginBottom: '1.25rem' }}>Nuevo Servicio</h3>
          {[['Nombre del servicio', 'name', 'text', 'Ej: Cambio de aceite express'],
            ['Precio', 'price', 'number', 'Ej: 25000']].map(([lbl, key, type, ph]) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lbl}</label>
              <input className="glass-input" type={type} placeholder={ph} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%' }} />
            </div>
          ))}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Categoría</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{
                width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: '0.75rem', color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem'
              }}>
              <option value="">Selecciona una categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Descripción (opcional)</label>
            <textarea className="glass-input" placeholder="Descripción breve del servicio..." value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ width: '100%', height: 80, resize: 'vertical' }} />
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={form.is_bundle} onChange={e => setForm(f => ({ ...f, is_bundle: e.target.checked }))} />
              Es un servicio combinado (Ej. Cambio de Aceite que incluye productos)
            </label>
          </div>

          {form.is_bundle && (
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px dashed var(--border-color)' }}>
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Productos Incluidos</h4>
              {form.bundle_items_data.map((bi, idx) => {
                const prod = products.find(p => p.id === parseInt(bi.product_id));
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
                    <span>{bi.quantity}x {prod ? prod.name : ''}</span>
                    <button onClick={() => setForm(f => ({ ...f, bundle_items_data: f.bundle_items_data.filter((_, i) => i !== idx) }))} style={{ background: 'none', border: 'none', color: 'var(--status-red)', cursor: 'pointer' }}>✕</button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <select id="bundle-product-select" style={{ flex: 1, background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: 4, padding: '4px' }}>
                  <option value="">Selecciona un producto...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} - {fmt(p.price)}</option>)}
                </select>
                <button type="button" onClick={() => {
                  const sel = document.getElementById('bundle-product-select');
                  if (!sel.value) return;
                  setForm(f => ({ ...f, bundle_items_data: [...f.bundle_items_data, { product_id: sel.value, quantity: 1 }] }));
                  sel.value = '';
                }} className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }}>Añadir</button>
              </div>
            </div>
          )}

          <button className="btn" onClick={saveService} disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Guardando...' : '✅ Crear Servicio'}
          </button>
        </div>
      )}

      {subTab === 'new_cat' && (
        <div className="glass-card" style={{ maxWidth: 480 }}>
          <h3 style={{ color: 'var(--primary-color)', marginBottom: '1.25rem' }}>Nueva Categoría</h3>
          {[['Nombre', 'name', 'Ej: Mantenimiento'], ['Descripción (opcional)', 'description', 'Ej: Servicios de mantenimiento preventivo']].map(([lbl, key, ph]) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lbl}</label>
              <input className="glass-input" placeholder={ph} value={catForm[key]}
                onChange={e => setCatForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%' }} />
            </div>
          ))}
          <button className="btn" onClick={saveCategory} disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Guardando...' : '✅ Crear Categoría'}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── componente principal ─────────────────────────────────────────────────────
const POSDashboard = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState('counter');
  const [cashOpen, setCashOpen] = useState(null); // null = loading, true/false

  useEffect(() => {
    axios.get('/api/finance/cash-register/current/', { headers: authHeader() })
      .then(res => setCashOpen(res.data !== null && res.data !== '' && res.data?.status === 'OPEN'))
      .catch(() => setCashOpen(false));
  }, []);

  const tabs = [
    { id: 'charge',   label: '📋 Cobrar OT'         },
    { id: 'counter',  label: '🛒 Venta Mostrador'    },
    { id: 'catalog',  label: '🔧 Catálogo Servicios' },
  ];

  return (
    <div>
      <div className="ot-header" style={{ marginBottom: '1.5rem' }}>
        <h2>🏪 Punto de Venta</h2>
      </div>

      {/* ── alerta de caja cerrada ────────────────────────────────────────── */}
      {cashOpen === false && (
        <div style={{
          background: 'rgba(231,76,60,0.12)',
          border: '1px solid rgba(231,76,60,0.5)',
          borderRadius: 12,
          padding: '2rem',
          textAlign: 'center',
          marginBottom: '2rem',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
          <h3 style={{ color: 'var(--status-red)', marginBottom: '0.5rem' }}>
            Caja no abierta
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', maxWidth: 420, margin: '0 auto 1.25rem' }}>
            No puedes generar ventas ni registrar cobros mientras la caja esté cerrada. 
            Abre una sesión de caja para continuar operando.
          </p>
          <button
            className="btn"
            onClick={() => onNavigate && onNavigate('history')}
            style={{ padding: '0.75rem 2rem' }}
          >
            📂 Ir a Caja
          </button>
        </div>
      )}

      {cashOpen === null && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Verificando estado de la caja...
        </div>
      )}

      {/* ── contenido normal (solo si caja abierta) ───────────────────────── */}
      {cashOpen === true && (
        <>
          {/* tabs */}
          <div style={{
            display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap',
            background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: 12,
            border: '1px solid var(--border-color)'
          }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding: '0.6rem 1.4rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: activeTab === t.id
                  ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))'
                  : 'transparent',
                color: activeTab === t.id ? '#000' : 'var(--text-muted)',
                fontWeight: activeTab === t.id ? 700 : 400,
                fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem', transition: 'all 0.2s',
              }}>{t.label}</button>
            ))}
          </div>

          {activeTab === 'charge'  && <ChargeWorkOrder />}
          {activeTab === 'counter' && <CounterSale />}
          {activeTab === 'catalog' && <ServiceCatalog />}
        </>
      )}
    </div>
  );
};

export default POSDashboard;

