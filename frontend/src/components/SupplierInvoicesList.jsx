import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Help helper for Chile Currency
const fmt = (num) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(num || 0);

export default function SupplierInvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Selection/Detail State
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  
  // Parsing/Upload State
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  
  // Form overrides for Confirming Parsed Invoice
  const [parsedSupplierRut, setParsedSupplierRut] = useState('');
  const [parsedSupplierName, setParsedSupplierName] = useState('');
  const [parsedInvoiceNum, setParsedInvoiceNum] = useState('');
  const [parsedIssueDate, setParsedIssueDate] = useState('');
  const [parsedTotal, setParsedTotal] = useState('');
  const [parsedNet, setParsedNet] = useState('');
  const [parsedTax, setParsedTax] = useState('');

  // Add Manual Document state
  const [docType, setDocType] = useState('CHEQUE');
  const [docNum, setDocNum] = useState('');
  const [docAmount, setDocAmount] = useState('');
  const [docDate, setDocDate] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  // Active view: 'list' or 'forecast'
  const [activeTab, setActiveTab] = useState('list');

  const [toastMsg, setToastMsg] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [invRes, supRes, foreRes] = await Promise.all([
        axios.get('/api/finance/supplier-invoices/'),
        axios.get('/api/finance/suppliers/'),
        axios.get('/api/finance/supplier-payments/forecast/')
      ]);
      setInvoices(invRes.data.results || invRes.data);
      setSuppliers(supRes.data.results || supRes.data);
      setForecast(foreRes.data.results || foreRes.data);
    } catch (err) {
      console.error(err);
      showToast('Error al cargar facturas y proyecciones.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // File parsing handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setParsedData(null);
      const res = await axios.post('/api/finance/supplier-invoices/parse-upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const data = res.data;
      setParsedData(data);
      setParsedSupplierRut(data.supplier_rut || '');
      setParsedSupplierName(data.supplier_name || '');
      setParsedInvoiceNum(data.invoice_number || '');
      setParsedIssueDate(data.issue_date || '');
      setParsedTotal(data.total_amount || 0);
      setParsedNet(data.net_amount || 0);
      setParsedTax(data.tax_amount || 0);
      showToast('Factura analizada correctamente. Valide y guarde.');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Error al analizar el archivo de factura.', 'error');
    } finally {
      setUploading(false);
      e.target.value = ''; // clear input
    }
  };

  // Save the analyzed invoice
  const handleSaveParsedInvoice = async (e) => {
    e.preventDefault();
    if (!parsedSupplierRut || !parsedSupplierName || !parsedInvoiceNum || !parsedTotal) {
      showToast('Faltan campos mínimos de RUT, Razón Social, Núm Factura y Total.', 'error');
      return;
    }

    try {
      const payload = {
        supplier_rut: parsedSupplierRut,
        supplier_name: parsedSupplierName,
        invoice_number: parsedInvoiceNum,
        issue_date: parsedIssueDate || new Date().toISOString().split('T')[0],
        net_amount: parseInt(parsedNet) || 0,
        tax_amount: parseInt(parsedTax) || 0,
        total_amount: parseInt(parsedTotal) || 0,
      };

      await axios.post('/api/finance/supplier-invoices/', payload);
      showToast('Factura ingresada con éxito.');
      setParsedData(null);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error al registrar la factura de compra.', 'error');
    }
  };

  // Add payment document (cheque, transfer, etc.)
  const handleAddPaymentDocument = async (e) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    if (!docAmount || parseInt(docAmount) <= 0 || !docDate) {
      showToast('Monto y Fecha de pago son requeridos.', 'error');
      return;
    }

    try {
      setAddingDoc(true);
      const payload = {
        invoice: selectedInvoice.id,
        document_type: docType,
        document_number: docNum,
        payment_date: docDate,
        amount: parseInt(docAmount),
        status: 'PENDING'
      };

      await axios.post('/api/finance/supplier-payments/', payload);
      showToast('Documento de pago guardado.');
      
      // Refresh current details
      const updatedInv = await axios.get(`/api/finance/supplier-invoices/${selectedInvoice.id}/`);
      setSelectedInvoice(updatedInv.data);
      setDocNum('');
      setDocAmount('');
      setDocDate('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error al añadir documento de pago.', 'error');
    } finally {
      setAddingDoc(false);
    }
  };

  const handleUpdateDocStatus = async (docId, newStatus) => {
    try {
      await axios.patch(`/api/finance/supplier-payments/${docId}/`, { status: newStatus });
      showToast('Estado del documento actualizado.');
      
      if (selectedInvoice) {
        const updatedInv = await axios.get(`/api/finance/supplier-invoices/${selectedInvoice.id}/`);
        setSelectedInvoice(updatedInv.data);
      }
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error al actualizar estado.', 'error');
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('¿Está seguro de eliminar este documento de pago?')) return;
    try {
      await axios.delete(`/api/finance/supplier-payments/${docId}/`);
      showToast('Documento eliminado.');
      
      if (selectedInvoice) {
        const updatedInv = await axios.get(`/api/finance/supplier-invoices/${selectedInvoice.id}/`);
        setSelectedInvoice(updatedInv.data);
      }
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar.', 'error');
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm('¿Está seguro de eliminar esta factura?')) return;
    try {
      await axios.delete(`/api/finance/supplier-invoices/${invoiceId}/`);
      showToast('Factura eliminada.');
      setSelectedInvoice(null);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar factura.', 'error');
    }
  };

  const getStatusLabelDoc = (status) => {
    switch (status) {
      case 'PENDING': return <span style={{ color: 'var(--status-orange)', fontWeight: 700 }}>Pendiente</span>;
      case 'PAID': return <span style={{ color: 'var(--status-green)', fontWeight: 700 }}>Cobrado</span>;
      case 'BOUNCED': return <span style={{ color: 'var(--status-red)', fontWeight: 700 }}>Protestado</span>;
      default: return status;
    }
  };

  // Find remaining undocumented balance for selected invoice
  const getRemainingToDocument = (inv) => {
    if (!inv) return 0;
    const documented = (inv.payment_documents || []).reduce((acc, curr) => acc + curr.amount, 0);
    return inv.total_amount - documented;
  };

  // Filter local invoices list
  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number.includes(search) ||
    inv.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    inv.supplier_rut.includes(search)
  );

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: '8px',
          background: toastMsg.type === 'error' ? 'var(--status-red)' : 'var(--status-green)',
          color: '#fff',
          zIndex: 9999,
          fontWeight: 650,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toastMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('list')}
          style={{
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'list' ? '3px solid var(--accent-color, #1e3c72)' : '3px solid transparent',
            color: activeTab === 'list' ? 'var(--accent-color, #1e3c72)' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Facturas e Ingesta
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          style={{
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'forecast' ? '3px solid var(--accent-color, #1e3c72)' : '3px solid transparent',
            color: activeTab === 'forecast' ? 'var(--accent-color, #1e3c72)' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          📅 Proyección de Pagos / Forecast
        </button>
      </div>

      {activeTab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(320px, 100%), 3fr) 2fr', gap: '24px' }} className="responsive-invoices-grid">
          {/* Main left column: parsing + list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Upload parsing card */}
            <div className="glass-card">
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>Inteligencia DTE / Subir Facturas</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Arrastre o seleccione el archivo DTE corporativo (.xml) o PDF digital para realizar la extracción automática mediante IA (GPT-4o-mini).
              </p>
              
              <div style={{
                border: '2px dashed var(--border-subtle)',
                borderRadius: '12px',
                padding: '30px',
                textAlign: 'center',
                background: 'var(--surface-2)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease'
              }}>
                <input
                  type="file"
                  accept=".xml,.pdf,image/*"
                  onChange={handleFileUpload}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                  disabled={uploading}
                />
                
                {uploading ? (
                  <div>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🤖</div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Analizando factura comercial...</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Extrayendo montos, RUT y folios mediante Inteligencia Artificial</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📄</div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Cargar XML DTE o Factura PDF / Imagen</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Soportados: XML tributario chileno, PDF de SII o fotos legibles</span>
                  </div>
                )}
              </div>

              {/* Confirm Parsed Data Panel */}
              {parsedData && (
                <div style={{
                  marginTop: '20px',
                  background: 'rgba(30, 60, 114, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h4 style={{ margin: '0 0 16px 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    Confirmar Datos Extraídos
                    <button type="button" onClick={() => setParsedData(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--status-red)' }}>Descartar</button>
                  </h4>
                  
                  <form onSubmit={handleSaveParsedInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>RUT Proveedor</label>
                        <input
                          type="text"
                          value={parsedSupplierRut}
                          onChange={(e) => setParsedSupplierRut(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nombre Proveedor / Razón Social</label>
                        <input
                          type="text"
                          value={parsedSupplierName}
                          onChange={(e) => setParsedSupplierName(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Folio / N° Factura</label>
                        <input
                          type="text"
                          value={parsedInvoiceNum}
                          onChange={(e) => setParsedInvoiceNum(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha Emisión</label>
                        <input
                          type="date"
                          value={parsedIssueDate}
                          onChange={(e) => setParsedIssueDate(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Neto</label>
                        <input
                          type="number"
                          value={parsedNet}
                          onChange={(e) => setParsedNet(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>IVA (19%)</label>
                        <input
                          type="number"
                          value={parsedTax}
                          onChange={(e) => setParsedTax(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total</label>
                        <input
                          type="number"
                          value={parsedTotal}
                          onChange={(e) => setParsedTotal(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', fontWeight: 700 }}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: '10px', borderRadius: '8px', fontWeight: 650, marginTop: '8px' }}
                    >
                      💾 Guardar Factura e Inyectar a Proveedores
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* List panel */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>Historial de Facturas Compra</h3>
                <input
                  type="text"
                  placeholder="Filtrar facturas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="glass-input"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>Cargando facturas...</div>
              ) : filteredInvoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron facturas registradas.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <th style={{ padding: '10px 8px' }}>Folio</th>
                        <th style={{ padding: '10px 8px' }}>Proveedor</th>
                        <th style={{ padding: '10px 8px' }}>Fecha</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>Documentado</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv) => {
                        const totalChequed = (inv.payment_documents || []).reduce((acc, curr) => acc + curr.amount, 0);
                        const isSelected = selectedInvoice?.id === inv.id;
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => setSelectedInvoice(inv)}
                            style={{
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(30, 60, 114, 0.05)' : 'transparent',
                              fontSize: '0.85rem'
                            }}
                          >
                            <td style={{ padding: '12px 8px', fontWeight: 700 }}>#{inv.invoice_number}</td>
                            <td style={{ padding: '12px 8px' }}>
                              <div style={{ fontWeight: 600 }}>{inv.supplier_name}</div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RUT: {inv.supplier_rut}</span>
                            </td>
                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{inv.issue_date}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total_amount)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                              <span style={{
                                color: totalChequed >= inv.total_amount ? 'var(--status-green)' : 'var(--status-orange)',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}>
                                {fmt(totalChequed)} / {Math.round((totalChequed / inv.total_amount) * 100)}%
                              </span>
                            </td>
                            <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                              {inv.status === 'PAID' && <span style={{ color: 'var(--status-green)', fontWeight: 700 }}>Pagado</span>}
                              {inv.status === 'PARTIAL' && <span style={{ color: 'var(--status-orange)', fontWeight: 700 }}>Fraccionado</span>}
                              {inv.status === 'PENDING' && <span style={{ color: 'var(--status-red)', fontWeight: 700 }}>Pendiente</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right column: split payment details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-card" style={{
              position: 'sticky',
              top: '20px'
            }}>
              {selectedInvoice ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Factura Folio #{selectedInvoice.invoice_number}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Proveedor: {selectedInvoice.supplier_name}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteInvoice(selectedInvoice.id)}
                      style={{
                        background: 'transparent',
                        color: 'var(--status-red)',
                        border: '1px solid var(--status-red)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Eliminar Factura
                    </button>
                  </div>

                  {/* Summary progress bar */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                      <span>Monto Total: <strong>{fmt(selectedInvoice.total_amount)}</strong></span>
                      <span>Restante: <strong style={{ color: 'var(--status-red)' }}>{fmt(getRemainingToDocument(selectedInvoice))}</strong></span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        background: 'var(--accent-color, #1e3c72)',
                        width: `${Math.min(100, Math.round(((selectedInvoice.total_amount - getRemainingToDocument(selectedInvoice)) / selectedInvoice.total_amount) * 100))}%`
                      }} />
                    </div>
                  </div>

                  {/* Registered payment documents */}
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 750 }}>Documentos / Cheques Asociados ({selectedInvoice.payment_documents?.length || 0})</h4>
                  
                  {!selectedInvoice.payment_documents || selectedInvoice.payment_documents.length === 0 ? (
                    <div style={{ padding: '16px', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '20px' }}>
                      No hay ningún cheque o transferencia ingresado para esta factura.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      {selectedInvoice.payment_documents?.map(doc => (
                        <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', background: 'var(--bg-body, #fafafa)', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ fontWeight: 700 }}>{doc.document_type} {doc.document_number ? `N° ${doc.document_number}` : ''}</span>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Vec. {doc.payment_date}</div>
                            <div style={{ marginTop: '4px' }}>
                              Estado: {getStatusLabelDoc(doc.status)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '4px' }}>{fmt(doc.amount)}</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {doc.status === 'PENDING' && (
                                <>
                                  <button onClick={() => handleUpdateDocStatus(doc.id, 'PAID')} style={{ fontSize: '0.7rem', background: 'rgba(39, 174, 96, 0.1)', color: 'var(--status-green)', border: 'none', padding: '2px 4px', borderRadius: '2px', cursor: 'pointer' }}>Cobrado</button>
                                  <button onClick={() => handleUpdateDocStatus(doc.id, 'BOUNCED')} style={{ fontSize: '0.7rem', background: 'rgba(235, 87, 87, 0.1)', color: 'var(--status-red)', border: 'none', padding: '2px 4px', borderRadius: '2px', cursor: 'pointer' }}>Protestado</button>
                                </>
                              )}
                              {doc.status !== 'PENDING' && (
                                <button onClick={() => handleUpdateDocStatus(doc.id, 'PENDING')} style={{ fontSize: '0.7rem', background: 'var(--border-color)', border: 'none', padding: '2px 4px', borderRadius: '2px', cursor: 'pointer' }}>Pendiente</button>
                              )}
                              <button onClick={() => handleDeleteDoc(doc.id)} style={{ fontSize: '0.7rem', background: 'silver', border: 'none', padding: '2px 4px', borderRadius: '2px', color: '#fff', cursor: 'pointer' }}>🗑</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add payment document form */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700 }}>Programar Nuevo Pago (Cheque/Transferencia)</h4>
                    <form onSubmit={handleAddPaymentDocument} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tipo</label>
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)'}}
                          >
                            <option value="CHEQUE">Cheque al Día/Fecha</option>
                            <option value="TRANSFER">Transferencia</option>
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="OTRO">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>N° Documento/Cheque</label>
                          <input
                            type="text"
                            placeholder="Ej. Cheque 43109"
                            value={docNum}
                            onChange={(e) => setDocNum(e.target.value)}
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)'}}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto</label>
                          <input
                            type="number"
                            placeholder="Monto $"
                            value={docAmount}
                            onChange={(e) => setDocAmount(e.target.value)}
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)'}}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vencimiento / Cobro</label>
                          <input
                            type="date"
                            value={docDate}
                            onChange={(e) => setDocDate(e.target.value)}
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)'}}
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={addingDoc}
                        className="btn btn-primary"
                        style={{ padding: '8px', borderRadius: '6px', width: '100%', marginTop: '6px', fontSize: '0.85rem' }}
                      >
                        {addingDoc ? 'Guardando...' : 'Añadir Cheque/Documento'}
                      </button>
                    </form>
                  </div>

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  👈 Seleccione una factura de compra en el listado para asignar documentos de pago y documentar cheques.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'forecast' && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>📅 Planificador de Caja / Proyección de Cobros</h3>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Estatuto de caja futuro para los cheques y cobros documentados. Revisa los días con menor carga financiera para programar tus futuros cheques de manera segura.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {forecast.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', border: '2px dashed var(--border-subtle)', borderRadius: '12px' }}>
                No existen documentos pendientes de cobro para realizar proyección.
              </div>
            ) : (
              forecast.map((day) => {
                const isHeavy = day.total_amount > 500000; // heavy alert flag
                return (
                  <div
                    key={day.payment_date}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: isHeavy ? '1px solid rgba(235, 87, 87, 0.3)' : '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      background: isHeavy ? 'rgba(235, 87, 87, 0.08)' : 'var(--surface-2)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📅 {new Date(day.payment_date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        {isHeavy && (
                          <span style={{
                            background: 'var(--status-red)',
                            color: '#fff',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontWeight: 700
                          }}>
                            Alta Carga
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                        {day.documents.map((doc, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '0.75rem',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid var(--border-subtle)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            🚪 {doc.supplier_name} - {doc.document_type} #{doc.document_number || 'S/N'}: <strong>{fmt(doc.amount)}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Monto Acumulado el Día</span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isHeavy ? 'var(--status-red)' : 'var(--text-primary)' }}>
                        {fmt(day.total_amount)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{
            marginTop: '30px',
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(234, 179, 8, 0.05)',
            border: '1px dashed var(--secondary)',
            fontSize: '0.85rem',
            color: 'var(--secondary)'
          }}>
            💡 <strong>Consejo del Planificador Financiero:</strong> Si necesitas programar nuevos cheques, busca fechas que no figuren en la lista de arriba, o aquellas con menores montos acumulados. Esto protege el capital de trabajo de tu taller evitando sobregiros en la cuenta corriente.
          </div>
        </div>
      )}
    </div>
  );
}
