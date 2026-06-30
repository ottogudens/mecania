import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const InventoryDashboard = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', price: '', stock_quantity: 0, low_stock_threshold: 5 });
  const fileInputRef = useRef(null);
  const toast = useToast();

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
      toast({ title: 'Error', message: 'Hubo un error al actualizar el stock.', type: 'error' });
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
      toast({ title: 'Error', message: 'Error al descargar la plantilla.', type: 'error' });
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
      
      let msg = `Productos creados/actualizados: ${products_created}\nServicios creados/actualizados: ${services_created}`;
      if (errors && errors.length > 0) {
        msg += `\n\nErrores:\n` + errors.join('\n');
      }
      toast({ title: 'Carga completada', message: msg, type: errors && errors.length ? 'warning' : 'success' });
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error de Carga', message: 'Error al procesar el archivo Excel. Revisa el formato.', type: 'error' });
    } finally {
      setUploading(false);
      e.target.value = null; // reset input
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/inventory/products/', newProduct, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Producto Creado', message: 'El producto se agregó al inventario exitosamente.', type: 'success' });
      setShowModal(false);
      setNewProduct({ name: '', sku: '', price: '', stock_quantity: 0, low_stock_threshold: 5 });
      fetchProducts();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.sku ? 'Ya existe un producto con ese SKU.' : 'No se pudo crear el producto.';
      toast({ title: 'Error', message: msg, type: 'error' });
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
          <button className="btn" onClick={() => setShowModal(true)}>+ Añadir Producto</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0' }}>
        <div className="table-responsive">
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nuevo Producto</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Nombre del Producto</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newProduct.name} 
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                  required 
                />
              </div>
              <div className="input-group">
                <label className="input-label">SKU (Código Interno)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newProduct.sku} 
                  onChange={e => setNewProduct({...newProduct, sku: e.target.value})} 
                  required 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Precio Unitario ($)</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={newProduct.price} 
                    onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                    required 
                    min="0"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Stock Inicial</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={newProduct.stock_quantity} 
                    onChange={e => setNewProduct({...newProduct, stock_quantity: e.target.value})} 
                    required 
                    min="0"
                  />
                </div>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;
