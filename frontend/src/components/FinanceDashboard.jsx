import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const FinanceDashboard = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/finance/invoices/', {
        headers: { Authorization: `Token ${token}` }
      });
      setInvoices(response.data.results || response.data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar finanzas.");
      setLoading(false);
    }
  };

  const handlePayment = async (id, method) => {
    try {
      const methodMap = { 'Efectivo': 'CASH', 'Tarjeta': 'CARD', 'Transferencia': 'TRANSFER' };
      const apiMethod = methodMap[method] || 'CASH';
      const token = localStorage.getItem('token');
      const invoice = invoices.find(i => i.id === id);
      
      await axios.post(`/api/finance/pos/charge/`, {
        invoice_id: id,
        amount: invoice.total_amount,
        payment_method: apiMethod
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      
      // Update UI optimistically or refetch
      fetchInvoices();
      toast({ title: 'Pago Exitoso', message: `Pago de factura #${id} registrado vía ${method}`, type: 'success' });
    } catch (err) {
      console.error("Error procesando pago:", err);
      toast({ title: 'Error', message: 'Hubo un error al registrar el pago.', type: 'error' });
    }
  };

  const downloadPDF = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/finance/invoices/${id}/pdf/`, { 
        headers: { Authorization: `Token ${token}` },
        responseType: 'blob' 
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err) {
      console.error("PDF Error:", err);
      toast({ title: 'Error', message: 'Error al generar PDF', type: 'error' });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando finanzas...</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>💰 Gestión Financiera</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Facturado:</span>
            <span style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 'bold' }}>
              ${invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Analytics Charts */}
      {invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="glass-card" style={{ padding: '1rem', height: '300px' }}>
            <h3 style={{ marginBottom: '1rem' }}>Estado de Facturas</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Pagado', value: invoices.filter(i => i.status === 'PAID').length },
                    { name: 'Pendiente', value: invoices.filter(i => ['DRAFT', 'SENT', 'PARTIALLY_PAID'].includes(i.status)).length },
                    { name: 'Cancelado', value: invoices.filter(i => ['CANCELLED', 'VOID'].includes(i.status)).length }
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}
                  dataKey="value"
                >
                  <Cell key="cell-0" fill="var(--status-green)" />
                  <Cell key="cell-1" fill="var(--status-yellow)" />
                  <Cell key="cell-2" fill="var(--status-red)" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="glass-card" style={{ padding: '1rem', height: '300px' }}>
            <h3 style={{ marginBottom: '1rem' }}>Facturación por OT / Venta</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invoices.slice(0, 10).map(i => ({ name: `Fact #${i.id}`, total: parseFloat(i.total_amount) }))}>
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: 'var(--bg-card)', border: 'none', borderRadius: '8px' }} />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid-container">
        {invoices.map(invoice => (
          <div key={invoice.id} className="glass-card" style={{ position: 'relative' }}>
            <div className="ot-header">
              <h3>Factura #{invoice.id}</h3>
              <span className={`badge ${invoice.status || 'PENDING'}`}>
                {invoice.status?.replace('_', ' ') || 'PENDIENTE'}
              </span>
            </div>
            <p style={{ margin: '0.5rem 0', color: 'var(--text-secondary)' }}>
              Asociada a: <strong style={{ color: '#fff' }}>{invoice.work_order || 'Venta de Mostrador'}</strong>
            </p>
            
            <div style={{ margin: '1rem 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(invoice.total_amount)}
            </div>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1, padding: '0.5rem' }}
                onClick={() => downloadPDF(invoice.id)}
              >
                Ver PDF
              </button>
              {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                <>
                  <button 
                    className="btn btn-success" 
                    style={{ flex: 1, padding: '0.5rem' }}
                    onClick={() => handlePayment(invoice.id, 'Efectivo')}
                  >
                    💵 Pago
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '0.5rem' }}
                    onClick={() => handlePayment(invoice.id, 'Tarjeta')}
                  >
                    💳 Tarjeta
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FinanceDashboard;
