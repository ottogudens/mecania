import React, { useState, useEffect } from 'react';
import axios from 'axios';

const InventoryDashboard = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // In a real app, this would hit the backend API
      // const response = await axios.get('http://localhost:8000/api/inventory/products/');
      // setProducts(response.data);
      
      // Mock data for UI demonstration
      setProducts([
        { id: 1, sku: 'OIL-5W30', name: 'Aceite Motor Sintético 5W-30', price: '25.00', stock_quantity: 45, low_stock_threshold: 10 },
        { id: 2, sku: 'BRK-PAD-F', name: 'Pastillas de Freno Delanteras', price: '45.00', stock_quantity: 8, low_stock_threshold: 10 },
        { id: 3, sku: 'FLT-AIR', name: 'Filtro de Aire Universal', price: '12.50', stock_quantity: 2, low_stock_threshold: 5 },
      ]);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar inventario.");
      setLoading(false);
    }
  };

  const handleQuickAddStock = (id) => {
    // Optimistic UI update
    setProducts(products.map(p => 
      p.id === id ? { ...p, stock_quantity: p.stock_quantity + 5 } : p
    ));
    // Here we would do a PATCH/POST to the backend
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando inventario...</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>📦 Gestión de Inventario</h2>
        <button className="btn">Añadir Nuevo Producto</button>
      </div>

      <div className="glass-card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '1rem' }}>SKU</th>
              <th style={{ padding: '1rem' }}>Producto</th>
              <th style={{ padding: '1rem' }}>Precio Unit.</th>
              <th style={{ padding: '1rem' }}>Stock Actual</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const isLowStock = product.stock_quantity <= product.low_stock_threshold;
              return (
                <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{product.sku}</td>
                  <td style={{ padding: '1rem', fontWeight: '500' }}>{product.name}</td>
                  <td style={{ padding: '1rem' }}>${product.price}</td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`badge ${isLowStock ? 'red' : 'green'}`} style={{ fontSize: '0.9rem' }}>
                      {product.stock_quantity} und.
                    </span>
                    {isLowStock && <span style={{ color: 'var(--status-red)', marginLeft: '10px', fontSize: '0.8rem' }}>⚠️ Stock Bajo</span>}
                  </td>
                  <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Editar</button>
                    <button 
                      className="btn" 
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', backgroundColor: 'var(--primary-color)' }}
                      onClick={() => handleQuickAddStock(product.id)}
                    >
                      +5 Stock
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryDashboard;
