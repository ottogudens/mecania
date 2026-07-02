import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useToast } from './Toast';

const authHeader = () => ({ Authorization: `Token ${localStorage.getItem('token')}` });

const MobileScanner = () => {
  const [scanning, setScanning] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Form de edición/actualización de stock
  const [stockChange, setStockChange] = useState('');
  const [operationType, setOperationType] = useState('add'); // 'add' o 'set'
  
  // Form de creación rápida
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    price: '',
    cost_price: '',
    category: '',
    supplier: '',
    stock_quantity: '0',
    low_stock_threshold: '5'
  });

  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (scanning) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => stopScanner();
  }, [scanning]);

  const startScanner = () => {
    // Evitar duplicaciones
    if (scannerInstanceRef.current) return;

    // Crear instancia del scanner
    const scanner = new Html5QrcodeScanner(
      "qr-reader", 
      { 
        fps: 10, 
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.777778
      },
      /* verbose= */ false
    );

    scanner.render(onScanSuccess, onScanFailure);
    scannerInstanceRef.current = scanner;
  };

  const stopScanner = () => {
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.clear().catch(err => {
        console.error("Failed to clear scanner", err);
      });
      scannerInstanceRef.current = null;
    }
  };

  const onScanSuccess = (decodedText) => {
    // Detener escaneo e iniciar búsqueda
    setScanning(false);
    setBarcode(decodedText);
    searchProduct(decodedText);
    
    // Feedback táctil/sonoro rápido si el navegador lo soporta
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  };

  const onScanFailure = (error) => {
    // html5-qrcode genera muchos warnings por frames donde no encuentra códigos,
    // usualmente se pueden ignorar silenciosamente.
  };

  const searchProduct = async (code) => {
    try {
      const res = await axios.get(`/api/inventory/products/?barcode=${code}`, { headers: authHeader() });
      const results = res.data.results || res.data;
      if (results && results.length > 0) {
        setProduct(results[0]);
        setNotFound(false);
        setStockChange('');
        setOperationType('add');
      } else {
        setProduct(null);
        setNotFound(true);
        // Pre-llenar datos para la creación
        setNewProduct({
          name: '',
          sku: '',
          price: '',
          cost_price: '',
          category: '',
          supplier: '',
          stock_quantity: '0',
          low_stock_threshold: '5'
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'Error al buscar el producto.', type: 'error' });
    }
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setScanning(false);
    setBarcode(manualCode.trim());
    searchProduct(manualCode.trim());
  };

  const handleUpdateStock = async (e) => {
    e.preventDefault();
    if (!stockChange || isNaN(stockChange)) {
      toast({ title: 'Error', message: 'Ingresa un valor numérico válido.', type: 'error' });
      return;
    }

    const value = parseFloat(stockChange);
    let newQuantity = product.stock_quantity;

    if (operationType === 'add') {
      newQuantity += value;
    } else {
      newQuantity = value;
    }

    if (newQuantity < 0) {
      toast({ title: 'Error', message: 'El stock no puede ser menor a cero.', type: 'error' });
      return;
    }

    try {
      const res = await axios.patch(`/api/inventory/products/${product.id}/`, {
        stock_quantity: newQuantity
      }, { headers: authHeader() });

      toast({ title: 'Stock Actualizado', message: `Stock modificado correctamente a: ${res.data.stock_quantity}`, type: 'success' });
      setProduct(res.data);
      setStockChange('');
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo actualizar el stock.', type: 'error' });
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newProduct,
        barcode: barcode,
        price: parseFloat(newProduct.price),
        cost_price: parseFloat(newProduct.cost_price || 0),
        stock_quantity: parseInt(newProduct.stock_quantity || 0),
        low_stock_threshold: parseInt(newProduct.low_stock_threshold || 5)
      };

      const res = await axios.post('/api/inventory/products/', payload, { headers: authHeader() });
      toast({ title: 'Producto Creado', message: 'Producto agregado al inventario exitosamente.', type: 'success' });
      setProduct(res.data);
      setNotFound(false);
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.sku ? 'El SKU ya está en uso.' : 'No se pudo crear el producto.';
      toast({ title: 'Error', message: errorMsg, type: 'error' });
    }
  };

  const handleReset = () => {
    setProduct(null);
    setNotFound(false);
    setBarcode('');
    setManualCode('');
    setScanning(true);
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {scanning && (
        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>📷 Escanear Código de Barras</h3>
          
          <div id="qr-reader" style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)', marginBottom: '1rem' }}></div>
          
          <div style={{ margin: '1rem 0', color: 'var(--text-muted)' }}>— o escribe el código manualmente —</div>

          <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Código de barras"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-outline">Buscar</button>
          </form>
        </div>
      )}

      {/* PRODUCTO ENCONTRADO */}
      {!scanning && product && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>📦 Producto Encontrado</h3>
            <button className="btn btn-ghost btn-sm" onClick={handleReset}>Escanear Otro</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            <div><strong>Nombre:</strong> {product.name}</div>
            <div><strong>SKU:</strong> {product.sku}</div>
            {product.category && <div><strong>Categoría:</strong> {product.category}</div>}
            <div><strong>Código de Barras:</strong> {barcode}</div>
            <div><strong>Precio Venta:</strong> {fmtCLP(product.price)}</div>
            <div style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>
              <strong>Stock Actual:</strong> <span className={`badge ${product.stock_quantity <= product.low_stock_threshold ? 'red' : 'green'}`}>{product.stock_quantity} unidades</span>
            </div>
          </div>

          <form onSubmit={handleUpdateStock} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0 }}>Actualizar Stock</h4>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${operationType === 'add' ? 'btn-success' : 'btn-outline'}`}
                style={{ flex: 1, padding: '0.5rem' }}
                onClick={() => setOperationType('add')}
              >
                ➕ Ajustar (+/-)
              </button>
              <button
                type="button"
                className={`btn ${operationType === 'set' ? 'btn-success' : 'btn-outline'}`}
                style={{ flex: 1, padding: '0.5rem' }}
                onClick={() => setOperationType('set')}
              >
                🎯 Establecer Fijo
              </button>
            </div>

            <div className="input-group">
              <label className="input-label">Monto del ajuste (ej: 5 o -2)</label>
              <input
                type="number"
                className="input-field"
                placeholder={operationType === 'add' ? 'Ej: 10 o -5' : 'Ej: 25'}
                value={stockChange}
                onChange={e => setStockChange(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-success" style={{ width: '100%' }}>
              💾 Guardar Stock
            </button>
          </form>
        </div>
      )}

      {/* PRODUCTO NO ENCONTRADO - CREACIÓN RÁPIDA */}
      {!scanning && notFound && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, color: 'var(--status-yellow)' }}>⚠️ Producto No Registrado</h3>
            <button className="btn btn-ghost btn-sm" onClick={handleReset}>Volver</button>
          </div>
          
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            El código <strong>{barcode}</strong> no está asignado a ningún producto. Complétalos a continuación para crearlo de inmediato:
          </p>

          <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                placeholder="Ej: ACE-AUSTER"
                value={newProduct.sku}
                onChange={e => setNewProduct({...newProduct, sku: e.target.value})}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Categoría</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej: Aceites, Filtros"
                value={newProduct.category}
                onChange={e => setNewProduct({...newProduct, category: e.target.value})}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="input-group">
                <label className="input-label">Costo Neto ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={newProduct.cost_price}
                  onChange={e => setNewProduct({...newProduct, cost_price: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Precio Venta ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={newProduct.price}
                  onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="input-group">
                <label className="input-label">Stock Inicial</label>
                <input
                  type="number"
                  className="input-field"
                  value={newProduct.stock_quantity}
                  onChange={e => setNewProduct({...newProduct, stock_quantity: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Umbral Stock Bajo</label>
                <input
                  type="number"
                  className="input-field"
                  value={newProduct.low_stock_threshold}
                  onChange={e => setNewProduct({...newProduct, low_stock_threshold: e.target.value})}
                />
              </div>
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

            <button type="submit" className="btn btn-success" style={{ marginTop: '0.75rem' }}>
              💾 Crear y Registrar Producto
            </button>
          </form>
        </div>
      )}

    </div>
  );
};

const fmtCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0);

export default MobileScanner;
