import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import WorkOrderList from './components/WorkOrderList';
import VisualInspection from './components/VisualInspection';
import ClientPortal from './components/ClientPortal';

import InventoryDashboard from './components/InventoryDashboard';
import FinanceDashboard from './components/FinanceDashboard';

const AdminLayout = () => {
  const [activeTab, setActiveTab] = useState('orders');
  
  return (
    <div className="app-container">
      <header className="header">
        <h1>Administrador AutoMaster</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            className={`btn ${activeTab === 'orders' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('orders')}
          >
            Órdenes
          </button>
          <button 
            className={`btn ${activeTab === 'inspection' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('inspection')}
          >
            Inspección
          </button>
          <button 
            className={`btn ${activeTab === 'inventory' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('inventory')}
          >
            📦 Inventario
          </button>
          <button 
            className={`btn ${activeTab === 'finance' ? '' : 'btn-outline'}`}
            onClick={() => setActiveTab('finance')}
          >
            💰 Finanzas
          </button>
          <Link to="/client" style={{ marginLeft: '2rem', color: 'var(--primary-color)' }}>Vista Cliente</Link>
        </div>
      </header>
      <main>
        {activeTab === 'orders' && <WorkOrderList />}
        {activeTab === 'inspection' && <VisualInspection />}
        {activeTab === 'inventory' && <InventoryDashboard />}
        {activeTab === 'finance' && <FinanceDashboard />}
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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AdminLayout />} />
        <Route path="/client" element={<ClientLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
