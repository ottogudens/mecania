import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function SuppliersManager() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Form State
  const [editingId, setEditingId] = useState(null);
  const [rut, setRut] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toastMsg, setToastMsg] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/finance/suppliers/');
      setSuppliers(res.data.results || res.data);
    } catch (err) {
      console.error(err);
      showToast('Error al cargar proveedores.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Clean form
  const resetForm = () => {
    setEditingId(null);
    setRut('');
    setCompanyName('');
    setEmail('');
    setContactName('');
    setContactPhone('');
    setFormOpen(false);
  };

  const handleEdit = (supplier) => {
    setEditingId(supplier.id);
    setRut(supplier.rut);
    setCompanyName(supplier.company_name);
    setEmail(supplier.email || '');
    setContactName(supplier.contact_name || '');
    setContactPhone(supplier.contact_phone || '');
    setFormOpen(true);
  };

  const formatRut = (value) => {
    // Basic Chilean RUT formatting logic
    let clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length <= 1) return clean;
    
    let body = clean.slice(0, -1);
    let dv = clean.slice(-1).toUpperCase();
    
    // add dots and hyphen
    let formatted = '';
    while (body.length > 3) {
      formatted = '.' + body.slice(-3) + formatted;
      body = body.slice(0, -3);
    }
    return body + formatted + '-' + dv;
  };

  const handleRutChange = (e) => {
    setRut(formatRut(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rut.trim() || !companyName.trim()) {
      showToast('Los campos RUT y Razón Social son requeridos.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        rut: rut.trim(),
        company_name: companyName.trim(),
        email: email.trim() || null,
        contact_name: contactName.trim() || '',
        contact_phone: contactPhone.trim() || '',
      };

      if (editingId) {
        await axios.put(`/api/finance/suppliers/${editingId}/`, payload);
        showToast('Proveedor actualizado correctamente.');
      } else {
        await axios.post('/api/finance/suppliers/', payload);
        showToast('Proveedor registrado correctamente.');
      }
      resetForm();
      loadSuppliers();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || err.response?.data?.rut?.[0] || 'Error al guardar proveedor.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este proveedor? Se eliminarán todas las facturas asociadas.')) return;
    try {
      await axios.delete(`/api/finance/suppliers/${id}/`);
      showToast('Proveedor eliminado.');
      loadSuppliers();
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar proveedor.', 'error');
    }
  };

  // Filter local list
  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(search.toLowerCase()) ||
    s.rut.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_name && s.contact_name.toLowerCase().includes(search.toLowerCase()))
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

      {/* Header controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ position: 'relative', width: '320px' }}>
          <input
            type="text"
            placeholder="Buscar por Nombre, RUT o Vendedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 10px 10px 36px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              outline: 'none',
              fontSize: '0.9rem'
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
        </div>
        <button
          onClick={() => { resetForm(); setFormOpen(true); }}
          className="btn btn-primary"
          style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
        >
          + Agregar Proveedor
        </button>
      </div>

      {formOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #fff)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
            position: 'relative'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: 700 }}>
              {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h3>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: '4px', color: 'var(--text-muted)' }}>RUT Empresa</label>
                  <input
                    type="text"
                    placeholder="12.345.678-9"
                    value={rut}
                    onChange={handleRutChange}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: '4px', color: 'var(--text-muted)' }}>Razón Social / Nombre</label>
                  <input
                    type="text"
                    placeholder="Ej. Distribuidora Repuestos SpA"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: '4px', color: 'var(--text-muted)' }}>Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="proveedor@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: '4px', color: 'var(--text-muted)' }}>Vendedor / Contacto</label>
                  <input
                    type="text"
                    placeholder="Nombre vendedor"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 650, marginBottom: '4px', color: 'var(--text-muted)' }}>Teléfono Vendedor</label>
                  <input
                    type="text"
                    placeholder="+56912345678"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-ghost"
                  style={{ padding: '10px 20px', borderRadius: '8px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
                >
                  {submitting ? 'Guardando...' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main suppliers list */}
      <div className="card" style={{
        background: 'var(--bg-card, #fff)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando catálogo...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '2px dashed var(--border-color)', borderRadius: '12px' }}>
            No se encontraron proveedores.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {filteredSuppliers.map((supplier) => (
              <div
                key={supplier.id}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  background: 'var(--bg-body, #fafafa)',
                  transition: 'transform 0.2s ease',
                  position: 'relative'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>
                    {supplier.rut}
                  </span>
                  <h4 style={{ margin: '8px 0 2px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)' }}>
                    {supplier.company_name}
                  </h4>
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`} style={{ fontSize: '0.85rem', color: 'var(--accent-color, #1e3c72)', textDecoration: 'none' }}>
                      {supplier.email}
                    </a>
                  )}
                </div>

                <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '10px', marginTop: 'auto' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>Contacto Comercial:</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 650 }}>{supplier.contact_name || 'No especificado'}</div>
                  {supplier.contact_phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{supplier.contact_phone}</span>
                      <a
                        href={`https://wa.me/${supplier.contact_phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          background: '#25D366',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textDecoration: 'none',
                          fontWeight: 700
                        }}
                      >
                        WhatsApp ↗
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <button
                    onClick={() => handleEdit(supplier)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(supplier.id)}
                    className="btn btn-sm"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'transparent', color: 'var(--status-red)', border: '1px solid var(--status-red)' }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
