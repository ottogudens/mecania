import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── helpers ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '');
const clientToken = () => localStorage.getItem('clientToken');
const clientAuth = () => ({ Authorization: `ClientToken ${clientToken()}` });
const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-CL') : '—';

const STATUS_COLORS = {
  PENDING: { color: '#f59e0b', label: 'Pendiente', progress: 25 },
  IN_PROGRESS: { color: '#3b82f6', label: 'En Progreso', progress: 60 },
  COMPLETED: { color: '#8b5cf6', label: 'Completado', progress: 85 },
  DELIVERED: { color: '#10b981', label: 'Entregado', progress: 100 },
  CANCELLED: { color: '#ef4444', label: 'Cancelado', progress: 0 },
};

const MAINT_STATUS = {
  PENDING: { color: '#f59e0b', icon: '⏳' },
  NOTIFIED: { color: '#3b82f6', icon: '📬' },
  COMPLETED: { color: '#10b981', icon: '✅' },
  OVERDUE: { color: '#ef4444', icon: '⚠️' },
};

// ─── Pantalla de Login ────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const savedPhone = localStorage.getItem('clientPhone') || '';
  const savedName = localStorage.getItem('clientName') || '';

  const [useFastLogin, setUseFastLogin] = useState(!!savedPhone && !!savedName);
  const [phone, setPhone] = useState(savedPhone);
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto focus pin input when component mounts or mode switches
  useEffect(() => {
    const firstPin = document.getElementById('pin-0');
    if (firstPin) firstPin.focus();
  }, [useFastLogin]);

  const handlePinChange = (index, value) => {
    if (value.length > 1) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    // Auto-focus next input
    if (value && index < 3) {
      const next = document.getElementById(`pin-${index + 1}`);
      if (next) next.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prev = document.getElementById(`pin-${index - 1}`);
      if (prev) prev.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pinStr = pin.join('');
    const targetPhone = useFastLogin ? savedPhone : phone;
    if (!targetPhone.trim() || pinStr.length !== 4) return;

    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${API}/api/operations/client/auth/`, {
        phone: targetPhone.trim(),
        pin: pinStr,
      });
      localStorage.setItem('clientToken', data.token);
      localStorage.setItem('clientName', data.client_name);
      localStorage.setItem('clientPhone', targetPhone.trim());
      onLogin(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión.');
      setPin(['', '', '', '']);
      const firstPin = document.getElementById('pin-0');
      if (firstPin) firstPin.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchUser = () => {
    localStorage.removeItem('clientPhone');
    localStorage.removeItem('clientName');
    localStorage.removeItem('clientToken');
    setPhone('');
    setPin(['', '', '', '']);
    setUseFastLogin(false);
    setError('');
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '1rem',
    }}>
      <div className="glass-card client-login-card">
        {/* Logo */}
        <div style={{
          width: 80, height: 80,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          borderRadius: '50%', margin: '0 auto 1.5rem',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          boxShadow: '0 0 40px rgba(59,130,246,0.3)',
        }}>
          <span style={{ fontSize: '2rem' }}>🚗</span>
        </div>

        {useFastLogin ? (
          <>
            <h2 style={{
              color: '#fff', fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.5rem',
              fontFamily: 'Outfit, sans-serif',
            }}>¡Hola de nuevo!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Bienvenido de vuelta, <strong style={{ color: '#fff' }}>{savedName}</strong>.<br />
              Ingresa tu PIN para acceder a tu portal.
            </p>
          </>
        ) : (
          <>
            <h2 style={{
              color: '#fff', fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.5rem',
              fontFamily: 'Outfit, sans-serif',
            }}>Portal de Clientes</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Ingresa tu teléfono y PIN para acceder a la ficha técnica de tus vehículos.
            </p>
          </>
        )}

        {error && (
          <div style={{
            color: '#fca5a5', background: 'rgba(248,113,113,0.1)',
            padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.25rem',
            border: '1px solid rgba(248,113,113,0.2)', fontSize: '0.9rem',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Phone input */}
          {!useFastLogin && (
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <span style={{
                position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                color: '#25D366', fontSize: '1.2rem',
              }}>📱</span>
              <input
                type="tel"
                placeholder="+56 9 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: 12,
                  border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(15,23,42,0.6)',
                  color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: '1rem',
                  outline: 'none', transition: 'border-color 0.3s',
                }}
                required
              />
            </div>
          )}

          {/* PIN inputs */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block', marginBottom: 10, color: 'var(--text-muted)',
              fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1,
              textAlign: useFastLogin ? 'center' : 'left',
            }}>PIN de acceso</label>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  id={`pin-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinChange(i, e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className="client-pin-input"
                  style={{
                    borderColor: digit ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,0.8)'}
                  onBlur={(e) => e.target.style.borderColor = digit ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)'}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={loading || pin.join('').length !== 4}
            style={{
              width: '100%',
              background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
              border: 'none', padding: '1rem', fontSize: '1.1rem', fontWeight: 500,
              opacity: pin.join('').length !== 4 ? 0.5 : 1,
              transition: 'all 0.3s',
            }}
          >
            {loading ? 'Verificando...' : '🔓 Ingresar al Portal'}
          </button>
        </form>

        {useFastLogin && (
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              onClick={handleSwitchUser}
              style={{
                background: 'none', border: 'none', color: '#3b82f6',
                fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem',
                cursor: 'pointer', textDecoration: 'underline', padding: 0
              }}
            >
              ¿No eres {savedName}? Ingresar con otro teléfono
            </button>
          </div>
        )}

        <p style={{
          marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          Tu PIN fue enviado a tu WhatsApp por el taller.<br />
          Si no lo tienes, solicítalo en tu próxima visita.
        </p>
      </div>
    </div>
  );
};

// ─── Tarjeta de Vehículo (Dashboard) ─────────────────────────────────────────
const VehicleCard = ({ vehicle, activeOrders, pastOrders, pendingMaintenance, onClick }) => {
  const v = vehicle;
  return (
    <div
      className="glass-card"
      onClick={onClick}
      style={{
        cursor: 'pointer', position: 'relative', overflow: 'hidden', padding: '1.75rem',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(59,130,246,0.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Accent glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 150, height: 150,
        background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, rgba(0,0,0,0) 70%)',
        transform: 'translate(30%, -30%)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: '1.8rem' }}>🚗</span>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600 }}>
            {v.make} {v.model}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 4 }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px',
              background: 'rgba(255,255,255,0.08)', borderRadius: 4,
              letterSpacing: 2, fontFamily: 'monospace', color: '#94a3b8',
              fontSize: '0.85rem',
            }}>{v.license_plate}</span>
            {v.year && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{v.year}</span>}
            {v.color && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>• {v.color}</span>}
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '1.5rem' }}>→</span>
      </div>

      {/* Quick stats */}
      <div className="client-kpi-container">
        {activeOrders.length > 0 && (
          <div style={{
            flex: 1, padding: '0.6rem 0.8rem', borderRadius: 8,
            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
          }}>
            <div style={{ fontSize: '0.7rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>Activas</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#60a5fa' }}>{activeOrders.length}</div>
          </div>
        )}
        {pastOrders.length > 0 && (
          <div style={{
            flex: 1, padding: '0.6rem 0.8rem', borderRadius: 8,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{ fontSize: '0.7rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: 1 }}>Completadas</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>{pastOrders.length}</div>
          </div>
        )}
        {pendingMaintenance > 0 && (
          <div style={{
            flex: 1, padding: '0.6rem 0.8rem', borderRadius: 8,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
          }}>
            <div style={{ fontSize: '0.7rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1 }}>Mantenciones</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24' }}>{pendingMaintenance}</div>
          </div>
        )}
        {activeOrders.length === 0 && pastOrders.length === 0 && pendingMaintenance === 0 && (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>
            Sin actividad reciente. Toca para ver la ficha completa.
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Ficha Técnica del Vehículo ──────────────────────────────────────────────
const VehicleDetail = ({ vehicleId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTabs, setExpandedTabs] = useState({ info: true });
  const toggleTab = (id) => setExpandedTabs(prev => ({ ...prev, [id]: !prev[id] }));
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/operations/client/vehicles/${vehicleId}/`, { headers: clientAuth() })
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.error || 'Error al cargar datos.'); setLoading(false); });
  }, [vehicleId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>🔧</div>
        Cargando ficha técnica...
      </div>
    );
  }
  if (error) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#ef4444' }}>{error}</p>
        <button className="btn btn-outline" onClick={onBack}>← Volver</button>
      </div>
    );
  }
  if (!data) return null;

  const { vehicle, parts, maintenance_records, scheduled_maintenance, work_orders, visual_inspections = [] } = data;
  const tabs = [
    { id: 'info',     label: '📋 Datos',         count: null },
    { id: 'orders',   label: '🛠️ Atenciones',    count: work_orders.length },
    { id: 'inspections', label: '🔎 Inspecciones', count: visual_inspections.length },
    { id: 'parts',    label: '🔩 Repuestos',     count: parts.length },
    { id: 'maintenance', label: '📅 Mantenciones', count: maintenance_records.length },
    { id: 'scheduled', label: '⏰ Próximas',     count: scheduled_maintenance.filter(s => s.raw_status !== 'COMPLETED').length },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      {/* Header */}
      <div className="client-detail-header">
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '0.6rem 1rem', color: '#94a3b8', cursor: 'pointer',
            fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem', transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >← Mis Vehículos</button>
        <div>
          <h2 style={{
            margin: 0, fontSize: '1.6rem',
            background: 'linear-gradient(to right, #60a5fa, #c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{vehicle.make} {vehicle.model} {vehicle.year}</h2>
          <span style={{
            fontFamily: 'monospace', letterSpacing: 2, color: '#94a3b8', fontSize: '0.9rem',
          }}>{vehicle.license_plate}</span>
        </div>
      </div>

      {/* Accordions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
        
        {/* Datos */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('info')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['info'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['info'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>📋 Datos del Vehículo</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['info'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['info'] && (
            <div style={{ padding: '1.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: '1rem' }}>
                {[
                  ['Marca', vehicle.make],
                  ['Modelo', vehicle.model],
                  ['Año', vehicle.year],
                  ['Patente', vehicle.license_plate],
                  ['Color', vehicle.color || '—'],
                  ['Transmisión', vehicle.transmission_type],
                  ['Combustible', vehicle.fuel_type],
                  ['Cilindrada', vehicle.engine_displacement || '—'],
                  ['VIN / Chasis', vehicle.vin || '—'],
                  ['Nº Motor', vehicle.engine_number || '—'],
                  ['Kilometraje', vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-CL')} km` : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    padding: '0.75rem 1rem', borderRadius: 8,
                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Órdenes */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('orders')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['orders'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['orders'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>🛠️ Atenciones ({work_orders.length})</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['orders'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['orders'] && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              {work_orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Sin atenciones registradas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {work_orders.map(wo => {
                    const st = STATUS_COLORS[wo.raw_status] || STATUS_COLORS.PENDING;
                    return (
                      <div key={wo.id} className="glass-card" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div>
                            <span style={{ fontWeight: 600 }}>OT #{wo.id}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.8rem' }}>
                              {fmtDate(wo.created_at)}
                            </span>
                          </div>
                          <span style={{
                            color: st.color, fontWeight: 600, fontSize: '0.8rem',
                            padding: '0.25rem 0.8rem', background: `${st.color}18`,
                            borderRadius: 20, border: `1px solid ${st.color}40`,
                          }}>{wo.status}</span>
                        </div>

                        {!['DELIVERED', 'CANCELLED'].includes(wo.raw_status) && (
                          <div style={{
                            width: '100%', height: 6, background: 'rgba(255,255,255,0.08)',
                            borderRadius: 3, overflow: 'hidden', marginBottom: '0.75rem',
                          }}>
                            <div style={{
                              width: `${st.progress}%`, height: '100%', background: st.color,
                              transition: 'width 1s ease-in-out', borderRadius: 3,
                            }} />
                          </div>
                        )}

                        {wo.visit_reason && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            <strong>Motivo:</strong> {wo.visit_reason}
                          </div>
                        )}

                        {wo.items && wo.items.length > 0 && (
                          <div style={{
                            marginTop: '0.5rem', padding: '0.75rem',
                            background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                          }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.5rem' }}>
                              Detalle
                            </div>
                            {wo.items.map((item, idx) => (
                              <div key={idx} style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '0.3rem 0', fontSize: '0.85rem',
                                borderBottom: idx < wo.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                              }}>
                                <span style={{ color: item.is_labor ? '#c084fc' : '#94a3b8' }}>
                                  {item.is_labor ? '🔧' : '📦'} {item.description}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {item.quantity}x {fmt(item.unit_price)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inspecciones Visuales */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('inspections')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['inspections'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['inspections'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>🔎 Inspecciones ({visual_inspections.length})</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['inspections'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['inspections'] && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              {visual_inspections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Sin inspecciones visuales registradas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {visual_inspections.map(ins => {
                    const isCompleted = ins.raw_status === 'COMPLETED';
                    const color = isCompleted ? '#10b981' : (ins.raw_status === 'PENDING' ? '#f59e0b' : '#3b82f6');
                    return (
                      <div key={ins.id} className="glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${color}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div>
                            <span style={{ fontWeight: 600 }}>Inspección #{ins.id}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.8rem' }}>
                              {fmtDate(ins.created_at)}
                            </span>
                          </div>
                          <span style={{
                            color: color, fontWeight: 600, fontSize: '0.8rem',
                            padding: '0.25rem 0.8rem', background: `${color}18`,
                            borderRadius: 20, border: `1px solid ${color}40`,
                          }}>{ins.status}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <strong>Mecánico:</strong> {ins.mechanic}
                        </div>
                        {ins.notes && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                            "{ins.notes}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Repuestos */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('parts')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['parts'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['parts'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>🔩 Repuestos ({parts.length})</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['parts'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['parts'] && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              {parts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Sin repuestos registrados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {parts.map((p) => (
                    <div key={p.id} className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '1.05rem' }}>{p.name}</div>
                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>{p.oem_number}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(100px, 1fr)', gap: '0.75rem', fontSize: '0.85rem' }}>
                        <div><span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '0.7rem', marginBottom: 2 }}>Categoría</span><div style={{ color: '#e2e8f0' }}>{p.category}</div></div>
                        <div><span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '0.7rem', marginBottom: 2 }}>Marca</span><div style={{ color: '#e2e8f0' }}>{p.brand || '—'}</div></div>
                        <div><span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '0.7rem', marginBottom: 2 }}>Instalado</span><div style={{ color: '#e2e8f0' }}>{fmtDate(p.installed_at)}</div></div>
                        <div><span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '0.7rem', marginBottom: 2 }}>Km</span><div style={{ color: '#e2e8f0' }}>{p.installed_mileage ? p.installed_mileage.toLocaleString('es-CL') : '—'}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mantenciones */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('maintenance')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['maintenance'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['maintenance'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>📅 Mantenciones ({maintenance_records.length})</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['maintenance'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['maintenance'] && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              {maintenance_records.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Sin mantenciones registradas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {maintenance_records.map(r => (
                    <div key={r.id} className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600 }}>{r.maintenance_type}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {fmtDate(r.date_performed)} • {r.mileage?.toLocaleString('es-CL')} km
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {r.description}
                      </p>
                      {r.product_details && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                          📦 {r.product_details}
                        </div>
                      )}
                      {r.cost && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>
                          {fmt(r.cost)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mantenciones Programadas */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button onClick={() => toggleTab('scheduled')} style={{ width: '100%', padding: '1.25rem', background: expandedTabs['scheduled'] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', border: 'none', textAlign: 'left', color: expandedTabs['scheduled'] ? '#60a5fa' : '#f8fafc', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif' }}>
            <span>⏰ Próximas ({scheduled_maintenance.filter(s => s.raw_status !== 'COMPLETED').length})</span>
            <span style={{ opacity: 0.6 }}>{expandedTabs['scheduled'] ? '▲' : '▼'}</span>
          </button>
          {expandedTabs['scheduled'] && (
            <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'fadeIn 0.3s' }}>
              {scheduled_maintenance.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Sin mantenciones programadas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {scheduled_maintenance.map(s => {
                    const st = MAINT_STATUS[s.raw_status] || MAINT_STATUS.PENDING;
                    return (
                      <div key={s.id} className="glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${st.color}`, opacity: s.raw_status === 'COMPLETED' ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 600 }}>
                            {st.icon} {s.maintenance_type}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: st.color, padding: '0.2rem 0.6rem', background: `${st.color}18`, borderRadius: 12 }}>
                            {s.status}
                          </span>
                        </div>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          {s.description}
                        </p>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          {s.due_date && <span>📅 {fmtDate(s.due_date)}</span>}
                          {s.due_date && s.due_mileage && <span> • </span>}
                          {s.due_mileage && <span>🛣️ {s.due_mileage.toLocaleString('es-CL')} km</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// ─── Dashboard del Cliente ───────────────────────────────────────────────────
const ClientDashboard = ({ clientName, onLogout }) => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [error, setError] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // States for PIN changing modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Auto focus modal first PIN input
  useEffect(() => {
    if (showPinModal) {
      setTimeout(() => {
        const input = document.getElementById('newpin-0');
        if (input) input.focus();
      }, 100);
    }
  }, [showPinModal]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleNewPinChange = (index, value) => {
    if (value.length > 1) return;
    const nPin = [...newPin];
    nPin[index] = value;
    setNewPin(nPin);
    if (value && index < 3) {
      const nextInput = document.getElementById(`newpin-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleNewPinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !newPin[index] && index > 0) {
      const prevInput = document.getElementById(`newpin-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const submitPinChange = async (e) => {
    e.preventDefault();
    const pinStr = newPin.join('');
    if (pinStr.length !== 4) return;
    setChangingPin(true);
    setPinChangeError('');
    setPinChangeSuccess('');
    try {
      await axios.post(`${API}/api/operations/client/change-pin/`, {
        pin: pinStr
      }, {
        headers: clientAuth()
      });
      setPinChangeSuccess('¡PIN actualizado de forma segura!');
      setTimeout(() => {
        setShowPinModal(false);
        setNewPin(['', '', '', '']);
        setPinChangeSuccess('');
      }, 2000);
    } catch (err) {
      setPinChangeError(err.response?.data?.error || 'No se pudo actualizar el PIN.');
    } finally {
      setChangingPin(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/operations/client/data/`, { headers: clientAuth() });
      setVehicles(data.vehicles || []);
    } catch (err) {
      if (err.response?.status === 401) {
        onLogout();
        return;
      }
      setError(err.response?.data?.error || 'Error al cargar datos.');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // WebSocket for real-time updates
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let backendHost = import.meta.env.VITE_BACKEND_HOST || (import.meta.env.DEV ? 'localhost:8080' : window.location.host);
    backendHost = backendHost.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}//${backendHost}/ws/work_orders/`;

    const socket = new WebSocket(wsUrl);
    socket.onmessage = () => fetchData();
    return () => socket.close();
  }, [fetchData]);

  if (selectedVehicle) {
    return (
      <VehicleDetail
        vehicleId={selectedVehicle}
        onBack={() => setSelectedVehicle(null)}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>🚗</div>
        Cargando tus vehículos...
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {/* Header */}
      <div className="client-dashboard-header">
        <div>
          <h2 style={{
            fontSize: '1.8rem', margin: '0 0 0.25rem 0',
            background: 'linear-gradient(to right, #60a5fa, #c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Hola, {clientName} 👋
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Consulta la ficha técnica y estado de tus vehículos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowPinModal(true)}
            className="btn btn-outline"
            style={{ borderColor: 'rgba(59,130,246,0.4)', color: '#60a5fa', fontSize: '0.85rem' }}
          >
            🔐 Cambiar PIN
          </button>
          <button
            onClick={onLogout}
            className="btn btn-outline"
            style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444', fontSize: '0.85rem' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {showPinModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '1rem'
        }}>
          <div className="glass-card" style={{ maxWidth: 400, width: '100%', padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif' }}>Crear tu nuevo PIN</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.4 }}>
              Define un PIN de 4 dígitos propio. Lo usarás en tu próximo re-ingreso.
            </p>

            {pinChangeError && (
              <div style={{
                color: '#fca5a5', background: 'rgba(248,113,113,0.1)',
                padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
                border: '1px solid rgba(248,113,113,0.2)', fontSize: '0.85rem',
              }}>{pinChangeError}</div>
            )}

            {pinChangeSuccess && (
              <div style={{
                color: '#86efac', background: 'rgba(34,197,94,0.1)',
                padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
                border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.85rem',
              }}>{pinChangeSuccess}</div>
            )}

            <form onSubmit={submitPinChange}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {newPin.map((digit, i) => (
                  <input
                    key={i}
                    id={`newpin-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleNewPinChange(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => handleNewPinKeyDown(i, e)}
                    className="client-pin-input"
                    style={{
                      borderColor: digit ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,0.8)'}
                    onBlur={(e) => e.target.style.borderColor = digit ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)'}
                    required
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setNewPin(['', '', '', '']);
                    setPinChangeError('');
                    setPinChangeSuccess('');
                  }}
                  className="btn btn-outline"
                  style={{ flex: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  disabled={changingPin}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                    border: 'none',
                    opacity: newPin.join('').length !== 4 || changingPin ? 0.5 : 1,
                  }}
                  disabled={newPin.join('').length !== 4 || changingPin}
                >
                  {changingPin ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInstallBanner && (
        <div className="glass-card client-install-banner">
          <div>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem' }}>📱 ¡Instala la App de MecanIA!</h4>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Accede al portal más rápido directamente desde tu pantalla de inicio.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => setShowInstallBanner(false)}>Quizás más tarde</button>
            <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#3b82f6', border: 'none' }} onClick={handleInstallClick}>Instalar</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem', borderRadius: 8, marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
        }}>{error}</div>
      )}

      {/* Vehicle grid */}
      {vehicles.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🚗</span>
          <h3>Sin vehículos registrados</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            No tienes vehículos asociados a tu cuenta. Visita el taller para registrarte.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
          gap: '1.5rem',
        }}>
          {vehicles.map((item, idx) => (
            <VehicleCard
              key={idx}
              vehicle={item.vehicle}
              activeOrders={item.active_orders}
              pastOrders={item.past_orders}
              pendingMaintenance={item.pending_maintenance}
              onClick={() => setSelectedVehicle(item.vehicle.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Componente Principal ────────────────────────────────────────────────────
const ClientPortal = () => {
  const [authenticated, setAuthenticated] = useState(!!clientToken());
  const [clientName, setClientName] = useState(localStorage.getItem('clientName') || '');

  const handleLogin = (data) => {
    setAuthenticated(true);
    setClientName(data.client_name);
  };

  const handleLogout = () => {
    localStorage.removeItem('clientToken');
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <ClientDashboard clientName={clientName} onLogout={handleLogout} />;
};

export default ClientPortal;
