import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

export default function ClientPortalOffers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    id: null,
    title: '',
    description: '',
    image: null,
    valid_until: '',
    is_active: true
  });

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/operations/portal-offers/');
      setOffers(res.data.results || res.data);
    } catch (err) {
      addToast('Error al cargar ofertas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (offer = null) => {
    if (offer) {
      setFormData({
        id: offer.id,
        title: offer.title,
        description: offer.description,
        image: null,
        valid_until: offer.valid_until || '',
        is_active: offer.is_active
      });
    } else {
      setFormData({
        id: null,
        title: '',
        description: '',
        image: null,
        valid_until: '',
        is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const uploadData = new FormData();
    uploadData.append('title', formData.title);
    uploadData.append('description', formData.description);
    if (formData.valid_until) uploadData.append('valid_until', formData.valid_until);
    uploadData.append('is_active', formData.is_active);
    if (formData.image) {
      uploadData.append('image', formData.image);
    }

    try {
      if (formData.id) {
        await axios.patch(`/api/operations/portal-offers/${formData.id}/`, uploadData);
        addToast('Oferta actualizada exitosamente', 'success');
      } else {
        await axios.post('/api/operations/portal-offers/', uploadData);
        addToast('Oferta generada exitosamente', 'success');
      }
      setIsModalOpen(false);
      fetchOffers();
    } catch (err) {
      addToast('Error al guardar la oferta', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar esta oferta?")) {
      try {
        await axios.delete(`/api/operations/portal-offers/${id}/`);
        addToast('Oferta eliminada', 'success');
        fetchOffers();
      } catch (err) {
        addToast('Error al eliminar', 'error');
      }
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="panel animate-fade-in" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Gestión de Ofertas y Promociones</h2>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Nueva Oferta</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {offers.length === 0 ? <p>No hay ofertas creadas.</p> : offers.map(offer => (
          <div key={offer.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            {offer.image ? (
              <img src={offer.image} alt={offer.title} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' }} />
            ) : (
              <div style={{ width: '100%', height: '150px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>🖼 Sin Imagen</div>
            )}
            <div style={{ padding: '1rem', flex: 1 }}>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{offer.title}</h3>
              <p style={{ fontSize: '0.85rem', color: '#666', minHeight: '3rem' }}>{offer.description}</p>
              <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                <span className={`badge ${offer.is_active ? 'badge-success' : 'badge-danger'}`}>
                  {offer.is_active ? 'Activa' : 'Inactiva'}
                </span>
                {offer.valid_until && <span style={{ marginLeft: '10px' }}>Vence: {offer.valid_until}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenModal(offer)}>Editar</button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleDelete(offer.id)}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{formData.id ? 'Editar Oferta' : 'Nueva Oferta'}</h3>
              <button type="button" className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Título de la Oferta</label>
                  <input type="text" className="input-field" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="input-group">
                  <label className="input-label">Descripción</label>
                  <textarea className="input-field" required rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                </div>
                <div className="input-group">
                  <label className="input-label">Imagen Promocional (Opcional)</label>
                  <input type="file" accept="image/*" className="input-field" onChange={e => setFormData({...formData, image: e.target.files[0]})} />
                </div>
                <div className="input-group">
                  <label className="input-label">Válida hasta (Opcional)</label>
                  <input type="date" className="input-field" value={formData.valid_until} onChange={e => setFormData({...formData, valid_until: e.target.value})} />
                </div>
                <div className="input-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isActive" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                  <label className="input-label" htmlFor="isActive" style={{ margin: 0 }}>Oferta Activa</label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={handleCloseModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
