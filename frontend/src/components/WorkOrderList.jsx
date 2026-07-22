import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const WorkOrderList = () => {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [clients, setClients] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Modals state
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrderData, setEditOrderData] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('work_order_view_mode') || 'grid');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Vehicle Form State
  const [showQuickVehicle, setShowQuickVehicle] = useState(false);
  const [quickVehicle, setQuickVehicle] = useState({
    license_plate: '',
    make: '',
    model: '',
    year: '',
    color: '',
    transmission_type: 'MANUAL',
    fuel_type: 'GASOLINE',
    vin: '',
    engine_number: '',
    engine_displacement: '',
    mileage: '',
    client_id: ''
  });

  // AI State
  const [aiSymptoms, setAiSymptoms] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Mechanic Findings State in Detail modal
  const [mechanicFinding, setMechanicFinding] = useState('');
  const [savingFinding, setSavingFinding] = useState(false);

  // Catálogo de servicios y productos para agregar a OT
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [itemSource, setItemSource] = useState('manual'); // 'manual' | 'service' | 'product'
  const [selectedCatalogItem, setSelectedCatalogItem] = useState(null);
  const [newOrder, setNewOrder] = useState({
    vehicle_id: '',
    mileage: '',
    fuel_level: 50,
    status: 'PENDING',
    visit_reason: '',
    desired_service: '',
    symptoms: ''
  });

  const [newItem, setNewItem] = useState({
    description: '',
    quantity: 1,
    unit_price: 0
  });

  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemData, setEditItemData] = useState({ description: '', quantity: 1, unit_price: 0 });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [detailFiles, setDetailFiles] = useState([]);

  useEffect(() => {
    fetchData();

    // WebSocket connection for real-time updates
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let backendHost = import.meta.env.VITE_BACKEND_HOST || (import.meta.env.DEV ? 'localhost:8080' : window.location.host);
    backendHost = backendHost.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}//${backendHost}/ws/work_orders/`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('Connected to WorkOrders WebSocket');
    };
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'work_order_updated') {
        console.log("WebSocket Update Received:", data.message);
        fetchData(); // Re-fetch the orders to get the latest changes
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    return () => {
      socket.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [ordersRes, vehiclesRes, clientsRes] = await Promise.all([
        axios.get('/api/operations/work-orders/', { headers: { Authorization: `Token ${token}` } }),
        axios.get('/api/operations/vehicles/', { headers: { Authorization: `Token ${token}` } }),
        axios.get('/api/operations/clients/', { headers: { Authorization: `Token ${token}` } })
      ]);
      const data = ordersRes.data.results || ordersRes.data;
      // Sort orders so PENDING and IN_PROGRESS are first
      const statusOrder = { 'PENDING': 1, 'IN_PROGRESS': 2, 'COMPLETED': 3, 'DELIVERED': 4, 'PAID': 5, 'CANCELLED': 6 };
      data.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
      
      setOrders(data);
      setVehicles(vehiclesRes.data.results || vehiclesRes.data);
      setClients(clientsRes.data.results || clientsRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar datos. ¿Está funcionando el servidor Django?");
      setLoading(false);
    }
  };

  const handleNotifyClient = async (orderId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/operations/work-orders/${orderId}/notify_client/`, {}, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: '¡Notificado!', message: 'Cliente notificado por WhatsApp con éxito.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo notificar. Verifica que el cliente tenga un número válido.', type: 'error' });
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/work-orders/', newOrder, {
        headers: { Authorization: `Token ${token}` }
      });
      const workOrderId = response.data.id;
      
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append('work_order', workOrderId);
          formData.append('file', file);
          formData.append('file_name', file.name);
          await axios.post('/api/operations/work-order-attachments/', formData, {
            headers: { 
              Authorization: `Token ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          });
        }
      }

      setShowNewModal(false);
      setSelectedFiles([]);
      setNewOrder({ vehicle_id: '', mileage: '', fuel_level: 50, status: 'PENDING', visit_reason: '', desired_service: '', symptoms: '' });
      fetchData();
      toast({ title: 'OT Creada', message: 'La orden de trabajo fue creada exitosamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.detail || 'No se pudo crear la OT. Revisa los datos.';
      toast({ title: 'Error', message: msg, type: 'error' });
    }
  };

  const handleEditOrderSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`/api/operations/work-orders/${editOrderData.id}/`, {
        mileage: editOrderData.mileage,
        fuel_level: editOrderData.fuel_level,
        visit_reason: editOrderData.visit_reason,
        desired_service: editOrderData.desired_service,
        symptoms: editOrderData.symptoms,
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      setShowEditModal(false);
      setEditOrderData(null);
      fetchData();
      toast({ title: 'OT Actualizada', message: 'La orden fue modificada exitosamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: err.response?.data?.error || 'No se pudo editar la OT.', type: 'error' });
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar permanentemente esta Orden de Trabajo?")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/work-orders/${orderId}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      fetchData();
      toast({ title: 'OT Eliminada', message: 'La orden fue eliminada exitosamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: err.response?.data?.error || 'No se pudo eliminar la OT.', type: 'error' });
    }
  };

  const handleUpdateItem = async (itemId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`/api/operations/work-order-items/${itemId}/`, editItemData, {
        headers: { Authorization: `Token ${token}` }
      });
      setEditingItemId(null);
      setEditItemData({ description: '', quantity: 1, unit_price: 0 });
      fetchData();
      
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      toast({ title: 'Ítem actualizado', message: 'El ítem fue modificado correctamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo actualizar el ítem.', type: 'error' });
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este ítem?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/work-order-items/${itemId}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      fetchData();
      
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      toast({ title: 'Ítem eliminado', message: 'El ítem fue removido de la orden.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo eliminar el ítem.', type: 'error' });
    }
  };

  const handleUploadDetailFiles = async () => {
    if (detailFiles.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      for (const file of detailFiles) {
        const formData = new FormData();
        formData.append('work_order', selectedOrder.id);
        formData.append('file', file);
        formData.append('file_name', file.name);
        await axios.post('/api/operations/work-order-attachments/', formData, {
          headers: { 
            Authorization: `Token ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      setDetailFiles([]);
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      toast({ title: 'Archivos subidos', message: 'Los archivos adjuntos fueron cargados correctamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudieron subir los archivos adjuntos.', type: 'error' });
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este archivo adjunto?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/work-order-attachments/${attachmentId}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      toast({ title: 'Archivo eliminado', message: 'El archivo adjunto fue removido correctamente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo eliminar el archivo adjunto.', type: 'error' });
    }
  };

  const handleQuickVehicleSubmit = async (e) => {
    e.preventDefault();
    const cleanedPlate = quickVehicle.license_plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const plateRegex = /^[A-Z]{2}\d{4}$|^[A-Z]{4}\d{2}$/;
    if (!plateRegex.test(cleanedPlate)) {
      alert("La patente debe tener formato válido chileno: 2 letras y 4 números (ej. AB1234) o 4 letras y 2 números (ej. ABCD12).");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        license_plate: cleanedPlate,
        make: quickVehicle.make,
        model: quickVehicle.model,
        year: quickVehicle.year,
        color: quickVehicle.color || null,
        transmission_type: quickVehicle.transmission_type,
        fuel_type: quickVehicle.fuel_type,
        vin: quickVehicle.vin || null,
        engine_number: quickVehicle.engine_number || null,
        engine_displacement: quickVehicle.engine_displacement || null,
        mileage: quickVehicle.mileage ? parseInt(quickVehicle.mileage) : null,
        client_id: quickVehicle.client_id || null
      };

      const res = await axios.post('/api/operations/vehicles/', payload, {
        headers: { Authorization: `Token ${token}` }
      });
      
      const createdVehicle = res.data;
      toast({ title: 'Vehículo registrado', message: 'El vehículo fue guardado y seleccionado para la OT.', type: 'success' });
      
      // Update vehicles state
      setVehicles([createdVehicle, ...vehicles]);
      setNewOrder({
        ...newOrder,
        vehicle_id: createdVehicle.id
      });
      setShowQuickVehicle(false);
      setQuickVehicle({
        license_plate: '', make: '', model: '', year: '', color: '', transmission_type: 'MANUAL',
        fuel_type: 'GASOLINE', vin: '', engine_number: '', engine_displacement: '', mileage: '', client_id: ''
      });
    } catch (err) {
      console.error(err);
      alert("Error al registrar vehículo rápido.");
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/operations/work-orders/${orderId}/change_status/`, {
        status: newStatus
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Estado Actualizado', message: `Orden pasada a ${newStatus}`, type: 'success' });
      fetchData();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.data);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'No se pudo cambiar el estado de la OT.';
      toast({ title: 'Error', message: msg, type: 'error' });
    }
  };

  const handleSaveFindings = async () => {
    if (!selectedOrder) return;
    setSavingFinding(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.patch(`/api/operations/work-orders/${selectedOrder.id}/`, {
        additional_findings: mechanicFinding
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Hallazgo Guardado', message: 'Detalle ingresado correctamente.', type: 'success' });
      setSelectedOrder(res.data);
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo registrar el hallazgo.', type: 'error' });
    } finally {
      setSavingFinding(false);
    }
  };

  const handleSendFindingsWhatsApp = async () => {
    if (!selectedOrder) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/operations/work-orders/${selectedOrder.id}/send_findings_whatsapp/`, {}, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'WhatsApp Enviado', message: 'Notificación de hallazgo enviada al cliente.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'Fallo al notificar hallazgos por WhatsApp.', type: 'error' });
    }
  };

  const handleToggleFindingsApproval = async (approved) => {
    if (!selectedOrder) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.patch(`/api/operations/work-orders/${selectedOrder.id}/`, {
        findings_approved: approved
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      toast({ title: 'Aprobación Actualizada', message: approved ? 'Hallazgos aprobados por cliente.' : 'Aprobación removida.', type: 'success' });
      setSelectedOrder(res.data);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    
    try {
      const token = localStorage.getItem('token');
      let payload = { ...newItem, work_order: selectedOrder.id };

      if (itemSource === 'service' && selectedCatalogItem) {
        payload.service = selectedCatalogItem.id;
        payload.description = selectedCatalogItem.name;
        payload.unit_price = selectedCatalogItem.price;
      } else if (itemSource === 'product' && selectedCatalogItem) {
        payload.product = selectedCatalogItem.id;
        payload.description = selectedCatalogItem.name;
        payload.unit_price = selectedCatalogItem.price;
      }

      await axios.post('/api/operations/work-order-items/', payload, {
        headers: { Authorization: `Token ${token}` }
      });
      
      setNewItem({ description: '', quantity: 1, unit_price: 0 });
      setSelectedCatalogItem(null);
      setItemSource('manual');
      fetchData();
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setSelectedOrder(response.data);
      
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo agregar el ítem a la OT.', type: 'error' });
    }
  };

  const handleScanBarcode = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const p = catalogProducts.find(prod => prod.sku === barcodeInput.trim() || prod.id.toString() === barcodeInput.trim());
    if (p) {
      try {
        const token = localStorage.getItem('token');
        const payload = {
          work_order: selectedOrder.id,
          product: p.id,
          description: p.name,
          unit_price: p.price,
          quantity: 1,
          is_labor: false
        };
        await axios.post('/api/operations/work-order-items/', payload, {
          headers: { Authorization: `Token ${token}` }
        });
        fetchData();
        const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/`, {
          headers: { Authorization: `Token ${token}` }
        });
        setSelectedOrder(response.data);
        setBarcodeInput('');
      } catch (err) {
        alert("Error al agregar producto escaneado.");
      }
    } else {
      toast({ title: 'SKU no encontrado', message: `No existe ningún producto con SKU: ${barcodeInput}`, type: 'warning' });
    }
  };

  const openDetails = (order) => {
    setSelectedOrder(order);
    setMechanicFinding(order.additional_findings || '');
    setEditingItemId(null);
    setDetailFiles([]);
    setShowDetailsModal(true);
    // Cargar catálogo al abrir el modal
    const token = localStorage.getItem('token');
    const h = { headers: { Authorization: `Token ${token}` } };
    Promise.all([
      axios.get('/api/inventory/services/?is_active=true', h),
      axios.get('/api/inventory/products/', h),
    ]).then(([s, p]) => {
      setCatalogServices(s.data.results || s.data);
      setCatalogProducts(p.data.results || p.data);
    }).catch(() => {});
  };

  const openAiModal = (order) => {
    setSelectedOrder(order);
    // Pre-fill prompt context for user preview
    const specs = order.vehicle ? `${order.vehicle.make} ${order.vehicle.model} (${order.vehicle.year})` : '';
    setAiSymptoms(`Presintomas/Motivos de OT: \n- Motivo: ${order.visit_reason || 'No especificado'}\n- Síntomas: ${order.symptoms || 'No especificado'}\n- Servicio: ${order.desired_service || 'No especificado'}`);
    setAiResponse('');
    setShowAiModal(true);
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    setAiLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-diagnostics/', {
        work_order_id: selectedOrder.id
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      setAiResponse(response.data.diagnosis);
    } catch (err) {
      console.error(err);
      setAiResponse("Hubo un error al contactar a MecanIA. Por favor, intenta de nuevo.");
    }
    setAiLoading(false);
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/operations/work-orders/${selectedOrder.id}/generate_pdf/`, {
        headers: { Authorization: `Token ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OT_${selectedOrder.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert("Error al generar PDF.");
    }
  };

  if (loading) return (
    <div className="grid-container">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="glass-card skeleton-card skeleton" />
      ))}
    </div>
  );
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '3rem' }}>{error}</div>;

  const STATUS_BADGE_CLASS = {
    PENDING:     'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED:   'COMPLETED',
    DELIVERED:   'DELIVERED',
    CANCELLED:   'CANCELLED',
  };

  const filteredOrders = orders.filter(o => 
    (o.vehicle?.license_plate || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.vehicle?.make || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.vehicle?.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.vehicle?.client?.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.vehicle?.client?.last_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(o.id).includes(searchQuery)
  );

  return (
    <div>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Gestión de Órdenes de Trabajo</div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View selector */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <button 
              type="button"
              onClick={() => { setViewMode('grid'); localStorage.setItem('work_order_view_mode', 'grid'); }}
              style={{
                padding: '0.5rem 0.9rem', border: 'none', cursor: 'pointer',
                background: viewMode === 'grid' ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                color: viewMode === 'grid' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'grid' ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
              }}
            >
              🎴 Tarjetas (Por Estado)
            </button>
            <button 
              type="button"
              onClick={() => { setViewMode('list'); localStorage.setItem('work_order_view_mode', 'list'); }}
              style={{
                padding: '0.5rem 0.9rem', border: 'none', cursor: 'pointer',
                background: viewMode === 'list' ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                color: viewMode === 'list' ? '#000' : 'var(--text-muted)',
                fontWeight: viewMode === 'list' ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
              }}
            >
              📄 Lista Detallada
            </button>
          </div>

          <input 
            type="text" 
            className="glass-input" 
            placeholder="Buscar por OT, patente, cliente..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            style={{ width: '240px' }}
          />

          <button className="btn" onClick={() => setShowNewModal(true)}>+ Nueva OT</button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Sin órdenes de trabajo</div>
            <p className="empty-state-text">No hay órdenes coincidentes.</p>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* ── Vista de Lista Detallada ── */
        <div className="glass-card" style={{ padding: '1rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.8rem' }}>OT</th>
                  <th style={{ padding: '0.8rem' }}>Vehículo / Patente</th>
                  <th style={{ padding: '0.8rem' }}>Cliente</th>
                  <th style={{ padding: '0.8rem' }}>Motivo / Ingreso</th>
                  <th style={{ padding: '0.8rem', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.8rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.8rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.85rem 0.8rem', fontWeight: 'bold' }}>OT-{order.id}</td>
                    <td style={{ padding: '0.85rem 0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-card)', color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                          {order.vehicle?.license_plate || 'N/A'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{order.vehicle?.make} {order.vehicle?.model}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.mileage?.toLocaleString('es-CL')} km</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.8rem' }}>
                      {order.vehicle?.client ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{order.vehicle.client.first_name} {order.vehicle.client.last_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📞 {order.vehicle.client.phone}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin cliente</span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 0.8rem', fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 500 }}>{order.visit_reason ? order.visit_reason.substring(0, 45) + '...' : 'Servicio general'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                    </td>
                    <td style={{ padding: '0.85rem 0.8rem', textAlign: 'center' }}>
                      <span className={`badge ${STATUS_BADGE_CLASS[order.status] || 'PENDING'}`}>
                        {order.status?.replace('_', ' ') || 'PENDIENTE'}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 0.8rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      {order.total_amount ? `$${parseInt(order.total_amount).toLocaleString('es-CL')}` : '-'}
                    </td>
                    <td style={{ padding: '0.85rem 0.8rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => openDetails(order)}>
                          👁️ Detalles
                        </button>
                        <button className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)' }} onClick={() => openAiModal(order)}>
                          🤖 IA
                        </button>
                        {order.status !== 'DELIVERED' && (
                          <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => { setEditOrderData(order); setShowEditModal(true); }}>
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Vista de Tarjetas agrupadas ── */
        <div>
          {[
            { key: 'PENDING', label: 'Pendientes (Nuevas)' },
            { key: 'IN_PROGRESS', label: 'En Progreso' },
            { key: 'COMPLETED', label: 'Completadas / Listas para Retiro' },
            { key: 'DELIVERED', label: 'Entregadas' },
            { key: 'CANCELLED', label: 'Canceladas' }
          ].map(group => {
            const groupOrders = orders.filter(o => o.status === group.key);
            if (groupOrders.length === 0) return null;
            
            return (
              <div key={group.key} style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  {group.label} <span style={{ fontSize: '0.9rem', marginLeft: '0.5rem', opacity: 0.7 }}>({groupOrders.length})</span>
                </h3>
                <div className="grid-container">
                  {groupOrders.map(order => (
                    <div key={order.id} className="glass-card interactive">
                      <div className="ot-header">
                        <span className="ot-plate">{order.vehicle?.license_plate || 'N/A'}</span>
                        <span className={`badge ${STATUS_BADGE_CLASS[order.status] || 'PENDING'}`}>
                          {order.status?.replace('_', ' ') || 'PENDIENTE'}
                        </span>
                      </div>
                      <p className="ot-vehicle">
                        {order.vehicle?.make} {order.vehicle?.model}
                      </p>
                      <div className="ot-meta">
                        <span>{order.mileage?.toLocaleString('es-CL')} km</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>OT #{order.id}</span>
                      </div>

                      {/* Motivo & Sintomas Breve */}
                      <div style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {order.visit_reason && <div><strong>Motivo:</strong> {order.visit_reason.substring(0, 50)}...</div>}
                        {order.symptoms && <div><strong>Síntomas:</strong> {order.symptoms.substring(0, 50)}...</div>}
                      </div>

                      <div className="ot-actions">
                        <div className="ot-actions-row">
                          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => openDetails(order)}>Detalles / Estado</button>
                          <button
                            className="btn"
                            style={{ flex: 1, background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)' }}
                            onClick={() => openAiModal(order)}
                          >
                            🤖 MecanIA
                          </button>
                        </div>
                        {order.status !== 'DELIVERED' && order.invoice?.status !== 'PAID' && (
                          <div className="ot-actions-row" style={{ marginTop: '0.5rem' }}>
                            <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem', padding: '0.3rem' }} onClick={() => { setEditOrderData(order); setShowEditModal(true); }}>✏️ Editar OT</button>
                            <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem', padding: '0.3rem', borderColor: 'var(--status-red)', color: 'var(--status-red)' }} onClick={() => handleDeleteOrder(order.id)}>🗑️ Eliminar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nueva OT */}
      {showNewModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Crear Nueva OT</h3>
              <button onClick={() => setShowNewModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            {showQuickVehicle ? (
              <form onSubmit={handleQuickVehicleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0 }}>Registrar Vehículo Rápido</h4>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Patente (Placa) *</label>
                  <input type="text" required value={quickVehicle.license_plate} onChange={e => setQuickVehicle({...quickVehicle, license_plate: e.target.value})} className="input-field" style={{ width: '100%', textTransform: 'uppercase' }} placeholder="AB12CD" />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Marca *</label>
                    <input type="text" required value={quickVehicle.make} onChange={e => setQuickVehicle({...quickVehicle, make: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Toyota" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Modelo *</label>
                    <input type="text" required value={quickVehicle.model} onChange={e => setQuickVehicle({...quickVehicle, model: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="Yaris" />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Año *</label>
                    <input type="number" required value={quickVehicle.year} onChange={e => setQuickVehicle({...quickVehicle, year: e.target.value})} className="input-field" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Color</label>
                    <input type="text" value={quickVehicle.color} onChange={e => setQuickVehicle({...quickVehicle, color: e.target.value})} className="input-field" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Transmisión *</label>
                    <select required value={quickVehicle.transmission_type} onChange={e => setQuickVehicle({...quickVehicle, transmission_type: e.target.value})} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                      <option value="MANUAL">Manual</option>
                      <option value="AUTOMATIC">Automática</option>
                      <option value="CVT">CVT</option>
                      <option value="DCT">Doble Embrague</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Combustible *</label>
                    <select required value={quickVehicle.fuel_type} onChange={e => setQuickVehicle({...quickVehicle, fuel_type: e.target.value})} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                      <option value="GASOLINE">Gasolina</option>
                      <option value="DIESEL">Diesel</option>
                      <option value="HYBRID">Híbrido</option>
                      <option value="ELECTRIC">Eléctrico</option>
                      <option value="GNC_GLP">Gas (GNC/GLP)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Cilindrada Motor</label>
                    <input type="text" value={quickVehicle.engine_displacement} onChange={e => setQuickVehicle({...quickVehicle, engine_displacement: e.target.value})} className="input-field" style={{ width: '100%' }} placeholder="2.0L" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.9rem' }}>Cliente</label>
                    <select value={quickVehicle.client_id} onChange={e => setQuickVehicle({...quickVehicle, client_id: e.target.value})} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                      <option value="">Seleccione Propietario...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowQuickVehicle(false)}>Cancelar Registro</button>
                  <button type="submit" className="btn">Guardar y Seleccionar</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Vehículo</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select 
                      className="input-field" style={{ flex: 1 }} required
                      value={newOrder.vehicle_id} 
                      onChange={(e) => setNewOrder({...newOrder, vehicle_id: e.target.value})}
                    >
                      <option value="">Seleccione un vehículo...</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.license_plate} - {v.make} {v.model}</option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-outline" onClick={() => setShowQuickVehicle(true)}>+ Nuevo</button>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Kilometraje Actual</label>
                    <input 
                      type="number" className="input-field" style={{ width: '100%' }} required
                      value={newOrder.mileage} 
                      onChange={(e) => setNewOrder({...newOrder, mileage: e.target.value})}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nivel de Combustible (%)</label>
                    <input 
                      type="number" min="0" max="100" className="input-field" style={{ width: '100%' }} required
                      value={newOrder.fuel_level} 
                      onChange={(e) => setNewOrder({...newOrder, fuel_level: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Motivo de la Visita</label>
                  <input 
                    type="text" className="input-field" style={{ width: '100%' }} 
                    placeholder="Ej. Mantención de kilometraje, revisión general, ruido extraño"
                    value={newOrder.visit_reason} 
                    onChange={(e) => setNewOrder({...newOrder, visit_reason: e.target.value})}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Servicio que Desea Realizar</label>
                  <input 
                    type="text" className="input-field" style={{ width: '100%' }} 
                    placeholder="Ej. Cambio de aceite y filtro de aire"
                    value={newOrder.desired_service} 
                    onChange={(e) => setNewOrder({...newOrder, desired_service: e.target.value})}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Síntomas del Vehículo</label>
                  <textarea 
                    className="input-field" style={{ width: '100%', minHeight: '80px' }} 
                    placeholder="Describe los problemas que presenta el automóvil..."
                    value={newOrder.symptoms} 
                    onChange={(e) => setNewOrder({...newOrder, symptoms: e.target.value})}
                  />
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Archivos Adjuntos (Scanner, Reportes, Manuales de taller)</label>
                  <input 
                    type="file" 
                    multiple 
                    onChange={e => setSelectedFiles(Array.from(e.target.files))}
                    style={{ display: 'none' }}
                    id="new-file-upload"
                  />
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label htmlFor="new-file-upload" className="btn btn-outline" style={{ cursor: 'pointer', padding: '0.5rem 1rem' }}>
                      📎 Seleccionar Archivos
                    </label>
                    {selectedFiles.length > 0 && (
                      <span style={{ fontSize: '0.85rem' }}>{selectedFiles.length} archivo(s) seleccionado(s)</span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowNewModal(false); setSelectedFiles([]); }}>Cancelar</button>
                  <button type="submit" className="btn">Crear OT</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Editar OT */}
      {showEditModal && editOrderData && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Editar OT #{editOrderData.id}</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            <form onSubmit={handleEditOrderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Kilometraje</label>
                  <input 
                    type="number" className="input-field" style={{ width: '100%' }} required
                    value={editOrderData.mileage} 
                    onChange={(e) => setEditOrderData({...editOrderData, mileage: e.target.value})}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nivel Combustible (%)</label>
                  <input 
                    type="number" min="0" max="100" className="input-field" style={{ width: '100%' }} required
                    value={editOrderData.fuel_level} 
                    onChange={(e) => setEditOrderData({...editOrderData, fuel_level: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Motivo de Visita</label>
                <input 
                  type="text" className="input-field" style={{ width: '100%' }} 
                  value={editOrderData.visit_reason || ''} 
                  onChange={(e) => setEditOrderData({...editOrderData, visit_reason: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Servicio Deseado</label>
                <input 
                  type="text" className="input-field" style={{ width: '100%' }} 
                  value={editOrderData.desired_service || ''} 
                  onChange={(e) => setEditOrderData({...editOrderData, desired_service: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Síntomas</label>
                <textarea 
                  className="input-field" style={{ width: '100%', minHeight: '80px' }} 
                  value={editOrderData.symptoms || ''} 
                  onChange={(e) => setEditOrderData({...editOrderData, symptoms: e.target.value})}
                />
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalles / Repuestos */}
      {showDetailsModal && selectedOrder && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>OT #{selectedOrder.id} - {selectedOrder.vehicle?.license_plate}</h3>
                <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', borderColor: '#3b82f6', color: '#3b82f6' }} onClick={handleDownloadPDF}>
                  Descargar PDF
                </button>
              </div>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            {/* Gestión del Estado de la OT */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.8rem 0' }}>Flujo de Trabajo</h4>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>Estado actual: <span className={`badge ${STATUS_BADGE_CLASS[selectedOrder.status]}`}>{selectedOrder.status}</span></div>
                
                {selectedOrder.status === 'PENDING' && (
                  <button className="btn" style={{ backgroundColor: '#3b82f6' }} onClick={() => handleStatusChange(selectedOrder.id, 'IN_PROGRESS')}>
                    ⚙️ Iniciar Trabajo (En Progreso)
                  </button>
                )}

                {selectedOrder.status === 'IN_PROGRESS' && (
                  <>
                    <button className="btn" style={{ backgroundColor: '#10b981' }} onClick={() => handleStatusChange(selectedOrder.id, 'COMPLETED')}>
                      ✓ Finalizar Trabajo (Completado)
                    </button>
                  </>
                )}

                {selectedOrder.status === 'COMPLETED' && (
                  <>
                    <button className="btn" style={{ backgroundColor: '#8b5cf6' }} onClick={() => handleStatusChange(selectedOrder.id, 'DELIVERED')}>
                      🔑 Entregar Vehículo (Entregado)
                    </button>
                    <button className="btn btn-whatsapp" onClick={() => handleNotifyClient(selectedOrder.id)}>
                      💬 Notificar Listo (WhatsApp)
                    </button>
                  </>
                )}
              </div>

              {/* Registro de Detalle o Hallazgo Encontrado */}
              {selectedOrder.status === 'IN_PROGRESS' && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--status-yellow)' }}>⚠️ Hallazgos Adicionales / Detalles Encontrados</h5>
                  <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                    <textarea 
                      className="input-field"
                      style={{ width: '100%', minHeight: '60px' }}
                      placeholder="Ej. Pastillas de freno delanteras gastadas (menos del 15% de vida restante)..."
                      value={mechanicFinding}
                      onChange={e => setMechanicFinding(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.5rem' }}>
                      <button className="btn btn-outline" onClick={handleSaveFindings} disabled={savingFinding}>
                        {savingFinding ? 'Guardando...' : 'Guardar Hallazgo'}
                      </button>
                      {selectedOrder.additional_findings && (
                        <button className="btn btn-whatsapp" onClick={handleSendFindingsWhatsApp}>
                          💬 Solicitar Aprobación por WhatsApp
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Mostrar estado de aprobación si hay hallazgos */}
              {selectedOrder.additional_findings && (
                <div style={{ marginTop: '1rem', padding: '0.8rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', borderLeft: '4px solid var(--status-red)' }}>
                  <div><strong>Problema detectado:</strong> "{selectedOrder.additional_findings}"</div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span>Aprobación del cliente: <strong>{selectedOrder.findings_approved ? 'APROBADO ✓' : 'PENDIENTE'}</strong></span>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => handleToggleFindingsApproval(!selectedOrder.findings_approved)}
                    >
                      {selectedOrder.findings_approved ? 'Marcar como Pendiente' : 'Marcar como Aprobado'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: '2rem' }}>
              <h4>Repuestos y Servicios</h4>
              {(!selectedOrder.items || selectedOrder.items.length === 0) ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay repuestos agregados a esta orden aún.</p>
              ) : (
                <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>Descripción</th>
                      <th style={{ padding: '0.5rem' }}>Cantidad</th>
                      <th style={{ padding: '0.5rem' }}>Precio Unitario</th>
                      <th style={{ padding: '0.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map(item => {
                      const isEditing = editingItemId === item.id;
                      const isReadOnly = ['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(selectedOrder.status);
                      
                      if (isEditing) {
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <input 
                                type="text" 
                                className="input-field" 
                                style={{ width: '100%', padding: '0.2rem 0.5rem' }} 
                                value={editItemData.description} 
                                onChange={e => setEditItemData({ ...editItemData, description: e.target.value })} 
                              />
                            </td>
                            <td style={{ padding: '0.5rem', width: '90px' }}>
                              <input 
                                type="number" 
                                step="0.01" 
                                min="0.01"
                                className="input-field" 
                                style={{ width: '100%', padding: '0.2rem 0.5rem' }} 
                                value={editItemData.quantity} 
                                onChange={e => setEditItemData({ ...editItemData, quantity: e.target.value })} 
                              />
                            </td>
                            <td style={{ padding: '0.5rem', width: '120px' }}>
                              <input 
                                type="number" 
                                step="0.01" 
                                className="input-field" 
                                style={{ width: '100%', padding: '0.2rem 0.5rem' }} 
                                value={editItemData.unit_price} 
                                onChange={e => setEditItemData({ ...editItemData, unit_price: e.target.value })} 
                              />
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button 
                                  type="button"
                                  className="btn btn-outline" 
                                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderColor: 'var(--status-green)', color: 'var(--status-green)' }}
                                  onClick={() => handleUpdateItem(item.id)}
                                >
                                  Guardar
                                </button>
                                <button 
                                  type="button"
                                  className="btn btn-outline" 
                                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                                  onClick={() => { setEditingItemId(null); setEditItemData({ description: '', quantity: 1, unit_price: 0 }); }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem' }}>{item.description}</td>
                          <td style={{ padding: '0.5rem' }}>{item.quantity}</td>
                          <td style={{ padding: '0.5rem' }}>${item.unit_price}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>${(item.quantity * item.unit_price).toFixed(2)}</span>
                              {!isReadOnly && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button 
                                    type="button"
                                    title="Editar"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#3b82f6' }}
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditItemData({ description: item.description, quantity: item.quantity, unit_price: item.unit_price });
                                    }}
                                  >
                                    ✏️
                                  </button>
                                  <button 
                                    type="button"
                                    title="Eliminar"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--status-red)' }}
                                    onClick={() => handleDeleteItem(item.id)}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Gestión de Archivos Adjuntos */}
            <div style={{ marginBottom: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h4>Archivos Adjuntos para Diagnóstico IA</h4>
              {(!selectedOrder.attachments || selectedOrder.attachments.length === 0) ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay archivos adjuntos cargados en esta orden.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  {selectedOrder.attachments.map(att => {
                    const isPdf = att.file.toLowerCase().endsWith('.pdf');
                    const isImg = att.file.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/);
                    let icon = '📁';
                    if (isPdf) icon = '📄';
                    else if (isImg) icon = '🖼️';
                    return (
                      <div key={att.id} style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        borderRadius: '8px', 
                        padding: '0.8rem', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        border: '1px solid rgba(255,255,255,0.1)',
                        minHeight: '100px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                          <a href={att.file} target="_blank" rel="noopener noreferrer" style={{ 
                            color: '#3b82f6', 
                            fontSize: '0.85rem', 
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {att.file_name}
                          </a>
                        </div>
                        
                        {!['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(selectedOrder.status) && (
                          <button 
                            type="button"
                            className="btn btn-outline" 
                            style={{ 
                              padding: '0.2rem 0.5rem', 
                              fontSize: '0.75rem', 
                              borderColor: 'var(--status-red)', 
                              color: 'var(--status-red)', 
                              alignSelf: 'flex-end',
                              marginTop: 'auto'
                            }}
                            onClick={() => handleDeleteAttachment(att.id)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {!['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(selectedOrder.status) && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
                  <input 
                    type="file" 
                    multiple 
                    onChange={e => setDetailFiles(Array.from(e.target.files))}
                    style={{ display: 'none' }}
                    id="detail-file-upload"
                  />
                  <label htmlFor="detail-file-upload" className="btn btn-outline" style={{ cursor: 'pointer', padding: '0.5rem 1rem' }}>
                    📎 Seleccionar Archivos
                  </label>
                  {detailFiles.length > 0 && (
                    <>
                      <span style={{ fontSize: '0.85rem' }}>{detailFiles.length} archivo(s) seleccionado(s)</span>
                      <button type="button" className="btn" onClick={handleUploadDetailFiles}>Subir Archivos</button>
                    </>
                  )}
                </div>
              )}
            </div>

            {['COMPLETED', 'DELIVERED', 'PAID', 'CANCELLED'].includes(selectedOrder.status) ? (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <p style={{ color: 'var(--status-yellow)', fontSize: '0.9rem' }}>
                  ⚠️ Esta Orden de Trabajo se encuentra cerrada o finalizada y no admite más modificaciones directas sobre ítems.
                </p>
              </div>
            ) : (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h4>Añadir Repuesto / Servicio</h4>

              {/* selector de fuente */}
              <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', background: 'rgba(0,0,0,0.3)', padding: '0.3rem', borderRadius: 8, width: 'fit-content' }}>
                {[['manual','✏️ Manual'], ['service','🔧 Del catálogo'], ['product','📦 Del inventario']].map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => { setItemSource(val); setSelectedCatalogItem(null); setNewItem({ description: '', quantity: 1, unit_price: 0 }); }}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: itemSource === val ? 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' : 'transparent',
                      color: itemSource === val ? '#000' : 'var(--text-muted)',
                      fontWeight: itemSource === val ? 700 : 400, fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem',
                    }}>{lbl}</button>
                ))}
              </div>

              <form onSubmit={handleScanBarcode} style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="Escanear SKU con pistola lectora..." 
                  value={barcodeInput} 
                  onChange={e => setBarcodeInput(e.target.value)} 
                  autoFocus 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px' }} 
                />
                <button type="submit" className="btn btn-outline" style={{ padding: '0 1rem' }}>Escanear</button>
              </form>

              <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* selector de catálogo */}
                {itemSource === 'service' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Servicio del catálogo</label>
                    <select
                      style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.7rem', color: '#fff', fontFamily: 'Outfit, sans-serif' }}
                      value={selectedCatalogItem?.id || ''}
                      onChange={e => {
                        const s = catalogServices.find(x => String(x.id) === e.target.value);
                        setSelectedCatalogItem(s || null);
                        if (s) setNewItem(n => ({ ...n, description: s.name, unit_price: s.price }));
                      }}
                      required
                    >
                      <option value="">Seleccionar servicio...</option>
                      {catalogServices.map(s => (
                        <option key={s.id} value={s.id}>{s.name} — {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(s.price)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {itemSource === 'product' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Producto del inventario</label>
                    <select
                      style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.7rem', color: '#fff', fontFamily: 'Outfit, sans-serif' }}
                      value={selectedCatalogItem?.id || ''}
                      onChange={e => {
                        const p = catalogProducts.find(x => String(x.id) === e.target.value);
                        setSelectedCatalogItem(p || null);
                        if (p) setNewItem(n => ({ ...n, description: p.name, unit_price: p.price }));
                      }}
                      required
                    >
                      <option value="">Seleccionar producto...</option>
                      {catalogProducts.map(p => (
                        <option key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                          {p.name} ({p.sku}) — Stock: {p.stock_quantity} — {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.price)}
                          {p.stock_quantity <= 0 ? ' ⚠️ Sin stock' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {itemSource === 'manual' && (
                  <div style={{ flex: '1 1 40%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Descripción</label>
                    <input type="text" className="input-field" style={{ width: '100%' }} required
                      value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})}
                    />
                  </div>
                )}

                <div style={{ flex: '1 1 15%' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Cantidad</label>
                  <input type="number" step="0.01" min="0.01" className="input-field" style={{ width: '100%' }} required
                    value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})}
                  />
                </div>
                <div style={{ flex: '1 1 20%' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Precio U.</label>
                  <input type="number" step="0.01" className="input-field" style={{ width: '100%' }} required
                    value={newItem.unit_price} onChange={e => setNewItem({...newItem, unit_price: e.target.value})}
                  />
                </div>
                <div>
                  <button type="submit" className="btn" style={{ padding: '0.75rem 1.5rem' }}>Añadir</button>
                </div>
              </form>
            </div>
            )}
            
          </div>
        </div>
      )}

      {/* Modal Inteligencia Artificial */}
      {showAiModal && selectedOrder && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.95))', border: '1px solid rgba(59,130,246,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#60a5fa' }}>🤖 MecanIA - Diagnóstico Asistido</h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            
            {selectedOrder.attachments && selectedOrder.attachments.length > 0 && (
              <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#60a5fa', marginBottom: '0.4rem', fontWeight: 600 }}>
                  📎 Archivos adjuntos para análisis:
                </label>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {selectedOrder.attachments.map(att => (
                    <li key={att.id}>{att.file_name}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleAiSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Detalles de la OT para Analizar</label>
                <textarea 
                  className="input-field" style={{ width: '100%', minHeight: '120px', resize: 'vertical' }} required
                  value={aiSymptoms} 
                  onChange={(e) => setAiSymptoms(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn" style={{ background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', border: 'none' }} disabled={aiLoading}>
                  {aiLoading ? 'Analizando...' : 'Analizar con MecanIA'}
                </button>
              </div>
            </form>

            {aiResponse && (
              <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', borderLeft: '4px solid #8b5cf6' }}>
                <h4 style={{ color: '#c4b5fd', marginTop: 0, marginBottom: '1rem' }}>Diagnóstico de MecanIA:</h4>
                <div style={{ color: 'var(--text-light)', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                  {aiResponse}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkOrderList;
