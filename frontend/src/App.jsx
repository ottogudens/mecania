import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

import WorkOrderList from './components/WorkOrderList';
import VisualInspection from './components/VisualInspection';
import ClientPortal from './components/ClientPortal';
import Login from './components/Login';
import Settings from './components/Settings';
import InventoryDashboard from './components/InventoryDashboard';
import FinanceDashboard from './components/FinanceDashboard';
import ClientList from './components/ClientList';
import VehicleList from './components/VehicleList';
import POSDashboard from './components/POSDashboard';
import CashRegister from './components/CashRegister';
import EstimatesDashboard from './components/EstimatesDashboard';
import DashboardHome from './components/DashboardHome';
import UserManager from './components/UserManager';
import MechanicPortal from './components/MechanicPortal';
import MobileScanner from './components/MobileScanner';
import { ToastProvider } from './components/Toast';
import WhatsAppChat from './components/WhatsAppChat';
import CashMovements from './components/CashMovements';
import SuppliersManager from './components/SuppliersManager';
import SupplierInvoicesList from './components/SupplierInvoicesList';

/* ── Icons (inline SVG, no extra dep) ── */
const Icon = ({ path, size = 18, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d={path} />
  </svg>
);

const ICONS = {
  orders:     'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4',
  inspection: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  inventory:  'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  clients:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 0-3 3m0 0-3-3m3 3V8',
  finance:    'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  pos:        'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  history:    'M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
  settings:   'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  logout:     'M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1',
  menu:       'M4 6h16M4 12h16M4 18h16',
  car:        'M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2M14 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  users:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 0-3 3m0 0-3-3m3 3V8',
  scan:       'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  chat:       'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'
};

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Inicio / Panel',      icon: 'history' },
  { id: 'orders',     label: 'Órdenes de Trabajo', icon: 'orders' },
  { id: 'inspection', label: 'Inspección Visual',   icon: 'inspection' },
  { id: 'inventory',  label: 'Inventario',          icon: 'inventory' },
  { id: 'scan',       label: 'Escanear Stock',      icon: 'scan' },
  { id: 'clients',    label: 'Clientes',            icon: 'clients' },
  { id: 'vehicles',   label: 'Vehículos',           icon: 'car' },
  { id: 'whatsapp_chat', label: 'Chat de WhatsApp', icon: 'chat' },
  
  // Finance Submodule IDs
  { id: 'finance_billing', label: 'Clientes y Facturación', icon: 'finance' },
  { id: 'finance_cash_register', label: 'Control de Caja', icon: 'history' },
  { id: 'finance_cash_movements', label: 'Movimientos de Caja', icon: 'pos' },
  { id: 'finance_suppliers', label: 'Proveedores del Taller', icon: 'users' },
  { id: 'finance_supplier_invoices', label: 'Facturas y Programador de Pagos', icon: 'orders' },

  { id: 'pos',        label: 'Punto de Venta',      icon: 'pos' },
  { id: 'estimates',  label: 'Presupuestos',        icon: 'orders' },
  { id: 'settings',   label: 'Configuración',     icon: 'settings' },
  { id: 'users',      label: 'Usuarios',          icon: 'users' },
];

