import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function CashMovements() {
  const [activeSession, setActiveSession] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [movementType, setMovementType] = useState('OUT'); // EGRESO by default
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // Get current active session
      const sessRes = await axios.get('/api/finance/cash-register/');
      const sessList = Array.isArray(sessRes.data) ? sessRes.data : (sessRes.data?.results || []);
      const openSession = sessList.find(s => s.status === 'OPEN');
      setActiveSession(openSession || null);

      // Get movements list
      const movRes = await axios.get('/api/finance/cash-movements/');
      const movList = Array.isArray(movRes.data) ? movRes.data : (movRes.data?.results || []);
      setMovements(movList);
    } catch (err) {
      console.error(err);
      showToast('Error al cargar datos de movimientos de caja.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Por favor ingrese un monto válido mayor a 0.', 'error');
      return;
    }
    if (!description.trim()) {
      showToast('Por favor ingrese una descripción.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        amount: parseFloat(amount),
        description: description.trim(),
        movement_type: movementType,
        session: activeSession ? activeSession.id : null,
      };

      await axios.post('/api/finance/cash-movements/', payload);
      showToast('Movimiento registrado correctamente.');
      setAmount('');
      setDescription('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Error al guardar el movimiento.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (num) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(num);

  return (
    <div className="cash-movements-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '12px' }}>
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: '8px',
          background: toastMsg.type === 'error' ? 'var(--status-red)' : 'var(--status-green)',
          color: '#fff',
          zIndex: 9999,
          fontWeight: 650,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideIn 0.3s ease'
        }}>
          {toastMsg.text}
        </div>
      )}

      {/* Cash Box Banner */}
      {!loading && (
        <div style={{
          background: activeSession ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(234, 179, 8, 0.15) 100%)' : 'var(--surface-1)',
          color: 'var(--text-primary)',
          padding: '24px',
          borderRadius: 'var(--radius-lg)',
          border: activeSession ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeSession ? 'Caja Abierta y Operando' : 'Caja Cerrada'}
            </h2>
            <p style={{ margin: '6px 0 0 0', opacity: 0.85, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {activeSession
                ? `Turno iniciado por ${activeSession.opened_by_username} el ${new Date(activeSession.opened_at).toLocaleString()}`
                : 'Debes abrir caja en el panel de turnos de caja para registrar movimientos asociados a un turno.'}
            </p>
          </div>
          {activeSession && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', tracking: '1px', color: 'var(--text-secondary)' }}>Total Movimientos Manuales</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-primary)' }}>
                {fmt(activeSession.total_inflow - activeSession.total_outflow)}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(320px, 100%), 1fr) 2fr', gap: '24px' }} className="responsive-grid-movements">
        {/* Registration Form Card */}
        <div className="glass-card" style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'fit-content'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 650, color: 'var(--text-primary)' }}>
            Registrar Movimiento Manual
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Registra egresos de caja para compras menores, almuerzos, fletes o ingresos extraordinarios.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Tipo de Movimiento
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setMovementType('OUT')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '2px dashed var(--border-color)',
                    background: movementType === 'OUT' ? 'var(--status-red-dim)' : 'transparent',
                    borderColor: movementType === 'OUT' ? 'var(--status-red)' : 'var(--border-color)',
                    color: movementType === 'OUT' ? 'var(--status-red)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Egreso (Salida)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('IN')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '2px dashed var(--border-color)',
                    background: movementType === 'IN' ? 'var(--status-green-dim)' : 'transparent',
                    borderColor: movementType === 'IN' ? 'var(--status-green)' : 'var(--border-color)',
                    color: movementType === 'IN' ? 'var(--status-green)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Ingreso (Entrada)
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="mov-amount" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Monto
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-primary)' }}>$</span>
                <input
                  id="mov-amount"
                  type="number"
                  placeholder="Ej. 15000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting}
                  className="glass-input"
                  style={{
                    paddingLeft: '24px',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="mov-desc" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Descripción / Glosa
              </label>
              <textarea
                id="mov-desc"
                placeholder="Ej. Compra de repuestos urgentes o almuerzos"
                rows="3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                className="glass-input"
                style={{
                  fontSize: '0.9rem',
                  resize: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                fontWeight: 650,
                border: 'none',
                background: movementType === 'IN' ? 'var(--status-green)' : 'var(--status-red)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {submitting ? 'Registrando...' : 'Confirmar e Inyectar'}
            </button>
          </form>
        </div>

        {/* History List Card */}
        <div className="glass-card" style={{
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 650, color: 'var(--text-primary)' }}>
            Historial de Movimientos de Caja
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando movimientos...</div>
          ) : movements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '2px dashed var(--border-color)', borderRadius: '12px' }}>
              No se han registrado movimientos de caja manuales.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '12px 8px' }}>Fecha / Hora</th>
                    <th style={{ padding: '12px 8px' }}>Tipo</th>
                    <th style={{ padding: '12px 8px' }}>Glosa</th>
                    <th style={{ padding: '12px 8px' }}>Registrado por</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => {
                    const isEgreso = mov.movement_type === 'OUT';
                    return (
                      <tr key={mov.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                          {new Date(mov.date).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: isEgreso ? 'var(--status-red)' : 'var(--status-green)',
                            background: isEgreso ? 'rgba(235, 87, 87, 0.08)' : 'rgba(39, 174, 96, 0.08)'
                          }}>
                            {isEgreso ? 'EGRESO' : 'INGRESO'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px', fontWeight: 500 }}>
                          {mov.description}
                          {mov.session ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                              (Turno #{mov.session})
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--status-red)', marginLeft: '6px' }}>
                              (Fuera de Turno)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                          {mov.registered_by_username || 'Sistema'}
                        </td>
                        <td style={{
                          padding: '12px 8px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: isEgreso ? 'var(--status-red)' : 'var(--status-green)'
                        }}>
                          {isEgreso ? '-' : '+'} {fmt(mov.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
