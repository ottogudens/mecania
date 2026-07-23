import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const authHeader = () => ({ Authorization: `Token ${localStorage.getItem('token')}` });

const CATEGORIES = [
  { id: 'manual', label: '📖 Manual de Taller / Reparación' },
  { id: 'filters', label: '🛢️ Catálogo de Filtros y Fluidos' },
  { id: 'diagram', label: '⚡ Diagrama Eléctrico / Pinout' },
  { id: 'torques', label: '🔧 Torques y Especificaciones Técnicas' },
  { id: 'maintenance', label: '🗓️ Guías de Mantenimiento / Pautas' },
  { id: 'other', label: '📄 Otra Documentación Técnica' }
];

export default function TechnicalKnowledgeManager() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    title: '',
    category: 'manual',
    make: '',
    model: '',
    year_start: '',
    year_end: '',
    engine: '',
    tags: '',
    content_text: '',
    file_data: '',
    file_name: '',
    is_active: true
  });

  const toast = useToast();

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let url = '/api/operations/technical-knowledge/';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedCategory) params.append('category', selectedCategory);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await axios.get(url, { headers: authHeader() });
      setDocuments(res.data.results || res.data);
    } catch (err) {
      console.error('Error al cargar base de conocimiento:', err);
      toast({ title: 'Error', message: 'No se pudo cargar la base de conocimiento técnica.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedCategory]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDocuments();
  };

  const handleOpenModal = (doc = null) => {
    if (doc) {
      setEditingDoc(doc);
      setFormData({
        title: doc.title || '',
        category: doc.category || 'manual',
        make: doc.make || '',
        model: doc.model || '',
        year_start: doc.year_start || '',
        year_end: doc.year_end || '',
        engine: doc.engine || '',
        tags: doc.tags || '',
        content_text: doc.content_text || '',
        file_data: doc.file_data || '',
        file_name: doc.file_name || '',
        is_active: doc.is_active ?? true
      });
    } else {
      setEditingDoc(null);
      setFormData({
        title: '',
        category: 'manual',
        make: '',
        model: '',
        year_start: '',
        year_end: '',
        engine: '',
        tags: '',
        content_text: '',
        file_data: '',
        file_name: '',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({
        ...prev,
        file_data: event.target.result,
        file_name: file.name
      }));
      toast({ title: 'Archivo Cargado', message: `Adjunto ${file.name} listo para guardar.`, type: 'info' });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content_text.trim()) {
      toast({ title: 'Atención', message: 'El título y el contenido técnico son obligatorios.', type: 'warning' });
      return;
    }

    try {
      const payload = {
        ...formData,
        year_start: formData.year_start ? parseInt(formData.year_start) : null,
        year_end: formData.year_end ? parseInt(formData.year_end) : null,
      };

      if (editingDoc) {
        await axios.put(`/api/operations/technical-knowledge/${editingDoc.id}/`, payload, { headers: authHeader() });
        toast({ title: 'Actualizado', message: 'Documento técnico actualizado correctamente.', type: 'success' });
      } else {
        await axios.post('/api/operations/technical-knowledge/', payload, { headers: authHeader() });
        toast({ title: 'Creado', message: 'Nuevo documento guardado en la base de conocimiento IA.', type: 'success' });
      }

      setShowModal(false);
      fetchDocuments();
    } catch (err) {
      console.error('Error al guardar documento técnico:', err);
      toast({ title: 'Error', message: 'No se pudo guardar la información técnica.', type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este documento técnico de la base de datos de la IA?')) return;
    try {
      await axios.delete(`/api/operations/technical-knowledge/${id}/`, { headers: authHeader() });
      toast({ title: 'Eliminado', message: 'Documento removido correctamente.', type: 'success' });
      fetchDocuments();
    } catch (err) {
      console.error('Error al eliminar:', err);
      toast({ title: 'Error', message: 'No se pudo eliminar el documento.', type: 'error' });
    }
  };

  const handleToggleActive = async (doc) => {
    try {
      await axios.patch(`/api/operations/technical-knowledge/${doc.id}/`, { is_active: !doc.is_active }, { headers: authHeader() });
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, is_active: !doc.is_active } : d));
      toast({ 
        title: !doc.is_active ? 'Documento Activado' : 'Documento Pausado', 
        message: !doc.is_active ? 'La IA usará esta información para sus respuestas.' : 'La IA omitirá esta información.', 
        type: 'info' 
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* HEADER & FILTROS */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>🧠 Base de Conocimiento IA (Información Técnica)</h2>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Carga manuales de taller, diagramas eléctricos, catálogos de filtros y fluidos para alimentar el motor de IA del taller.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            ➕ Agregar Documento / Manual
          </button>
        </div>

        {/* BUSCADOR Y CATEGORÍAS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Buscar por título, contenido, marca, modelo, motor o código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-outline">🔍 Buscar</button>
          </form>

          <select
            className="input-field"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{ minWidth: '220px' }}
          >
            <option value="">Todas las Categorías</option>
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTA DE DOCUMENTOS */}
      {loading ? (
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Cargando documentos de conocimiento técnico...
        </div>
      ) : documents.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📚</div>
          <h3 style={{ margin: 0 }}>No hay información técnica cargada aún</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>
            Comienza a subir manuales, diagramas o catálogos para que el Agente IA de WhatsApp responda con máxima precisión.
          </p>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            ➕ Cargar Primer Manual / Documento
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {documents.map(doc => (
            <div 
              key={doc.id} 
              className="glass-card" 
              style={{ 
                padding: '1.25rem', 
                display: 'flex', 
                flexDirection: 'column', 
                justify: 'space-between',
                borderLeft: doc.is_active ? '4px solid var(--accent-color)' : '4px solid var(--border-color)',
                opacity: doc.is_active ? 1 : 0.65
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span className="badge green" style={{ fontSize: '0.75rem' }}>
                    {doc.category_display || doc.category}
                  </span>
                  <button 
                    className={`btn btn-sm ${doc.is_active ? 'btn-ghost' : 'btn-outline'}`}
                    onClick={() => handleToggleActive(doc)}
                    title={doc.is_active ? 'Desactivar para la IA' : 'Activar para la IA'}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    {doc.is_active ? '🟢 Activo en IA' : '⚪ Inactivo'}
                  </button>
                </div>

                <h3 style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '1.1rem', lineHeight: '1.3' }}>{doc.title}</h3>

                {(doc.make || doc.model || doc.engine) && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    🚗 {doc.make || ''} {doc.model || ''} {doc.engine ? `(${doc.engine})` : ''} {doc.year_start ? `[${doc.year_start}-${doc.year_end || 'Presente'}]` : ''}
                  </div>
                )}

                <p style={{ 
                  fontSize: '0.88rem', 
                  color: 'var(--text-muted)', 
                  margin: '0.5rem 0 1rem 0', 
                  display: '-webkit-box', 
                  WebkitLineClamp: 3, 
                  WebkitBoxOrient: 'vertical', 
                  overflow: 'hidden' 
                }}>
                  {doc.content_text}
                </p>

                {doc.tags && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1rem' }}>
                    {doc.tags.split(',').map((tag, i) => (
                      <span key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.72rem' }}>
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                {doc.file_data ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--status-green)' }}>📎 {doc.file_name || 'Archivo adjunto'}</span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>✍️ Texto directo</span>
                )}

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(doc)}>✏️ Editar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(doc.id)} style={{ color: 'var(--status-red)' }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CREAR / EDITAR DOCUMENTO */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass-card" style={{ maxWidth: '680px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>{editingDoc ? '✏️ Editar Información Técnica' : '➕ Cargar Documento Técnico'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className="input-group">
                <label className="input-label">Título del Documento o Manual *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej: Especificaciones de Filtros y Aceite - Hyundai Tucson 2.0 CRDi"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Categoría Técnica</label>
                  <select
                    className="input-field"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Motor (Opcional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej: 2.0 D4HA / 1.6 Gamma"
                    value={formData.engine}
                    onChange={e => setFormData({ ...formData, engine: e.target.value })}
                  />
                </div>
              </div>

              {/* COMPATIBILIDAD VEHÍCULO */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="input-group">
                  <label className="input-label">Marca</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej. Hyundai"
                    value={formData.make}
                    onChange={e => setFormData({ ...formData, make: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Modelo</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej. Tucson"
                    value={formData.model}
                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Año Desde</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="2016"
                    value={formData.year_start}
                    onChange={e => setFormData({ ...formData, year_start: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Año Hasta</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="2021"
                    value={formData.year_end}
                    onChange={e => setFormData({ ...formData, year_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Etiquetas o Palabras Clave (Separadas por coma)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej: aceite 5w30, mann hu711/5x, torque culata 45nm, pinout ecu"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Contenido Técnico / Texto Legible para la IA *</label>
                <textarea
                  className="input-field"
                  rows={6}
                  placeholder="Escribe o pega aquí la información técnica detallada (ej: Aceite recomendado 5W-30 C3 (5.3L). Filtro Aceite Mann HU 711/5 x. Filtro Aire C 26 017. Torque de pernos culata: Etapa 1: 30Nm, Etapa 2: 90°...)"
                  value={formData.content_text}
                  onChange={e => setFormData({ ...formData, content_text: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Adjuntar Archivo (PDF, Imagen del Diagrama, etc.)</label>
                <input
                  type="file"
                  className="input-field"
                  accept="application/pdf,image/*"
                  onChange={handleFileUpload}
                />
                {formData.file_name && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--status-green)', marginTop: '0.3rem' }}>
                    📎 Archivo cargado: {formData.file_name}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Habilitar inmediatamente para consultas de la IA</span>
                </label>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">💾 Guardar Documento</button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
