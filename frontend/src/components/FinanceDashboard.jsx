import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FinanceDashboard = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await axios.get('/api/finance/invoices/');
      setInvoices(response.data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar finanzas.");
      setLoading(false);
    }
  };

  const handlePayment = async (id, method) => {
    try {
      // In English the backend expects CASH, CARD, TRANSFER
      const methodMap = { 'Efectivo': 'CASH', 'Tarjeta': 'CARD', 'Transferencia': 'TRANSFER' };
      const apiMethod = methodMap[method] || 'CASH';
      
      // Update invoice status to PAID
      await axios.patch(`/api/finance/invoices/${id}/`, { status: 'PAID' });
      
      // Record payment
      const invoice = invoices.find(i => i.id === id);
      await axios.post('/api/finance/payments/', {
        invoice: id,
        amount: invoice.total_amount,
        method: apiMethod
      });
      
      // Update UI optimistically or refetch
      setInvoices(invoices.map(i => 
        i.id === id ? { ...i, status: 'PAID' } : i
      ));
      alert(`Pago de factura #${id} registrado vía ${method}`);
    } catch (err) {
      console.error("Error procesando pago:", err);
      alert("Hubo un error al registrar el pago.");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando finanzas...</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>💰 Gestión Financiera</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Facturado:</span>
            <span style={{ fontSize: '1.2rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
              ${invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid-container">
        {invoices.map(invoice => (
          <div key={invoice.id} className="glass-card" style={{ position: 'relative' }}>
            <div className="ot-header">
              <h3>Factura #{invoice.id}</h3>
              <span className={`badge ${invoice.status === 'PAGADO' ? 'green' : invoice.status === 'ENVIADO' ? 'yellow' : 'pending'}`}>
                {invoice.status}
              </span>
            </div>
            <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>
              Asociada a: <strong style={{ color: '#fff' }}>{invoice.work_order}</strong>
            </p>
            
            <div style={{ margin: '1rem 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
              ${invoice.total_amount}
            </div>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ flex: 1, padding: '0.5rem' }}>Ver PDF</button>
              {invoice.status !== 'PAGADO' && (
                <>
                  <button 
                    className="btn green" 
                    style={{ flex: 1, padding: '0.5rem', backgroundColor: '#28a745', borderColor: '#28a745' }}
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