const PAGE_TITLES = {
  dashboard:  { title: 'Panel de Control',    subtitle: 'Resumen e indicadores clave del taller' },
  orders:     { title: 'Órdenes de Trabajo',  subtitle: 'Gestión digital de OTs en tiempo real' },
  inspection: { title: 'Inspección Visual',   subtitle: 'Registro fotográfico de hallazgos' },
  inventory:  { title: 'Inventario',          subtitle: 'Control de stock y productos' },
  scan:       { title: 'Escanear Stock',      subtitle: 'Busca, edita o actualiza el stock con tu cámara móvil' },
  clients:    { title: 'Clientes',            subtitle: 'Directorio y contacto de clientes' },
  vehicles:   { title: 'Vehículos',           subtitle: 'Ficha técnica e historial clínico de vehículos' },
  whatsapp_chat: { title: 'Chat de WhatsApp', subtitle: 'Atención al cliente y control del asistente de IA' },
  finance_billing: { title: 'Clientes y Facturación', subtitle: 'Boletas, facturas y pagos del taller' },
  finance_cash_register: { title: 'Control de Caja (Turnos)', subtitle: 'Aperturas, cierres y reportes X/Z de caja' },
  finance_cash_movements: { title: 'Movimientos de Caja', subtitle: 'Registro manual de ingresos y egresos de caja' },
  finance_suppliers: { title: 'Proveedores', subtitle: 'Catálogo de proveedores y datos de contacto' },
  finance_supplier_invoices: { title: 'Facturas de Compra y Programador', subtitle: 'Carga inteligente DTE/PDF e historial de pagos' },
  pos:        { title: 'Punto de Venta',      subtitle: 'Caja rápida y venta directa de repuestos' },
  estimates:  { title: 'Presupuestos',        subtitle: 'Cotizaciones y pre-aprobaciones' },
  settings:   { title: 'Configuración',       subtitle: 'Ajustes del taller e integraciones' },
  users:      { title: 'Usuarios del Sistema', subtitle: 'Administración de accesos y roles' },
};

/* ── Gear SVG Logo ── */
function GearLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

