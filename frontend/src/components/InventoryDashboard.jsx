import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const InventoryDashboard = () => {
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Product modal state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', barcode: '', price: '', cost_price: '', supplier: '', category: '', stock_quantity: 0, low_stock_threshold: 5 });
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);

  // Service modal state
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [isEditingService, setIsEditingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [newService, setNewService] = useState({
    name: '', category: '', price: '', description: '', is_active: true, is_bundle: false
  });
  const [bundleItems, setBundleItems] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [uploadingServices, setUploadingServices] = useState(false);
  const serviceFileInputRef = useRef(null);

  const toast = useToast();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Token ${token}` };
      const [productsRes, servicesRes, categoriesRes] = await Promise.all([
        axios.get('/api/inventory/products/', { headers }),
        axios.get('/api/inventory/services/?include_inactive=true', { headers }),
        axios.get('/api/inventory/service-categories/', { headers }),
      ]);
      setProducts(productsRes.data.results || productsRes.data);
      setServices(servicesRes.data.results || servicesRes.data);
      setCategories(categoriesRes.data.results || categoriesRes.data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar inventario.");
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/inventory/products/', {
        headers: { Authorization: `Token ${token}` }
      });
      setProducts(response.data.results || response.data);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Product Handlers ──

  const handleQuickAddStock = async (id) => {
    try {
      const product = products.find(p => p.id === id);
      const newQuantity = product.stock_quantity + 5;
      await axios.patch(`/api/inventory/products/${id}/`, { stock_quantity: newQuantity });
      setProducts(products.map(p => p.id === id ? { ...p, stock_quantity: newQuantity } : p));
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
      
      const { products_created, errors } = response.data;
      let msg = `Productos creados/actualizados: ${products_created}`;
      if (errors && errors.length > 0) {
        msg += `\n\nErrores:\n` + errors.join('\n');
      }
      toast({ title: 'Carga completada', message: msg, type: errors && errors.length ? 'warning' : 'success' });
      fetchAll();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error de Carga', message: 'Error al procesar el archivo Excel. Revisa el formato.', type: 'error' });
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const openEditProductModal = (product) => {
    setIsEditing(true);
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      price: product.price,
      cost_price: product.cost_price || '',
      supplier: product.supplier || '',
      category: product.category || '',
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold || 5,
    });
    setImageFile(null);
    setShowModal(true);
  };

  const openNewProductModal = () => {
    setIsEditing(false);
    setEditingProductId(null);
    setNewProduct({ name: '', sku: '', barcode: '', price: '', cost_price: '', supplier: '', category: '', stock_quantity: 0, low_stock_threshold: 5 });
    setImageFile(null);
    setShowModal(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      Object.keys(newProduct).forEach(key => formData.append(key, newProduct[key]));
      if (imageFile) {
        formData.append('image', imageFile);
      }
      
      if (isEditing && editingProductId) {
        await axios.patch(`/api/inventory/products/${editingProductId}/`, formData, {
          headers: { 
            Authorization: `Token ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        toast({ title: 'Producto Actualizado', message: 'Los cambios se guardaron exitosamente.', type: 'success' });
      } else {
        await axios.post('/api/inventory/products/', formData, {
          headers: { 
            Authorization: `Token ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        toast({ title: 'Producto Creado', message: 'El producto se agregó al inventario exitosamente.', type: 'success' });
      }
      
      setShowModal(false);
      setNewProduct({ name: '', sku: '', barcode: '', price: '', cost_price: '', supplier: '', category: '', stock_quantity: 0, low_stock_threshold: 5 });
      setImageFile(null);
      setIsEditing(false);
      setEditingProductId(null);
      fetchProducts();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.sku ? 'Ya existe un producto con ese SKU.' : 'No se pudo guardar el producto.';
      toast({ title: 'Error', message: msg, type: 'error' });
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este producto?')) return;
    try {
      await axios.delete(`/api/inventory/products/${id}/`);
      toast({ title: 'Eliminado', message: 'Producto eliminado correctamente.', type: 'success' });
      fetchProducts();
    } catch (err) {
      toast({ title: 'Error', message: 'No se pudo eliminar. Puede estar asociado a una OT.', type: 'error' });
    }
  };

  // ── Service Handlers ──

  const handleDownloadServiceTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/inventory/services/download_service_template/', {
        headers: { Authorization: `Token ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_servicios.xlsx');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      toast({ title: 'Error', message: 'Error al descargar la plantilla de servicios.', type: 'error' });
    }
  };

  const handleServiceFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploadingServices(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/inventory/services/bulk_upload_services/', formData, {
        headers: { 
          Authorization: `Token ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const { services_created, errors } = response.data;
      let msg = `Servicios creados/actualizados: ${services_created}`;
      if (errors && errors.length > 0) {
        msg += `\n\nErrores:\n` + errors.join('\n');
      }
      toast({ title: 'Carga completada', message: msg, type: errors && errors.length ? 'warning' : 'success' });
      fetchAll();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error de Carga', message: 'Error al procesar el archivo Excel. Revisa el formato.', type: 'error' });
    } finally {
      setUploadingServices(false);
      e.target.value = null;
    }
  };

  const openNewServiceModal = () => {
    setIsEditingService(false);
    setEditingServiceId(null);
    setNewService({ name: '', category: '', price: '', description: '', is_active: true, is_bundle: false });
    setBundleItems([]);
    setShowNewCategory(false);
    setNewCategoryName('');
    setShowServiceModal(true);
  };

  const openEditServiceModal = (service) => {
    setIsEditingService(true);
    setEditingServiceId(service.id);
    setNewService({
      name: service.name,
      category: service.category,
      price: service.price,
      description: service.description || '',
      is_active: service.is_active,
      is_bundle: service.is_bundle,
    });
    setBundleItems(
      (service.bundle_items || []).map(bi => ({
        product_id: bi.product,
        product_name: bi.product_name,
        product_price: bi.product_price,
        quantity: bi.quantity,
      }))
    );
    setShowNewCategory(false);
    setNewCategoryName('');
    setShowServiceModal(true);
  };

  const calculateBundlePrice = (items) => {
    return items.reduce((sum, item) => {
      const product = products.find(p => p.id === parseInt(item.product_id));
      const price = product ? parseFloat(product.price) : parseFloat(item.product_price || 0);
      return sum + (price * (item.quantity || 1));
    }, 0);
  };

  const addBundleItem = () => {
    setBundleItems([...bundleItems, { product_id: '', quantity: 1 }]);
  };

  const removeBundleItem = (index) => {
    setBundleItems(bundleItems.filter((_, i) => i !== index));
  };

  const updateBundleItem = (index, field, value) => {
    const updated = [...bundleItems];
    updated[index] = { ...updated[index], [field]: value };
    setBundleItems(updated);
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Token ${token}` };

      let categoryId = newService.category;

      // Create new category if needed
      if (showNewCategory && newCategoryName.trim()) {
        const catRes = await axios.post('/api/inventory/service-categories/', { name: newCategoryName.trim() }, { headers });
        categoryId = catRes.data.id;
        setCategories([...categories, catRes.data]);
      }

      if (!categoryId) {
        toast({ title: 'Error', message: 'Debes seleccionar o crear una categoría.', type: 'error' });
        return;
      }

      const price = newService.is_bundle ? calculateBundlePrice(bundleItems) : parseFloat(newService.price);

      const payload = {
        name: newService.name,
        category: categoryId,
        price: price,
        description: newService.description,
        is_active: newService.is_active,
        is_bundle: newService.is_bundle,
      };

      if (newService.is_bundle) {
        payload.bundle_items_data = bundleItems
          .filter(bi => bi.product_id)
          .map(bi => ({ product_id: parseInt(bi.product_id), quantity: parseInt(bi.quantity) || 1 }));
      }

      if (isEditingService && editingServiceId) {
        await axios.put(`/api/inventory/services/${editingServiceId}/`, payload, { headers });
        toast({ title: 'Servicio Actualizado', message: 'Los cambios se guardaron exitosamente.', type: 'success' });
      } else {
        await axios.post('/api/inventory/services/', payload, { headers });
        toast({ title: 'Servicio Creado', message: 'El servicio se agregó exitosamente.', type: 'success' });
      }

      setShowServiceModal(false);
      fetchAll();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo guardar el servicio.', type: 'error' });
    }
  };

  const handleToggleServiceActive = async (service) => {
    try {
      await axios.patch(`/api/inventory/services/${service.id}/`, { is_active: !service.is_active });
      toast({ title: 'Actualizado', message: `Servicio ${service.is_active ? 'desactivado' : 'activado'}.`, type: 'success' });
      fetchAll();
    } catch (err) {
      toast({ title: 'Error', message: 'No se pudo actualizar el servicio.', type: 'error' });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando inventario...</div>;

  const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  return (
    <div className="work-orders">
      {/* ── Tab Navigation ── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={() => setActiveTab('products')}
          style={{
            padding: '0.8rem 1.5rem',
            background: activeTab === 'products' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'products' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'products' ? 'var(--primary-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'products' ? '600' : '400',
            transition: 'all 0.2s ease',
          }}
        >
          📦 Productos
        </button>
        <button
          onClick={() => setActiveTab('services')}
          style={{
            padding: '0.8rem 1.5rem',
            background: activeTab === 'services' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'services' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'services' ? 'var(--primary-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'services' ? '600' : '400',
            transition: 'all 0.2s ease',
          }}
        >
          🛠️ Servicios
        </button>
      </div>

      {/* ═══════════════════ PRODUCTS TAB ═══════════════════ */}
      {activeTab === 'products' && (
        <>
          <div className="header" style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
            <h2>📦 Gestión de Inventario</h2>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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
              <button className="btn btn-outline" style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }} onClick={() => {
                // Dispara el clic del botón de navegación en la barra lateral con id 'scan'
                const scanBtn = document.querySelector('button.nav-item[key="scan"]') || Array.from(document.querySelectorAll('.sidebar button')).find(el => el.textContent.includes('Escanear Stock'));
                if (scanBtn) {
                  scanBtn.click();
                } else {
                  // Fallback
                  window.location.reload();
                }
              }}>
                📷 Escanear con Cámara
              </button>
              <button className="btn" onClick={openNewProductModal}>+ Añadir Producto</button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '0' }}>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '1rem' }}>SKU</th>
                  <th style={{ padding: '1rem' }}>Producto</th>
                  <th style={{ padding: '1rem' }}>Costo Neto</th>
                  <th style={{ padding: '1rem' }}>Precio Venta</th>
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
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{formatCLP(product.cost_price || 0)}</td>
                      <td style={{ padding: '1rem' }}>{formatCLP(product.price)}</td>
                      <td style={{ padding: '1rem' }}>
                        <span className={`badge ${isLowStock ? 'red' : 'green'}`} style={{ fontSize: '0.9rem' }}>
                          {product.stock_quantity} und.
                        </span>
                        {isLowStock && <span style={{ color: 'var(--status-red)', marginLeft: '10px', fontSize: '0.8rem' }}>⚠️ Stock Bajo</span>}
                      </td>
                      <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                          onClick={() => openEditProductModal(product)}
                        >
                          Editar
                        </button>
                        <button 
                          className="btn" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', backgroundColor: 'var(--primary-color)' }}
                          onClick={() => handleQuickAddStock(product.id)}
                        >
                          +5 Stock
                        </button>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderColor: 'var(--status-red)', color: 'var(--status-red)' }}
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════ SERVICES TAB ═══════════════════ */}
      {activeTab === 'services' && (
        <>
          <div className="header" style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
            <h2>🛠️ Catálogo de Servicios</h2>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={handleDownloadServiceTemplate}>
                📄 Descargar Plantilla
              </button>
              <input 
                type="file" 
                ref={serviceFileInputRef} 
                onChange={handleServiceFileUpload} 
                accept=".xls,.xlsx" 
                style={{ display: 'none' }} 
              />
              <button 
                className="btn btn-outline" 
                style={{ borderColor: 'var(--status-green)', color: 'var(--status-green)' }}
                onClick={() => serviceFileInputRef.current?.click()}
                disabled={uploadingServices}
              >
                {uploadingServices ? '⏳ Subiendo...' : '🔼 Carga Masiva (Excel)'}
              </button>
              <button className="btn" onClick={openNewServiceModal}>+ Nuevo Servicio</button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '0' }}>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '1rem' }}>Servicio</th>
                  <th style={{ padding: '1rem' }}>Categoría</th>
                  <th style={{ padding: '1rem' }}>Tipo</th>
                  <th style={{ padding: '1rem' }}>Precio</th>
                  <th style={{ padding: '1rem' }}>Estado</th>
                  <th style={{ padding: '1rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {services.map(service => (
                  <tr key={service.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: service.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{service.name}</td>
                    <td style={{ padding: '1rem' }}>{service.category_name}</td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`badge ${service.is_bundle ? 'blue' : 'green'}`} style={{ fontSize: '0.8rem' }}>
                        {service.is_bundle ? '📦 Combinado' : '🔧 Simple'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {formatCLP(service.is_bundle ? service.computed_bundle_price : service.price)}
                      {service.is_bundle && service.bundle_items?.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                          ({service.bundle_items.length} producto{service.bundle_items.length > 1 ? 's' : ''})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`badge ${service.is_active ? 'green' : 'red'}`} style={{ fontSize: '0.8rem' }}>
                        {service.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => openEditServiceModal(service)}
                      >
                        Editar
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ 
                          padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                          borderColor: service.is_active ? 'var(--status-red)' : 'var(--status-green)',
                          color: service.is_active ? 'var(--status-red)' : 'var(--status-green)',
                        }}
                        onClick={() => handleToggleServiceActive(service)}
                      >
                        {service.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {services.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No hay servicios registrados. Crea uno para empezar.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════ PRODUCT MODAL ═══════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                <label className="input-label">Categoría</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newProduct.category} 
                  onChange={e => setNewProduct({...newProduct, category: e.target.value})} 
                  placeholder="Ej: Aceites, Filtros, Frenos..."
                />
              </div>
              <div className="input-group">
                <label className="input-label">Imagen del Producto (Opcional)</label>
                <input 
                  type="file" 
                  className="input-field" 
                  accept="image/*"
                  onChange={e => setImageFile(e.target.files[0])} 
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
                  <label className="input-label">Código de Barras</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={newProduct.barcode} 
                    onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Proveedor</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={newProduct.supplier} 
                    onChange={e => setNewProduct({...newProduct, supplier: e.target.value})} 
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Costo Neto ($)</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={newProduct.cost_price} 
                    onChange={e => setNewProduct({...newProduct, cost_price: e.target.value})} 
                    min="0"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Precio Venta (IVA 19%)</label>
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
                  <label className="input-label">Stock Actual</label>
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

              <div className="input-group">
                <label className="input-label">Umbral Stock Bajo</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={newProduct.low_stock_threshold} 
                  onChange={e => setNewProduct({...newProduct, low_stock_threshold: e.target.value})} 
                  min="0"
                />
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">{isEditing ? 'Actualizar Producto' : 'Guardar Producto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════ SERVICE MODAL ═══════════════════ */}
      {showServiceModal && (
        <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{isEditingService ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
              <button className="modal-close" onClick={() => setShowServiceModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSaveService} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Nombre del Servicio *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newService.name} 
                  onChange={e => setNewService({...newService, name: e.target.value})} 
                  required 
                  placeholder="Ej: Cambio de aceite express"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Categoría *</label>
                {!showNewCategory ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select 
                      className="input-field" 
                      value={newService.category} 
                      onChange={e => setNewService({...newService, category: e.target.value})}
                      style={{ flex: 1, backgroundColor: 'var(--bg-card)' }}
                    >
                      <option value="">-- Seleccionar categoría --</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-outline" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }} onClick={() => setShowNewCategory(true)}>
                      + Nueva
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={newCategoryName} 
                      onChange={e => setNewCategoryName(e.target.value)} 
                      placeholder="Nombre de la nueva categoría"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn btn-outline" style={{ fontSize: '0.85rem' }} onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Bundle Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={newService.is_bundle} 
                    onChange={e => setNewService({...newService, is_bundle: e.target.checked})} 
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '500' }}>📦 Servicio Combinado (Bundle)</span>
                </label>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  El precio se calcula de los productos
                </span>
              </div>

              {/* Price field - disabled for bundles */}
              <div className="input-group">
                <label className="input-label">
                  Precio {newService.is_bundle ? '(Calculado automáticamente)' : '*'}
                </label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={newService.is_bundle ? calculateBundlePrice(bundleItems) : newService.price} 
                  onChange={e => setNewService({...newService, price: e.target.value})} 
                  required={!newService.is_bundle}
                  disabled={newService.is_bundle}
                  min="0"
                  style={{ 
                    backgroundColor: newService.is_bundle ? 'rgba(255,255,255,0.02)' : undefined,
                    opacity: newService.is_bundle ? 0.7 : 1,
                  }}
                />
              </div>

              {/* Bundle items */}
              {newService.is_bundle && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <label style={{ fontWeight: '600', fontSize: '0.9rem' }}>🧩 Productos del Bundle (Receta)</label>
                    <button type="button" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={addBundleItem}>
                      + Agregar Producto
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem', marginTop: 0 }}>
                    Define los productos que componen este servicio. Los productos específicos se seleccionan al agregar a una OT o venta.
                  </p>
                  
                  {bundleItems.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <select
                        className="input-field"
                        value={item.product_id}
                        onChange={e => updateBundleItem(index, 'product_id', e.target.value)}
                        style={{ flex: 3, backgroundColor: 'var(--bg-card)' }}
                      >
                        <option value="">-- Seleccionar producto --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} — {formatCLP(p.price)}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="input-field"
                        value={item.quantity}
                        onChange={e => updateBundleItem(index, 'quantity', e.target.value)}
                        min="1"
                        style={{ flex: 1 }}
                        placeholder="Cant."
                      />
                      <button type="button" onClick={() => removeBundleItem(index)} style={{ background: 'none', border: 'none', color: 'var(--status-red)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}>
                        ✕
                      </button>
                    </div>
                  ))}

                  {bundleItems.length > 0 && (
                    <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: '600', textAlign: 'right' }}>
                      Total Bundle: {formatCLP(calculateBundlePrice(bundleItems))}
                    </div>
                  )}
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Descripción</label>
                <textarea 
                  className="input-field" 
                  value={newService.description} 
                  onChange={e => setNewService({...newService, description: e.target.value})} 
                  rows="3"
                  placeholder="Descripción del servicio..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Active toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={newService.is_active} 
                  onChange={e => setNewService({...newService, is_active: e.target.checked})} 
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Servicio Activo (visible para uso)</span>
              </label>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowServiceModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">{isEditingService ? 'Actualizar Servicio' : 'Guardar Servicio'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;
