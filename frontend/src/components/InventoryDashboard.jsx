import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const InventoryDashboard = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/inventory/products/', {
        headers: { Authorization: `Token ${token}` }
      });
      setProducts(response.data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar inventario.");
      setLoading(false);
    }
  };

  const handleQuickAddStock = async (id) => {
    try {
      const product = products.find(p => p.id === id);
      const newQuantity = product.stock_quantity + 5;
      
      // Update backend
      await axios.patch(`/api/inventory/products/${id}/`, {
        stock_quantity: newQuantity
      });

      // Optimistic UI update
      setProducts(products.map(p => 
        p.id === id ? { ...p, stock_quantity: newQuantity } : p
      ));
    } catch (err) {
      console.error("Error updating stock:", err);
      alert("Hubo un error al actualizar el stock.");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/inventory/products/download_template/', {
        headers: { Authorization: `Token ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_inventario.xlsx');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      alert("Error al descargar la plantilla.");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/inventory/products/bulk_upload/', formData, {
        headers: { 
          Authorization: `Token ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const { products_created, services_created, errors } = response.data;
      let msg = `Carga exitosa.\nProductos creados/actualizados: ${products_created}\nServicios creados/actualizados: ${services_created}`;
      if (errors && errors.length > 0) {
        msg += `\n\nErrores encontrados:\n` + errors.join('\n');
      }
      alert(msg);
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert("Error al procesar el archivo Excel. Revisa el formato.");
    } finally {
      setUploading(false);
      e.target.value = null; // reset input
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando inventario...</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <h2>📦 Gestión de Inventario</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleDownloadTemplate}>
            📄 Descargar Plantilla
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xls,.xlsx" 
            style={{ display: 'none' }} 
          />
          <button 
            className="btn btn-outline" 
            style={{ borderColor: 'var(--status-green)', color: 'var(--status-green)' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '⏳ Subiendo...' : '🔼 Carga Masiva (Excel)'}
          </button>
          <button className="btn">Añadir Nuevo Producto</button>
        </div>
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