/* ── Sidebar ── */
function Sidebar({ activeTab, setActiveTab, onLogout, username, sidebarOpen, closeSidebar, logoUrl }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : 'U';
  const [financeOpen, setFinanceOpen] = useState(true);

  return (
    <>
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: '40px', maxHeight: '40px', objectFit: 'contain', borderRadius: '4px' }} />
            ) : (
              <GearLogo />
            )}
          </div>
          <div className="sidebar-logo-text">
            <strong>MecanIA</strong>
            <span>Taller Inteligente</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Principal</div>
          {NAV_ITEMS.slice(0, 8).map(item => (
            <button
              key={item.id}
              data-key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.id); closeSidebar(); }}
            >
              <span className="nav-icon">
                <Icon path={ICONS[item.icon]} />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}

          <div className="nav-section-label" style={{ marginTop: '0.5rem' }}>Finanzas</div>
          <button
            type="button"
            className={`nav-item ${activeTab.startsWith('finance_') ? 'active' : ''}`}
            onClick={() => setFinanceOpen(prev => !prev)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', textAlign: 'left' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="nav-icon">
                <Icon path={ICONS.finance} />
              </span>
              <span className="nav-label" style={{ fontWeight: 600 }}>Finanzas</span>
            </span>
            <span style={{ fontSize: '0.75rem', paddingRight: '4px' }}>{financeOpen ? '▼' : '►'}</span>
          </button>

          {financeOpen && (
            <div className="sidebar-submenu" style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '1.25rem', borderLeft: '1px solid var(--border-color)', marginLeft: '1rem', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
              {NAV_ITEMS.slice(8, 13).map(item => (
                <button
                  key={item.id}
                  data-key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => { setActiveTab(item.id); closeSidebar(); }}
                  style={{ height: '36px', fontSize: '0.85rem' }}
                >
                  <span className="nav-icon" style={{ transform: 'scale(0.8)' }}>
                    <Icon path={ICONS[item.icon]} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="nav-section-label" style={{ marginTop: '0.5rem' }}>Ventas y Sistema</div>
          {NAV_ITEMS.slice(13).map(item => (
            <button
              key={item.id}
              data-key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.id); closeSidebar(); }}
            >
              <span className="nav-icon">
                <Icon path={ICONS[item.icon]} />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}

          <div style={{ height: '1rem' }} />
          <Link
            to="/client"
            className="nav-item"
            style={{ textDecoration: 'none' }}
            onClick={closeSidebar}
          >
            <span className="nav-icon">
              <Icon path={ICONS.car} />
            </span>
            <span className="nav-label">Portal Cliente ↗</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{username || 'Administrador'}</div>
              <div className="sidebar-user-role">MecanIA Admin</div>
            </div>
          </div>
          <button
            className="nav-item"
            onClick={onLogout}
            style={{ color: 'var(--status-red)', borderColor: 'transparent' }}
          >
            <span className="nav-icon" style={{ color: 'var(--status-red)' }}>
              <Icon path={ICONS.logout} />
            </span>
            <span className="nav-label">Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Admin Layout ── */
function AdminLayout({ onLogout, username, logoUrl, onSettingsUpdate }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const pageInfo = PAGE_TITLES[activeTab] || { title: '', subtitle: '' };

  const PANELS = {
    finance_billing: <FinanceDashboard />,
    finance_cash_register: <CashRegister />,
    finance_cash_movements: <CashMovements />,
    finance_suppliers: <SuppliersManager />,
    finance_supplier_invoices: <SupplierInvoicesList />,

    finance:    <FinanceDashboard />,
    pos:        <POSDashboard onNavigate={setActiveTab} />,
    history:    <CashRegister />,
    estimates:  <EstimatesDashboard />,
    settings:   <Settings onSettingsUpdate={onSettingsUpdate} />,
    users:      <UserManager />,
  };

  return (
    <>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        username={username}
        sidebarOpen={sidebarOpen}
        closeSidebar={closeSidebar}
        logoUrl={logoUrl}
      />
      <div className="main-wrapper">
        {/* Mobile top bar */}
        <div className="mobile-topbar">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Abrir menú"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="mobile-logo">MecanIA</span>
        </div>

        {/* Desktop page header */}
        <header className="page-header" style={{ display: 'none' }}
          ref={el => { if (el) el.style.display = 'flex'; }}>
          <div>
            <div className="page-title">{pageInfo.title}</div>
            <div className="page-subtitle">{pageInfo.subtitle}</div>
          </div>
        </header>

        <main className="page-content animate-fade-in">
          {PANELS[activeTab]}
        </main>
      </div>
    </>
  );
}

/* ── Client Layout ── */
function ClientLayout() {
  return (
    <div className="main-wrapper" style={{ marginLeft: 0 }}>
      <header className="page-header">
        <div>
          <div className="page-title">Portal de Clientes</div>
          <div className="page-subtitle">Monitorea el estado de tu vehículo</div>
        </div>
        <Link to="/" className="btn btn-ghost btn-sm">← Volver al Taller</Link>
      </header>
      <main className="page-content">
        <ClientPortal />
      </main>
    </div>
  );
}

/* ── Axios Setup ── */
axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ── Root App ── */
function App() {
  const [authRole, setAuthRole]   = useState(localStorage.getItem('role') || null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername]   = useState(localStorage.getItem('username') || '');
  const [logoUrl, setLogoUrl]     = useState(null);

  const fetchLogo = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;
    try {
      const res = await axios.get('/api/operations/settings/', {
        headers: { Authorization: `Token ${currentToken}` }
      });
      if (res.data && res.data.logo) {
        setLogoUrl(res.data.logo);
      } else {
        setLogoUrl(null);
      }
    } catch (err) {
      console.error("Error loading logo:", err);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      axios.defaults.headers.common['Authorization'] = `Token ${authToken}`;
      fetchLogo();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setLogoUrl(null);
    }
  }, [authToken, fetchLogo]);

  const handleLogin = (role, token, user = '') => {
    setAuthRole(role);
    setAuthToken(token);
    setUsername(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setAuthRole(null);
    setAuthToken(null);
    setUsername('');
    setLogoUrl(null);
  };

  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              authRole
                ? authRole === 'admin'
                  ? <AdminLayout onLogout={handleLogout} username={username} logoUrl={logoUrl} onSettingsUpdate={fetchLogo} />
                  : <Navigate to="/mechanic" replace />
                : <Navigate to="/login" replace />
            }
          />
          <Route 
            path="/login" 
            element={
              authRole 
                ? authRole === 'admin' 
                  ? <Navigate to="/" replace /> 
                  : <Navigate to="/mechanic" replace />
                : <Login onLogin={handleLogin} />
            } 
          />
          <Route path="/client" element={<ClientLayout />} />
          <Route path="/mechanic" element={<MechanicPortal onLogout={() => {
            setAuthRole(localStorage.getItem('role'));
            setAuthToken(localStorage.getItem('token'));
            setUsername(localStorage.getItem('username') || '');
          }} />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
