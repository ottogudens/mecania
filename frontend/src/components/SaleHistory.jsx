import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const authHeader = () => ({ Authorization: `Token ${localStorage.getItem('token')}` });
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: 0 })}`;

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' };
const SOURCE_LABELS = { WORK_ORDER: '📋 OT', COUNTER_SALE: '🛒 Mostrador' };
const STATUS_MAP = {
  DRAFT:          { label: 'Borrador',   cls: 'pending' },
  SENT:           { label: 'Pendiente',  cls: 'yellow'  },
  PARTIALLY_PAID: { label: 'Abono',      cls: 'yellow'  },
  PAID:           { label: 'Pagado',     cls: 'green'   },
  CANCELLED:      { label: 'Cancelado',  cls: 'red'     },
  VOID:           { label: 'Anulado',    cls: 'red'     },
};

// ── Descarga PDF abriendo en nueva pestaña ─────────────────────────────────
const openPDF = async (invoiceId) => {
  try {
    const res = await axios.get(`/api/finance/invoices/${invoiceId}/pdf/`, {
      headers: authHeader(),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
  } catch {
    alert('Error al generar el PDF.');
  }
};

// ── Detalle modal de una factura ──────────────────────────────────────────
const InvoiceDetailModal = ({ invoice, onClose }) => {
  if (!invoice) return null;
  const st = STATUS_MAP[invoice.status] || { label: invoice.status, cls: 'pending' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* header */}
        <div className="ot-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>
              Factura #{invoice.id} — {SOURCE_LABELS[invoice.source] || invoice.source}
            </h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {new Date(invoice.created_at).toLocaleString('es-CL')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className={`badge ${st.cls}`}>{st.label}</span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1
            }}>✕</button>
          </div>
        </div>

        {/* ítems */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              {['Descripción', 'Cant.', 'P. Unit.', 'Total'].map(h => (
                <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: h === 'Descripción' ? 'left' : 'right',
                  color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((it, i) => (
              <tr key={it.id || i} style={{ borderBottom: '1px solid rgba(69,162,158,0.1)' }}>
                <td style={{ padding: '0.5rem' }}>{it.description || it.product_name || it.service_name || '–'}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{it.quantity}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{fmt(it.unit_price)}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--primary-color)', fontWeight: 600 }}>
                  {fmt(it.total_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* totales */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
          {[['Subtotal', invoice.subtotal], ['IVA 19%', invoice.tax_amount]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <span>{l}</span><span>{fmt(v)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 700, fontSize: '1.1rem' }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary-color)' }}>{fmt(invoice.total_amount)}</span>
          </div>
          {parseFloat(invoice.amount_paid) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--status-green)' }}>Pagado</span>
              <span style={{ color: 'var(--status-green)' }}>{fmt(invoice.amount_paid)}</span>
            </div>
          )}
        </div>

        {/* pagos */}
        {invoice.payments?.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Pagos registrados
            </p>
            {invoice.payments.map(pay => (
              <div key={pay.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)',
                borderRadius: 8, marginBottom: 6, fontSize: '0.9rem'
              }}>
                <span>{METHOD_LABELS[pay.payment_method] || pay.payment_method}</span>
                {pay.reference_number && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Ref: {pay.reference_number}</span>
                )}
                <span style={{ fontWeight: 600, color: 'var(--status-green)' }}>{fmt(pay.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => openPDF(invoice.id)}>
            🖨️ Ver / Imprimir PDF
          </button>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ── Componente principal ───────────────────────────────────────────────────
const SaleHistory = () => {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState({ status: '', source: '', method: '' });
  const [activeTab, setActiveTab] = useState('invoices');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { headers: authHeader() };
      const [inv, pay] = await Promise.all([
        axios.get('/api/finance/invoices/', h),
        axios.get('/api/finance/payments/', h),
      ]);
      setInvoices(inv.data.results || inv.data);
      setPayments(pay.data.results || pay.data);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── métricas de caja ──────────────────────────────────────────────────
  const paidInvoices = invoices.filter(i => i.status === 'PAID');
  const partialInvoices = invoices.filter(i => i.status === 'PARTIALLY_PAID');
  const pendingInvoices = invoices.filter(i => ['SENT', 'DRAFT'].includes(i.status));

  const totalCobrado = invoices.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0);
  const totalPendiente = pendingInvoices.reduce((s, i) => s + parseFloat(i.balance_due || i.total_amount || 0), 0);

  const porMedio = payments.reduce((acc, p) => {
    acc[p.payment_method] = (acc[p.payment_method] || 0) + parseFloat(p.amount || 0);
    return acc;
  }, {});

  // ── filtros ───────────────────────────────────────────────────────────
  const filtered = invoices.filter(i => {
    if (filter.status && i.status !== filter.status) return false;
    if (filter.source && i.source !== filter.source) return false;
    return true;
  });

  const filteredPayments = payments.filter(p => {
    if (filter.method && p.payment_method !== filter.method) return false;
    return true;
  });

  const Select = ({ val, onChange, opts, placeholder }) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={{
      padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)',
      borderRadius: 8, color: val ? '#fff' : 'var(--text-muted)', fontFamily: 'Outfit, sans-serif',
      fontSize: '0.85rem', cursor: 'pointer'
    }}>
      <option value="">{placeholder}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando historial...</div>;

  return (
    <div>
      <div className="ot-header" style={{ marginBottom: '1.5rem' }}>
        <h2>📊 Historial de Ventas y Caja</h2>
        <button className="btn btn-outline" onClick={load} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          ↺ Actualizar
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Total Cobrado',    value: fmt(totalCobrado),      color: 'var(--primary-color)', bg: 'rgba(102,252,241,0.08)' },
          { label: 'Por Cobrar',       value: fmt(totalPendiente),    color: 'var(--status-yellow)', bg: 'rgba(241,196,15,0.08)'  },
          { label: 'Facturas Pagadas', value: paidInvoices.length,    color: 'var(--status-green)',  bg: 'rgba(46,204,113,0.08)'  },
          { label: 'Con Abono',        value: partialInvoices.length, color: 'var(--status-yellow)', bg: 'rgba(241,196,15,0.06)'  },
          { label: 'Pendientes',       value: pendingInvoices.length, color: 'var(--text-muted)',    bg: 'rgba(0,0,0,0.2)'        },
          { label: 'Total Facturas',   value: invoices.length,        color: 'var(--text-main)',     bg: 'rgba(0,0,0,0.2)'        },
        ].map(k => (
          <div key={k.label} className="glass-card" style={{ padding: '1rem', background: k.bg, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}>{k.label}</div>
            <div style={{ color: k.color, fontWeight: 700, fontSize: '1.3rem', marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── desglose por medio ── */}
      {Object.keys(porMedio).length > 0 && (
        <div className="glass-card" style={{ marginBottom: '1.75rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>Ingresos por medio:</span>
          {Object.entries(porMedio).map(([m, v]) => (
            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{METHOD_LABELS[m] || m}</span>
              <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── tabs ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem',
        background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: 12,
        border: '1px solid var(--border-color)', width: 'fit-content' }}>
        {[['invoices','📄 Facturas'], ['payments','💳 Movimientos de Caja']].map(([id, lbl]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: activeTab === id
              ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))'
              : 'transparent',
            color: activeTab === id ? '#000' : 'var(--text-muted)',
            fontWeight: activeTab === id ? 700 : 400,
            fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem', transition: 'all 0.2s',
          }}>{lbl}</button>
        ))}
      </div>

      {/* ── filtros ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {activeTab === 'invoices' && (
          <>
            <Select val={filter.status} onChange={v => setFilter(f => ({ ...f, status: v }))}
              placeholder="Todos los estados"
              opts={Object.entries(STATUS_MAP).map(([k, v]) => [k, v.label])} />
            <Select val={filter.source} onChange={v => setFilter(f => ({ ...f, source: v }))}
              placeholder="Origen"
              opts={[['WORK_ORDER','📋 OT'], ['COUNTER_SALE','🛒 Mostrador']]} />
            {(filter.status || filter.source) && (
              <button className="btn btn-outline" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                onClick={() => setFilter({ status: '', source: '', method: '' })}>✕ Limpiar</button>
            )}
          </>
        )}
        {activeTab === 'payments' && (
          <>
            <Select val={filter.method} onChange={v => setFilter(f => ({ ...f, method: v }))}
              placeholder="Medio de pago"
              opts={Object.entries(METHOD_LABELS).map(([k, v]) => [k, v])} />
            {filter.method && (
              <button className="btn btn-outline" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                onClick={() => setFilter(f => ({ ...f, method: '' }))}>✕ Limpiar</button>
            )}
          </>
        )}
      </div>

      {/* ── tabla facturas ── */}
      {activeTab === 'invoices' && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin resultados para los filtros aplicados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.25)' }}>
                  {['#', 'Fecha', 'Origen', 'Cliente / Vehículo', 'Total', 'Pagado', 'Saldo', 'Estado', ''].map(h => (
                    <th key={h} style={{ padding: '0.75rem 0.875rem', textAlign: h === '#' || h === '' ? 'center' : 'left',
                      color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const st = STATUS_MAP[inv.status] || { label: inv.status, cls: 'pending' };
                  const balance = parseFloat(inv.total_amount) - parseFloat(inv.amount_paid);
                  return (
                    <tr key={inv.id} style={{
                      borderBottom: '1px solid rgba(69,162,158,0.08)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)',
                      transition: 'background 0.15s', cursor: 'pointer'
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(102,252,241,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'}
                    >
                      <td style={{ padding: '0.7rem 0.875rem', textAlign: 'center', color: 'var(--text-muted)' }}>{inv.id}</td>
                      <td style={{ padding: '0.7rem 0.875rem', whiteSpace: 'nowrap' }}>
                        {new Date(inv.created_at).toLocaleDateString('es-CL')}
                      </td>
                      <td style={{ padding: '0.7rem 0.875rem' }}>{SOURCE_LABELS[inv.source] || inv.source}</td>
                      <td style={{ padding: '0.7rem 0.875rem' }}>
                        {inv.client_name || inv.vehicle_license_plate || <span style={{ color: 'var(--text-muted)' }}>Anónimo</span>}
                      </td>
                      <td style={{ padding: '0.7rem 0.875rem', fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                      <td style={{ padding: '0.7rem 0.875rem', color: 'var(--status-green)' }}>{fmt(inv.amount_paid)}</td>
                      <td style={{ padding: '0.7rem 0.875rem', color: balance > 0 ? 'var(--status-yellow)' : 'var(--text-muted)' }}>
                        {balance > 0 ? fmt(balance) : '–'}
                      </td>
                      <td style={{ padding: '0.7rem 0.875rem' }}>
                        <span className={`badge ${st.cls}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '0.7rem 0.875rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.8rem' }}
                            onClick={() => setSelected(inv)}>Ver</button>
                          <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.8rem',
                            color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                            onClick={() => openPDF(inv.id)}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── tabla movimientos ── */}
      {activeTab === 'payments' && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {filteredPayments.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin movimientos.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.25)' }}>
                  {['Fecha', 'Factura #', 'Medio', 'Referencia', 'Registrado por', 'Monto'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 0.875rem', textAlign: h === 'Monto' ? 'right' : 'left',
                      color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p, i) => (
                  <tr key={p.id} style={{
                    borderBottom: '1px solid rgba(69,162,158,0.08)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'
                  }}>
                    <td style={{ padding: '0.7rem 0.875rem', whiteSpace: 'nowrap' }}>
                      {new Date(p.date).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem', color: 'var(--text-muted)' }}>#{p.invoice}</td>
                    <td style={{ padding: '0.7rem 0.875rem' }}>{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                    <td style={{ padding: '0.7rem 0.875rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {p.reference_number || '–'}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {p.registered_by_username || '–'}
                    </td>
                    <td style={{ padding: '0.7rem 0.875rem', textAlign: 'right', fontWeight: 700,
                      color: 'var(--status-green)', fontSize: '0.95rem' }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-color)', background: 'rgba(102,252,241,0.05)' }}>
                  <td colSpan={5} style={{ padding: '0.75rem 0.875rem', fontWeight: 600 }}>Total movimientos filtrados</td>
                  <td style={{ padding: '0.75rem 0.875rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {fmt(filteredPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {selected && <InvoiceDetailModal invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default SaleHistory;
