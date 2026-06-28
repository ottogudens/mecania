import React, { useState, useEffect } from 'react';
import axios from 'axios';

const WorkOrderList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/operations/work-orders/');
        setOrders(response.data);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching work orders:", err);
        setError("Error al cargar las órdenes de trabajo. ¿Está funcionando el servidor Django?");
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Órdenes de Trabajo...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>Órdenes de Trabajo Digitales (OT)</h2>
        <button className="btn">Crear Nueva OT</button>
      </div>
      
      {orders.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p>No se encontraron órdenes de trabajo. ¡Crea una para comenzar!</p>
        </div>
      ) : (
        <div className="grid-container">
          {orders.map(order => (
            <div key={order.id} className="glass-card">
              <div className="ot-header">
                <h3>{order.vehicle?.license_plate || 'N/A'}</h3>
                <span className={`badge ${order.status?.toLowerCase() || 'pending'}`}>
                  {order.status ? order.status.replace('_', ' ') : 'PENDIENTE'}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0', fontWeight: '500' }}>
                {order.vehicle?.make} {order.vehicle?.model}
              </p>
              
              <div className="ot-meta">
                <span>Kilometraje: {order.mileage?.toLocaleString()} km</span>
                <span>OT #{order.id}</span>
              </div>
              
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }}>Ver Detalles</button>
                <button className="btn" style={{ flex: 1 }}>Inspección</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkOrderList;
