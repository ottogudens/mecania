import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';
import SaleHistory from './SaleHistory';

const authHeader = () => ({ Authorization: `Token ${localStorage.getItem('token')}` });
const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const METHOD_LABELS = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '🏦 Transferencia' };

const CashRegister = () => {
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingAmount, setOpeningAmount] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showXReportModal, setShowXReportModal] = useState(false);
  const [xReportData, setXReportData] = useState(null);
  const [selectedCloseSession, setSelectedCloseSession] = useState(null);
  const [zReportData, setZReportData] = useState(null);

  // Form de Cierre
  const [closingCash, setClosingCash] = useState('');
  const [closingCard, setClosingCard] = useState('');
  const [closingTransfer, setClosingTransfer] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const toast = useToast();

  useEffect(() => {
    fetchCurrentSession();
    fetchHistory();
  }, []);

  const fetchCurrentSession = async () => {
    try {
      const res = await axios.get('/api/finance/cash-register/current/', { headers: authHeader() });
      setSession(res.data);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo cargar la sesión de caja actual.', type: 'error' });
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/finance/cash-register/', { headers: authHeader() });
      setHistory(res.data.results || res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSession = async (e) => {
    e.preventDefault();
    if (!openingAmount || isNaN(openingAmount) || parseFloat(openingAmount) < 0) {
      toast({ title: 'Error', message: 'Por favor, ingresa un monto inicial válido.', type: 'error' });
      return;
    }

    try {
      const res = await axios.post('/api/finance/cash-register/open_session/', {
        opening_amount: parseFloat(openingAmount)
      }, { headers: authHeader() });
      setSession(res.data);
      setOpeningAmount('');
      toast({ title: 'Caja Abierta', message: `Caja abierta exitosamente con ${fmt(res.data.opening_amount)}`, type: 'success' });
      fetchHistory();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'No se pudo abrir la caja.';
      toast({ title: 'Error', message: errorMsg, type: 'error' });
    }
  };

  const handleShowXReport = async () => {
    try {
      const res = await axios.get('/api/finance/cash-register/x-report/', { headers: authHeader() });
      setXReportData(res.data);
      setShowXReportModal(true);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error al generar reporte X.';
      toast({ title: 'Error', message: errorMsg, type: 'error' });
    }
  };

  const handleOpenCloseModal = async () => {
    try {
      const res = await axios.get('/api/finance/cash-register/x-report/', { headers: authHeader() });
      setXReportData(res.data);
      setClosingCash(res.data.expected_cash);
      setClosingCard(res.data.expected_card);
      setClosingTransfer(res.data.expected_transfer);
      setClosingNotes('');
      setShowCloseModal(true);
    } catch (err) {
      toast({ title: 'Error', message: 'No se pudieron estimar los valores esperados de caja.', type: 'error' });
    }
  };

  const handleCloseSession = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`/api/finance/cash-register/${session.id}/close_session/`, {
        closing_cash: parseFloat(closingCash || 0),
        closing_card: parseFloat(closingCard || 0),
        closing_transfer: parseFloat(closingTransfer || 0),
        closing_notes: closingNotes
      }, { headers: authHeader() });

      toast({ title: 'Caja Cerrada', message: 'La sesión de caja se cerró y guardó correctamente.', type: 'success' });
      setShowCloseModal(false);
      setSession(null);
      fetchHistory();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'No se pudo cerrar la caja.';
      toast({ title: 'Error', message: errorMsg, type: 'error' });
    }
  };

  const handleViewZReport = async (sess) => {
    setSelectedCloseSession(sess);
    try {
      const res = await axios.get(`/api/finance/cash-register/${sess.id}/z_report/`, { headers: authHeader() });
      setZReportData(res.data);
    } catch (err) {
      toast({ title: 'Error', message: 'No se pudo cargar el reporte Z.', type: 'error' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* SECCIÓN ACTUAL DE CAJA */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {session ? '🟢 Turno de Caja Abierto' : '🔴 Turno de Caja Cerrado'}
        </h3>

        {!session ? (
          <form onSubmit={handleOpenSession} style={{ maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No hay ninguna caja abierta en este momento. Ingresa el fondo fijo de efectivo inicial para habilitar las ventas.
            </p>
            <div className="input-group">
              <label className="input-label">Monto Inicial en Efectivo (Fondo Fijo)</label>
              <input
                type="number"
                className="input-field"
                placeholder="Ej: 50000"
                value={openingAmount}
                onChange={e => setOpeningAmount(e.target.value)}
                required
                min="0"
              />
            </div>
            <button type="submit" className="btn btn-success" style={{ width: 'fit-content' }}>
              🔓 Abrir Caja / Iniciar Turno
            </button>
          </form>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Cajero Responsable</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: 4 }}>{session.opened_by_username}</div>
              </div>
              <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Apertura</span>
                <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: 4 }}>{new Date(session.opened_at).toLocaleString('es-CL')}</div>
              </div>
              <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Efectivo Inicial</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary-color)', marginTop: 4 }}>{fmt(session.opening_amount)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={handleShowXReport}>
                📊 Generar Reporte X (Parcial)
              </button>
              <button className="btn btn-success" onClick={handleOpenCloseModal}>
                🔒 Realizar Cierre de Caja
              </button>
            </div>
          </div>
        )}
      </div>

      {/* REPORTES DE HISTORIAL Y CIERRES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Historial de Turnos de Caja */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>🗃️ Historial de Turnos Anteriores</h3>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Cargando historial...</div>
          ) : history.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No hay turnos registrados en el sistema.</div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '1rem' }}>Caja #</th>
                    <th style={{ padding: '1rem' }}>Apertura</th>
                    <th style={{ padding: '1rem' }}>Cierre</th>
                    <th style={{ padding: '1rem' }}>Estado</th>
                    <th style={{ padding: '1rem' }}>Fondo Inicial</th>
                    <th style={{ padding: '1rem' }}>Declarado Efectivo</th>
                    <th style={{ padding: '1rem' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(sess => (
                    <tr key={sess.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', fontWeight: 600 }}>#{sess.id}</td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{new Date(sess.opened_at).toLocaleString('es-CL')}</td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{sess.closed_at ? new Date(sess.closed_at).toLocaleString('es-CL') : '–'}</td>
                      <td style={{ padding: '1rem' }}>
                        <span className={`badge ${sess.status === 'OPEN' ? 'green' : 'red'}`} style={{ fontSize: '0.8rem' }}>
                          {sess.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>{fmt(sess.opening_amount)}</td>
                      <td style={{ padding: '1rem' }}>{sess.closing_cash !== null ? fmt(sess.closing_cash) : '–'}</td>
                      <td style={{ padding: '1rem' }}>
                        {sess.status === 'CLOSED' && (
                          <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleViewZReport(sess)}>
                            Ver Z-Report
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Componente original de Historial de Ventas */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <SaleHistory />
        </div>

      </div>

      {/* MODAL REPORTE X */}
      {showXReportModal && xReportData && (
        <div className="modal-overlay" onClick={() => setShowXReportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">📊 Reporte X (Caja Abierta)</h3>
              <button className="modal-close" onClick={() => setShowXReportModal(false)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              <div>
                <strong>Apertura:</strong> {new Date(xReportData.session.opened_at).toLocaleString('es-CL')}<br />
                <strong>Responsable:</strong> {xReportData.session.opened_by_username}
              </div>
              
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-color)' }}>Totales Estimados por el Sistema</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <span>Efectivo Inicial:</span><strong>{fmt(xReportData.opening_amount)}</strong>
                  <span>Ventas Efectivo (+):</span><strong>{fmt(xReportData.expected_cash)}</strong>
                  <span>Ventas Tarjeta:</span><strong>{fmt(xReportData.expected_card)}</strong>
                  <span>Ventas Transferencia:</span><strong>{fmt(xReportData.expected_transfer)}</strong>
                  <span style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', fontWeight: 600 }}>Total Estimado en Caja:</span>
                  <strong style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', color: 'var(--status-green)', fontSize: '1.1rem' }}>
                    {fmt(xReportData.expected_total)}
                  </strong>
                </div>
              </div>

              <div>
                <h4 style={{ marginBottom: '0.5rem' }}>Últimos Pagos Recibidos</h4>
                {xReportData.payments?.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay ventas registradas aún en este turno.</p>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.85rem' }}>
                    {xReportData.payments?.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span>{new Date(p.date).toLocaleTimeString('es-CL')} - Invoice #{p.invoice} ({METHOD_LABELS[p.payment_method] || p.payment_method})</span>
                        <strong>{fmt(p.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn" onClick={() => setShowXReportModal(false)}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CIERRE DE CAJA */}
      {showCloseModal && xReportData && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 className="modal-title">🔒 Cierre de Caja (Arqueo Físico)</h3>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCloseSession} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              
              <div style={{ background: 'rgba(241,196,15,0.04)', border: '1px solid rgba(241,196,15,0.15)', padding: '1rem', borderRadius: 8, fontSize: '0.9rem' }}>
                <strong>Resumen Esperado:</strong> Fondo inicial {fmt(xReportData.opening_amount)} + Efectivo {fmt(xReportData.expected_cash)} + Tarjetas {fmt(xReportData.expected_card)} + Transferencias {fmt(xReportData.expected_transfer)}.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Efectivo Físico Declarado ($)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={closingCash}
                    onChange={e => setClosingCash(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--text-muted)' }}>Esperado: {fmt(xReportData.expected_cash)} + Fondo inicial</small>
                </div>

                <div className="input-group">
                  <label className="input-label">Tarjetas Declarado ($)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={closingCard}
                    onChange={e => setClosingCard(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--text-muted)' }}>Esperado: {fmt(xReportData.expected_card)}</small>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Transferencias Declarado ($)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={closingTransfer}
                    onChange={e => setClosingTransfer(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--text-muted)' }}>Esperado: {fmt(xReportData.expected_transfer)}</small>
                </div>

                <div className="input-group">
                  <label className="input-label">Diferencias Totales</label>
                  <div style={{
                    padding: '0.75rem', 
                    background: 'rgba(0,0,0,0.2)', 
                    borderRadius: 8, 
                    border: '1px solid var(--border-color)',
                    fontWeight: 600,
                    color: (parseFloat(closingCash || 0) + parseFloat(closingCard || 0) + parseFloat(closingTransfer || 0)) - (xReportData.expected_cash + xReportData.expected_card + xReportData.expected_transfer) === 0 ? 'var(--status-green)' : 'var(--status-red)'
                  }}>
                    Diferencia: {fmt((parseFloat(closingCash || 0) + parseFloat(closingCard || 0) + parseFloat(closingTransfer || 0)) - (xReportData.expected_cash + xReportData.expected_card + xReportData.expected_transfer))}
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Observaciones y Notas de Cierre</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="Detalla cualquier faltante, sobrante o voucher de tarjetas..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCloseModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">🔒 Confirmar Cierre y Arqueo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REPORTE DE CIERRE Z */}
      {selectedCloseSession && zReportData && (
        <div className="modal-overlay" onClick={() => setSelectedCloseSession(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 className="modal-title">📊 Reporte Z (Caja #{selectedCloseSession.id} Cerrada)</h3>
              <button className="modal-close" onClick={() => setSelectedCloseSession(null)}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              <div>
                <strong>Apertura:</strong> {new Date(zReportData.session.opened_at).toLocaleString('es-CL')}<br />
                <strong>Cierre:</strong> {zReportData.session.closed_at ? new Date(zReportData.session.closed_at).toLocaleString('es-CL') : '–'}<br />
                <strong>Responsable Apertura:</strong> {zReportData.session.opened_by_username}<br />
                <strong>Responsable Cierre:</strong> {zReportData.session.closed_by_username || '–'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-color)' }}>Estimado en Sistema</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                    <span>Efectivo Inicial: <strong>{fmt(zReportData.session.opening_amount)}</strong></span>
                    <span>Ventas Efectivo: <strong>{fmt(zReportData.expected_cash)}</strong></span>
                    <span>Ventas Tarjeta: <strong>{fmt(zReportData.expected_card)}</strong></span>
                    <span>Ventas Transf.: <strong>{fmt(zReportData.expected_transfer)}</strong></span>
                    <span style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.4rem', fontWeight: 600 }}>
                      Total: {fmt(zReportData.expected_total)}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--status-green)' }}>Declarado en Arqueo</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                    <span>Efectivo Declarado: <strong>{fmt(zReportData.session.closing_cash)}</strong></span>
                    <span>Tarjeta Declarado: <strong>{fmt(zReportData.session.closing_card)}</strong></span>
                    <span>Transf. Declarado: <strong>{fmt(zReportData.session.closing_transfer)}</strong></span>
                    <span style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.4rem', fontWeight: 600 }}>
                      Total Declarado: {fmt(parseFloat(zReportData.session.closing_cash || 0) + parseFloat(zReportData.session.closing_card || 0) + parseFloat(zReportData.session.closing_transfer || 0))}
                    </span>
                  </div>
                </div>
              </div>

              {zReportData.session.closing_notes && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <strong>Notas del Cierre:</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{zReportData.session.closing_notes}</p>
                </div>
              )}

              <div>
                <h4 style={{ marginBottom: '0.5rem' }}>Movimientos en Turno</h4>
                {zReportData.payments?.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay ventas registradas en esta sesión.</p>
                ) : (
                  <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.85rem' }}>
                    {zReportData.payments?.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span>{new Date(p.date).toLocaleString('es-CL')} - Invoice #{p.invoice} ({METHOD_LABELS[p.payment_method] || p.payment_method})</span>
                        <strong>{fmt(p.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn" onClick={() => setSelectedCloseSession(null)}>Cerrar Detalle</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CashRegister;
