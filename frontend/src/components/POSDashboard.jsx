import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── helpers ──────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');
const authHeader = () => ({ Authorization: `Token ${token()}` });
const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n || 0);

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
      setMsg({ type: 'error', text: e.response?.data?.error || 'OT no encontrada.' });
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
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Error al cancelar.' });
    } finally { setLoading(false); }
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

      {invoice && (
        <>
          <InvoiceSummary invoice={invoice} />

          {!isPaid && !isCancelled && balance > 0 && (
            <div className="glass-card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>💳 Registrar Pago</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    MONTO A COBRAR
                  </label>
                  <input
                    className="glass-input"
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Saldo pendiente: {fmt(balance)}
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
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.value}
                    onClick={() => setMethod(pm.value)}
                    style={{
                      padding: '0.6rem 1.2rem', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${method === pm.value ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      background: method === pm.value ? 'rgba(102,252,241,0.15)' : 'transparent',
                      color: method === pm.value ? 'var(--primary-color)' : 'var(--text-muted)',
                      fontWeight: method === pm.value ? 700 : 400, transition: 'all 0.2s',
                      fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem'
                    }}
                  >{pm.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn" style={{ flex: 1 }} onClick={charge} disabled={loading}>
                  {loading ? 'Procesando...' : `💰 Cobrar ${fmt(amount)}`}
                </button>
                <button className="btn btn-outline" style={{ color: 'var(--status-red)', borderColor: 'var(--status-red)' }}
                  onClick={cancel} disabled={loading}>
                  ✕ Cancelar Factura
                </button>
              </div>
            </div>
          )}

          {(isPaid) && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
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
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--status-red)', fontWeight: 600 }}>
              ✕ Esta factura fue cancelada.
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── pantalla 2: venta de mostrador ──────────────────────────────────────────
const CounterSale = () => {
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cartItems, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [method, setMethod] = useState('CASH');
  const [invoice, setInvoice] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('products');

  useEffect(() => {
    const h = { headers: authHeader() };
    Promise.all([
      axios.get('/api/inventory/products/?popular=true', h),
      axios.get('/api/inventory/services/?popular=true', h),
      axios.get('/api/inventory/service-categories/', h),
    ]).then(([p, s, c]) => {
      setProducts(p.data.results || p.data);
      setServices(s.data.results || s.data);
      setCategories(c.data.results || c.data);
    });
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
    const p = products.find(prod => prod.sku === barcodeInput.trim() || prod.id.toString() === barcodeInput.trim());
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

  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const iva = subtotal * 0.19;
  const total = subtotal + iva;

  const checkout = async () => {
    if (!cartItems.length) return;
    setLoading(true); setMsg(null);
    const items = cartItems.map(i =>
      i.type === 'product'
        ? { product_id: i.id, quantity: i.qty }
        : { service_id: i.id, quantity: i.qty, unit_price: i.price }
    );
    try {
      const { data: inv } = await axios.post('/api/finance/pos/counter-sale/', { items }, { headers: authHeader() });
      const { data: charged } = await axios.post('/api/finance/pos/charge/', {
        invoice_id: inv.id,
        amount: parseFloat(inv.total_amount),
        payment_method: method,
      }, { headers: authHeader() });
      setInvoice(charged.invoice);
      setCart([]);
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

        <form onSubmit={handleScan} style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Escanear SKU con pistola lectora..." 
            value={barcodeInput} 
            onChange={e => setBarcodeInput(e.target.value)} 
            autoFocus 
            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px' }} 
          />
          <button type="submit" className="btn btn-outline" style={{ padding: '0 1rem' }}>Escanear</button>
        </form>

        {tab === 'products' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {products.map(p => (
              <div key={p.id} className="glass-card" style={{ padding: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                onClick={() => p.stock_quantity > 0 && addProduct(p)}>
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.75rem' }} />
                )}
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>SKU: {p.sku}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(p.price)}</span>
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
                      <div style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(s.price)}</div>
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
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>🛒 Carrito</h3>

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
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{fmt(item.price)} c/u</div>
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

            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              {[['Subtotal', fmt(subtotal)], ['IVA 19%', fmt(iva)]].map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <span>{lbl}</span><span>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 700, fontSize: '1.15rem' }}>
                <span>TOTAL</span><span style={{ color: 'var(--primary-color)' }}>{fmt(total)}</span>
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
              {loading ? 'Procesando...' : `✅ Cobrar ${fmt(total)}`}
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
const POSDashboard = () => {
  const [activeTab, setActiveTab] = useState('charge');

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
    </div>
  );
};

export default POSDashboard;
