import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import WorkOrderList from './components/WorkOrderList';
import VisualInspection from './components/VisualInspection';
import ClientPortal from './components/ClientPortal';
import Login from './components/Login';
import Settings from './components/Settings';

import InventoryDashboard from './components/InventoryDashboard';
import FinanceDashboard from './components/FinanceDashboard';
import ClientList from './components/ClientList';

const AdminLayout = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('orders');
  
  return (
    <div className="app-container">
      <header className="header">
        <h1>MecanIA</h1>
        <div className="nav-links">
          <button 
            className={`btn ${activeTab === 'orders' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('orders')}
          >
            📋 Órdenes
          </button>
          <button 
            className={`btn ${activeTab === 'inspection' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('inspection')}
          >
            🔍 Inspección
          </button>
          <button 
            className={`btn ${activeTab === 'inventory' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('inventory')}
          >
            📦 Inventario
          </button>
          <button 
            className={`btn ${activeTab === 'clients' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('clients')}
          >
            👥 Clientes
          </button>
          <button 
            className={`btn ${activeTab === 'finance' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('finance')}
          >
            💰 Finanzas
          </button>
          <button 
            className={`btn ${activeTab === 'settings' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Config
          </button>
          <Link to="/client" className="client-link">Vista Cliente</Link>
          <button 
            className="btn btn-outline logout-btn" 
            onClick={onLogout}
          >
            Cerrar Sesión
          </button>
        </div>
      </header>
      <main>
        {activeTab === 'orders' && <WorkOrderList />}
        {activeTab === 'inspection' && <VisualInspection />}
        {activeTab === 'inventory' && <InventoryDashboard />}
        {activeTab === 'clients' && <ClientList />}
        {activeTab === 'finance' && <FinanceDashboard />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};

const ClientLayout = () => {
  return (
    <div className="app-container">
      <header className="header">
        <h1>Cliente AutoMaster</h1>
        <Link to="/" style={{ color: 'var(--primary-color)' }}>Cambiar a Administrador</Link>
      </header>
      <main>
        <ClientPortal />
      </main>
    </div>
  );
};

axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [authRole, setAuthRole] = useState(localStorage.getItem('role') || null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('token') || null);

  useEffect(() => {
    if (authToken) {
      axios.defaults.headers.common['Authorization'] = `Token ${authToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [authToken]);

  const handleLogin = (role, token) => {
    setAuthRole(role);
    setAuthToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    setAuthRole(null);
    setAuthToken(null);
  };

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={authRole ? <AdminLayout onLogout={handleLogout} /> : <Login onLogin={handleLogin} />} 
        />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/client" element={<ClientLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
