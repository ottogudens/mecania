import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';

const DashboardHome = ({ onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState([]);
  const [paymentAlerts, setPaymentAlerts] = useState([]);
  const [waStatus, setWaStatus] = useState('loading');
  const [recentChats, setRecentChats] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchMaintenanceAlerts();
    fetchPaymentAlerts();
    fetchWhatsAppStatus();
    fetchRecentChats();
  }, []);

  useEffect(() => {
    // Play sound if any recent chat is waiting for a human
    if (recentChats.some(chat => chat.is_bot_silenced)) {
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.warn("Audio autoplay prevented", e));
      } catch (err) {}
    }
  }, [recentChats]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/dashboard-stats/', {
        headers: { Authorization: `Token ${token}` }
      });
      setStats(response.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar las estadísticas del dashboard.");
      setLoading(false);
    }
  };

  const fetchMaintenanceAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/maintenance-alerts/', {
        headers: { Authorization: `Token ${token}` }
      });
      setMaintenanceAlerts(response.data || []);
    } catch (err) {
      console.error('Error fetching maintenance alerts:', err);
    }
  };

  const fetchPaymentAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/finance/supplier-payments/alerts/', {
        headers: { Authorization: `Token ${token}` }
      });
      setPaymentAlerts(response.data || []);
    } catch (err) {
      console.error('Error fetching payment alerts:', err);
    }
  };

  const fetchWhatsAppStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/whatsapp/status/', {
        headers: { Authorization: `Token ${token}` }
      });
      setWaStatus(response.data.status);
    } catch (err) {
      console.error("Error connecting to WhatsApp status proxy:", err);
      setWaStatus('error');
    }
  };

  const fetchRecentChats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/whatsapp-messages/chats/', {
        headers: { Authorization: `Token ${token}` }
      });
      setRecentChats(response.data.slice(0, 5));
    } catch (err) {
      console.error('Error fetching recent chats:', err);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Panel de Control...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;
  if (!stats) return null;

  // Format OT status for Recharts
  const statusTranslations = {
    PENDING: 'Pendientes',
    IN_PROGRESS: 'En Progreso',
    COMPLETED: 'Completadas',
    DELIVERED: 'Entregadas',
    CANCELLED: 'Canceladas'
  };

  const otChartData = Object.keys(stats.ot_status).map(key => ({
    name: statusTranslations[key] || key,
    Cantidad: stats.ot_status[key]
  }));

  // Format most visited vehicles
  const vehicleChartData = stats.most_visited_vehicles.map(v => ({
    name: `${v.make} ${v.model}`,
    Visitas: v.visits
  }));

  // Format most sold products/services
  const itemChartData = stats.most_sold_items.map(item => ({
    name: item.description.substring(0, 20),
    Vendidos: item.quantity
  }));

  // Theme Colors
  const COLORS = ['#ef4444', '#eab308', '#ffffff', '#3b82f6', '#10b981'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Quick Actions / Accesos Rápidos */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button 
          className="glass-card interactive" 
          onClick={() => onNavigate && onNavigate('pos')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: 'var(--space-4) var(--space-5)', 
            cursor: 'pointer',
            borderLeft: '4px solid var(--primary)',
            background: 'linear-gradient(45deg, rgba(239, 68, 68, 0.05) 0%, rgba(20, 20, 20, 0) 100%)'
          }}
        >
          <div style={{ 
            width: '40px', height: '40px', borderRadius: '50%', 
            background: 'rgba(239, 68, 68, 0.15)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Punto de Venta (POS)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Abrir caja y venta de mesón</span>
          </div>
        </button>
      </div>

      {/* Ventas Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas del Día</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(stats.sales.day)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Hoy</span>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #eab308', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas de la Semana</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(stats.sales.week)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#eab308' }}>Últimos 7 días</span>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #ffffff', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas del Mes</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(stats.sales.month)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#a3a3a3' }}>Mes en curso</span>
        </div>

        {/* WhatsApp Status Widget */}
        <div className="glass-card" style={{ borderLeft: `4px solid ${waStatus === 'connected' ? '#10b981' : '#ef4444'}`, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado de WhatsApp</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <i className="fa-brands fa-whatsapp" style={{ fontSize: '2.5rem', color: waStatus === 'connected' ? '#10b981' : '#ef4444' }}></i>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: waStatus === 'connected' ? '#10b981' : '#ef4444' }}>
                {waStatus === 'connected' ? 'Conectado' : waStatus === 'loading' ? 'Cargando...' : 'Desconectado'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {waStatus === 'connected' ? 'Servicio activo respondiendo clientes.' : 'Atención automática detenida.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Supplier Payment Alerts Widget */}
      {paymentAlerts.length > 0 && (
        <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.03)' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚠️ Vencimientos de Cheques / Proveedores (Próximos 2 días)
            <span className="badge red" style={{ fontSize: '0.75rem' }}>{paymentAlerts.length}</span>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {paymentAlerts.map(alert => (
              <div key={alert.id} style={{
                padding: '0.8rem',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                borderRadius: '8px',
                borderLeft: '3px solid #ef4444',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>
                    💸 {alert.supplier_name} — Factura N° {alert.invoice_number}
                  </strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    — {alert.document_type} N° {alert.document_number || 'S/N'}
                  </span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Monto Documentado: <strong>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(alert.amount)}</strong>
                    <span style={{ marginLeft: '1rem', color: '#ef4444', fontWeight: 'bold' }}>
                      Cobro: {alert.payment_date} ({alert.days_remaining === 0 ? 'HOY' : alert.days_remaining === 1 ? 'Mañana' : `en ${alert.days_remaining} días`})
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance Alerts Widget */}
      {maintenanceAlerts.length > 0 && (
        <div className="glass-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔔 Próximas Mantenciones
            <span className="badge red" style={{ fontSize: '0.75rem' }}>{maintenanceAlerts.length}</span>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {maintenanceAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} style={{
                padding: '0.8rem',
                backgroundColor: alert.status === 'OVERDUE' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.05)',
                borderRadius: '8px',
                borderLeft: `3px solid ${alert.status === 'OVERDUE' ? '#ef4444' : '#f59e0b'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {alert.status === 'OVERDUE' ? '🔴' : '⏳'} {alert.maintenance_type_display}
                  </strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    — {alert.vehicle_make} {alert.vehicle_model} ({alert.vehicle_plate})
                  </span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {alert.description}
                    {alert.due_date && (
                      <span style={{ marginLeft: '0.5rem', fontWeight: '600', color: alert.days_remaining < 0 ? '#ef4444' : alert.days_remaining <= 7 ? '#f59e0b' : '#a3a3a3' }}>
                        ({alert.days_remaining < 0 ? `${Math.abs(alert.days_remaining)} días vencido` : `${alert.days_remaining} días restantes`})
                      </span>
                    )}
                  </p>
                  {alert.client_name && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>👤 {alert.client_name}</span>
                  )}
                </div>
              </div>
            ))}
            {maintenanceAlerts.length > 5 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                +{maintenanceAlerts.length - 5} más. Ve a Vehículos para gestionar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recent WhatsApp Chats Widget */}
      {recentChats.length > 0 && (
        <div className="glass-card" style={{ borderLeft: '4px solid #10b981' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-brands fa-whatsapp"></i> Últimos Chats de WhatsApp
            <span className="badge green" style={{ fontSize: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>{recentChats.length}</span>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {recentChats.map((chat, idx) => {
              const requiresAttention = chat.is_bot_silenced;
              return (
                <div 
                  key={idx} 
                  onClick={() => onNavigate && onNavigate('whatsapp_chat')}
                  style={{
                    padding: '0.8rem',
                    backgroundColor: requiresAttention ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.02)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${requiresAttention ? '#ef4444' : '#10b981'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    animation: requiresAttention ? 'pulse-border 2s infinite' : 'none'
                  }}
                  className="interactive"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
                    <strong style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📱 {chat.client_name && chat.client_name !== "Desconocido" ? `${chat.client_name} (${chat.phone})` : chat.phone}
                        {requiresAttention && (
                          <span style={{ fontSize: '0.65rem', backgroundColor: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                            ESPERANDO
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(chat.last_time).toLocaleString()}
                      </span>
                    </strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chat.last_message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gráficos Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(350px, 100%), 1fr))', gap: '1.5rem' }}>
        
        {/* OT Status Chart */}
        <div className="glass-card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff' }}>Estado Actual del Taller (OTs)</h4>
          <div style={{ flex: 1, minHeight: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={otChartData}>
                <XAxis dataKey="name" stroke="#a3a3a3" fontSize={12} />
                <YAxis stroke="#a3a3a3" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#ef4444', color: '#fff' }} />
                <Bar dataKey="Cantidad" fill="#ef4444">
                  {otChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Visited Vehicles Chart */}
        <div className="glass-card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff' }}>Marcas y Modelos más Frecuentes</h4>
          <div style={{ flex: 1, minHeight: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vehicleChartData} layout="vertical">
                <XAxis type="number" stroke="#a3a3a3" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#a3a3a3" fontSize={10} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#eab308', color: '#fff' }} />
                <Bar dataKey="Visitas" fill="#eab308" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Sold Items Pie Chart */}
        <div className="glass-card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ marginBottom: '1rem', color: '#ffffff' }}>Productos y Servicios más Vendidos</h4>
          <div style={{ flex: 1, minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {itemChartData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Sin datos de ventas disponibles</p>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="80%">
                  <PieChart>
                    <Pie
                      data={itemChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="Vendidos"
                    >
                      {itemChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#ffffff', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Custom Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', fontSize: '0.75rem', marginTop: '5px' }}>
                  {itemChartData.map((entry, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <div style={{ width: '8px', height: '8px', backgroundColor: COLORS[index % COLORS.length], borderRadius: '50%' }}></div>
                      <span style={{ color: '#a3a3a3' }}>{entry.name} ({entry.Vendidos})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default DashboardHome;
