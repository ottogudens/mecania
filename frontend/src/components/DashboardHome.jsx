import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';

const DashboardHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchMaintenanceAlerts();
  }, []);

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
      
      {/* Ventas Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas del Día</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(stats.sales.day)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Hoy</span>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #eab308', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas de la Semana</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(stats.sales.week)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#eab308' }}>Últimos 7 días</span>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #ffffff', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas del Mes</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0 }}>
            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(stats.sales.month)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#a3a3a3' }}>Mes en curso</span>
        </div>
      </div>

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

      {/* Gráficos Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
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
