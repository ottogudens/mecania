import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

export default function ClientPortalBlog() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    id: null,
    title: '',
    content: '',
    author: 'Equipo MecanIA',
    image_url: '',
    is_published: true
  });

  useEffect(() => {
    fetchBlogs();
  }, []);

  const fetchBlogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/operations/portal-blogs/');
      setBlogs(res.data);
    } catch (err) {
      addToast('Error al cargar artículos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (blog = null) => {
    if (blog) {
      setFormData({
        id: blog.id,
        title: blog.title,
        content: blog.content,
        author: blog.author,
        image_url: blog.image_url || '',
        is_published: blog.is_published
      });
    } else {
      setFormData({
        id: null,
        title: '',
        content: '',
        author: 'Equipo MecanIA',
        image_url: '',
        is_published: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await axios.put(`/api/operations/portal-blogs/${formData.id}/`, formData);
        addToast('Artículo actualizado exitosamente', 'success');
      } else {
        await axios.post('/api/operations/portal-blogs/', formData);
        addToast('Artículo publicado exitosamente', 'success');
      }
      setIsModalOpen(false);
      fetchBlogs();
    } catch (err) {
      addToast('Error al guardar el artículo', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este artículo?")) {
      try {
        await axios.delete(`/api/operations/portal-blogs/${id}/`);
        addToast('Artículo eliminado', 'success');
        fetchBlogs();
      } catch (err) {
        addToast('Error al eliminar', 'error');
      }
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="panel animate-fade-in" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Blog de Mecánica (Artículos)</h2>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Escribir Artículo</button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Autor</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {blogs.length === 0 ? (
            <tr><td colSpan="4" className="text-center">No hay artículos publicados.</td></tr>
          ) : (
            blogs.map(blog => (
              <tr key={blog.id}>
                <td>{blog.title}</td>
                <td>{blog.author}</td>
                <td>
                  <span className={`badge ${blog.is_published ? 'badge-success' : 'badge-warning'}`}>
                    {blog.is_published ? 'Publicado' : 'Borrador'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(blog)}>Editar</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)' }} onClick={() => handleDelete(blog.id)}>Eliminar</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {isModalOpen && (
        <div className="modal show" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '700px', width: '100%' }}>
            <div className="modal-header">
              <h3>{formData.id ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
              <button className="close-btn" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Título del Artículo</label>
                  <input type="text" className="form-control" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label>Autor</label>
                    <input type="text" className="form-control" required value={formData.author} onChange={e => setFormData({...formData, author: e.target.value})} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>URL de Imagen Portada (Opcional)</label>
                    <input type="url" className="form-control" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Contenido del Artículo (Puedes usar HTML/Markdown)</label>
                  <textarea className="form-control" required rows="10" value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} style={{ fontFamily: 'monospace' }}></textarea>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isPublished" checked={formData.is_published} onChange={e => setFormData({...formData, is_published: e.target.checked})} />
                  <label htmlFor="isPublished" style={{ margin: 0 }}>Publicar inmediatamente</label>
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
