import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── helpers ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const clientToken = () => sessionStorage.getItem('clientToken');
const clientAuth = () => ({ Authorization: `ClientToken ${clientToken()}` });
const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n || 0);
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
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!phone.trim() || pinStr.length !== 4) return;

    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${API}/api/operations/client/auth/`, {
        phone: phone.trim(),
        pin: pinStr,
      });
      sessionStorage.setItem('clientToken', data.token);
      sessionStorage.setItem('clientName', data.client_name);
      onLogin(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh',
    }}>
      <div className="glass-card" style={{
        maxWidth: 460, width: '100%', textAlign: 'center', padding: '3rem 2rem',
        background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))',
      }}>
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

        <h2 style={{
          color: '#fff', fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.5rem',
          fontFamily: 'Outfit, sans-serif',
        }}>Portal de Clientes</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
          Ingresa tu teléfono y PIN para acceder a la ficha técnica de tus vehículos.
        </p>

        {error && (
          <div style={{
            color: '#fca5a5', background: 'rgba(248,113,113,0.1)',
            padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.25rem',
            border: '1px solid rgba(248,113,113,0.2)', fontSize: '0.9rem',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Phone input */}
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

          {/* PIN inputs */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block', marginBottom: 10, color: 'var(--text-muted)',
              fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1,
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
                  style={{
                    width: 52, height: 60, textAlign: 'center', fontSize: '1.5rem',
                    fontWeight: 700, borderRadius: 12,
                    border: `2px solid ${digit ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    background: 'rgba(15,23,42,0.8)', color: '#fff',
                    outline: 'none', transition: 'all 0.2s', fontFamily: 'Outfit, sans-serif',
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
      <div style={{ display: 'flex', gap: '1rem' }}>
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
  const [activeTab, setActiveTab] = useState('info');
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

  const { vehicle, parts, maintenance_records, scheduled_maintenance, work_orders } = data;
  const tabs = [
    { id: 'info',     label: '📋 Datos',         count: null },
    { id: 'orders',   label: '🛠️ Atenciones',    count: work_orders.length },
    { id: 'parts',    label: '🔩 Repuestos',     count: parts.length },
    { id: 'maintenance', label: '📅 Mantenciones', count: maintenance_records.length },
    { id: 'scheduled', label: '⏰ Próximas',     count: scheduled_maintenance.filter(s => s.raw_status !== 'COMPLETED').length },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
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

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap',
        overflowX: 'auto', paddingBottom: 4,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: activeTab === t.id ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.05)',
            color: activeTab === t.id ? '#fff' : '#94a3b8',
            fontWeight: activeTab === t.id ? 600 : 400,
            fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}>
            {t.label}{t.count !== null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h3 style={{ color: '#60a5fa', marginBottom: '1.25rem', fontSize: '1.1rem' }}>
            📋 Datos del Vehículo
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
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

      {activeTab === 'orders' && (
        <div>
          {work_orders.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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

                    {/* Progress bar for active orders */}
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

                    {/* Items */}
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

      {activeTab === 'parts' && (
        <div>
          {parts.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Sin repuestos registrados.
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Parte', 'OEM', 'Marca', 'Categoría', 'Instalado', 'Km'].map(h => (
                        <th key={h} style={{
                          padding: '0.75rem 1rem', textAlign: 'left',
                          fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase',
                          letterSpacing: 1, fontWeight: 600,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={p.id} style={{
                        borderBottom: i < parts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 500, fontSize: '0.9rem' }}>{p.name}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8' }}>{p.oem_number}</td>
                        <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.brand || '—'}</td>
                        <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem' }}>{p.category}</td>
                        <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmtDate(p.installed_at)}</td>
                        <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {p.installed_mileage ? `${p.installed_mileage.toLocaleString('es-CL')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div>
          {maintenance_records.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Sin mantenciones registradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {maintenance_records.map(r => (
                <div key={r.id} className="glass-card" style={{
                  padding: '1.25rem', borderLeft: '4px solid #10b981',
                }}>
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
                    <div style={{
                      marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8',
                      padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 6,
                    }}>
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

      {activeTab === 'scheduled' && (
        <div>
          {scheduled_maintenance.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Sin mantenciones programadas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {scheduled_maintenance.map(s => {
                const st = MAINT_STATUS[s.raw_status] || MAINT_STATUS.PENDING;
                return (
                  <div key={s.id} className="glass-card" style={{
                    padding: '1.25rem',
                    borderLeft: `4px solid ${st.color}`,
                    opacity: s.raw_status === 'COMPLETED' ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 600 }}>
                        {st.icon} {s.maintenance_type}
                      </span>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, color: st.color,
                        padding: '0.2rem 0.6rem', background: `${st.color}18`,
                        borderRadius: 12,
                      }}>{s.status}</span>
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

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

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
    let backendHost = import.meta.env.VITE_BACKEND_HOST || 'localhost:8000';
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
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '2rem', paddingBottom: '1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
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
        <button
          onClick={onLogout}
          className="btn btn-outline"
          style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444', fontSize: '0.85rem' }}
        >
          Cerrar Sesión
        </button>
      </div>

      {showInstallBanner && (
        <div className="glass-card" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
          border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12,
        }}>
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
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
  const [clientName, setClientName] = useState(sessionStorage.getItem('clientName') || '');

  const handleLogin = (data) => {
    setAuthenticated(true);
    setClientName(data.client_name);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('clientToken');
    sessionStorage.removeItem('clientName');
    setAuthenticated(false);
    setClientName('');
  };

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <ClientDashboard clientName={clientName} onLogout={handleLogout} />;
};

export default ClientPortal;
