import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';
import { useToast } from './Toast';

const FinancialReports = () => {
  const [invoices, setInvoices] = useState([]);
  const [cashMovements, setCashMovements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Token ${token}` } };
      
      const [invRes, cmRes, payRes] = await Promise.all([
        axios.get('/api/finance/invoices/', config),
        axios.get('/api/finance/cash-movements/', config),
        axios.get('/api/finance/supplier-payments/', config)
      ]);
      
      setInvoices(invRes.data.results || invRes.data);
      setCashMovements(cmRes.data.results || cmRes.data);
      setPayments(payRes.data.results || payRes.data);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudieron cargar los datos financieros', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Generando reportes financieros...</div>;

  // AGGREGATIONS
  // 1. Ingresos y Egresos (Globales del mes/año actual para simplificar)
  const totalInvoiced = invoices.filter(i => i.status === 'PAID').reduce((acc, i) => acc + parseFloat(i.total_amount), 0);
  const pendingInvoiced = invoices.reduce((acc, i) => acc + (i.status !== 'PAID' && i.status !== 'CANCELLED' ? parseFloat(i.total_amount) : 0), 0);
  
  const totalCashIn = cashMovements.filter(m => m.movement_type === 'IN').reduce((acc, m) => acc + parseFloat(m.amount), 0);
  const totalCashOut = cashMovements.filter(m => m.movement_type === 'OUT').reduce((acc, m) => acc + parseFloat(m.amount), 0);
  
  const supplierPaid = payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + parseFloat(p.amount), 0);
  
  // Total Ingresos = Facturado pagado + Movimientos de caja IN (excluyendo ventas, pero lo sumamos todo para el flujo)
  const totalIncome = totalInvoiced + totalCashIn;
  // Total Egresos = Pagos a proveedores completados + Movimientos de caja OUT
  const totalExpense = supplierPaid + totalCashOut;
  const netProfit = totalIncome - totalExpense;

  // Chart: Distribución Egresos
  const expenseData = [
    { name: 'Proveedores', value: supplierPaid },
    { name: 'Gastos de Caja', value: totalCashOut }
  ].filter(d => d.value > 0);

  // Chart: Flujo por Medio de Pago (Facturas pagadas)
  const paymentMethods = invoices.reduce((acc, inv) => {
    // Si la factura está pagada, asumimos que tiene pagos. Extraemos si es posible.
    // Simplifying: just using a random dist if logic isn't there, or map status.
    if (inv.status === 'PAID') {
      acc['Facturado'] = (acc['Facturado'] || 0) + parseFloat(inv.total_amount);
    }
    return acc;
  }, {});

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Resumen Global */}
      <h3 style={{ marginBottom: 0 }}>📊 Resumen Financiero Corporativo</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ borderLeft: '4px solid #10b981', padding: '1.5rem' }}>
           <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Ingresos Acumulados</span>
           <h2 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#10b981' }}>{formatCurrency(totalIncome)}</h2>
           <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Facturas pagadas + Entradas de caja</span>
        </div>
        <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', padding: '1.5rem' }}>
           <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Egresos Acumulados</span>
           <h2 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#ef4444' }}>{formatCurrency(totalExpense)}</h2>
           <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Proveedores + Salidas de caja</span>
        </div>
        <div className="glass-card" style={{ borderLeft: `4px solid ${netProfit >= 0 ? '#3b82f6' : '#f59e0b'}`, padding: '1.5rem' }}>
           <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Flujo Neto (Ganancia / Pérdida)</span>
           <h2 style={{ fontSize: '2rem', margin: '0.5rem 0', color: netProfit >= 0 ? '#3b82f6' : '#f59e0b' }}>
             {formatCurrency(netProfit)}
           </h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {/* Distribución de Egresos */}
        <div className="glass-card" style={{ height: '350px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h4>Distribución de Egresos</h4>
          <div style={{ flex: 1, minHeight: 0 }}>
            {expenseData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    dataKey="value"
                    paddingAngle={5}
                  >
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    Sin egresos registrados
                </div>
            )}
          </div>
        </div>

        {/* Facturación y Cobranza */}
        <div className="glass-card" style={{ height: '350px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h4>Estado de Cuentas por Cobrar (Facturación)</h4>
          <div style={{ flex: 1, minHeight: 0, marginTop: '2rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#10b981' }}>Recaudado (Pagado)</span>
                <span>{formatCurrency(totalInvoiced)}</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', height: '10px', borderRadius: '5px' }}>
                <div style={{ width: `${(totalInvoiced / (totalInvoiced + pendingInvoiced || 1)) * 100}%`, backgroundColor: '#10b981', height: '100%', borderRadius: '5px' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#f59e0b' }}>Pendiente por Cobrar</span>
                <span>{formatCurrency(pendingInvoiced)}</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', height: '10px', borderRadius: '5px' }}>
                <div style={{ width: `${(pendingInvoiced / (totalInvoiced + pendingInvoiced || 1)) * 100}%`, backgroundColor: '#f59e0b', height: '100%', borderRadius: '5px' }} />
              </div>
            </div>
            
            <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Monto total facturado vs lo que los clientes aún deben al taller.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default FinancialReports;
