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
      // Mock data for UI demonstration
      setInvoices([
        { id: 101, work_order: 'OT-1', total_amount: '150.00', status: 'DRAFT', date: '2023-10-25' },
        { id: 102, work_order: 'OT-2', total_amount: '320.50', status: 'PAID', date: '2023-10-24' },
        { id: 103, work_order: 'OT-3', total_amount: '85.00', status: 'SENT', date: '2023-10-26' },
      ]);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar finanzas.");
      setLoading(false);
    }
  };

  const handlePayment = (id, method) => {
    setInvoices(invoices.map(i => 
      i.id === id ? { ...i, status: 'PAID' } : i
    ));
    alert(`Pago de factura #${id} registrado vía ${method}`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando finanzas...</div>;

  return (
    <div className="work-orders">
      <div className="header" style={{ marginBottom: '2rem' }}>
        <h2>💰 Gestión Financiera</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Ingresos del Mes:</span>
            <span style={{ fontSize: '1.2rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>$3,450.00</span>
          </div>
        </div>
      </div>

      <div className="grid-container">
        {invoices.map(invoice => (
          <div key={invoice.id} className="glass-card" style={{ position: 'relative' }}>
            <div className="ot-header">
              <h3>Factura #{invoice.id}</h3>
              <span className={`badge ${invoice.status === 'PAID' ? 'green' : invoice.status === 'SENT' ? 'yellow' : 'pending'}`}>
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
              {invoice.status !== 'PAID' && (
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
