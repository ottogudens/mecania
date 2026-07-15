import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

export default function ClientPortalBlog() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toast = useToast();

  const [formData, setFormData] = useState({
    id: null,
    title: '',
    content: '',
    author: 'Equipo MecanIA',
    image: null,
    is_published: true
  });

  useEffect(() => {
    fetchBlogs();
  }, []);

  const fetchBlogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/operations/portal-blogs/');
      setBlogs(res.data.results || res.data);
    } catch (err) {
      toast({ message: 'Error al cargar artículos', type: 'error' });
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
        image: null,
        is_published: blog.is_published
      });
    } else {
      setFormData({
        id: null,
        title: '',
        content: '',
        author: 'Equipo MecanIA',
        image: null,
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

    const uploadData = new FormData();
    uploadData.append('title', formData.title);
    uploadData.append('content', formData.content);
    uploadData.append('author', formData.author);
    uploadData.append('is_published', formData.is_published);
    if (formData.image) {
      uploadData.append('image', formData.image);
    }

    try {
      if (formData.id) {
        await axios.patch(`/api/operations/portal-blogs/${formData.id}/`, uploadData);
        toast({ message: 'Artículo actualizado exitosamente', type: 'success' });
      } else {
        await axios.post('/api/operations/portal-blogs/', uploadData);
        toast({ message: 'Artículo publicado exitosamente', type: 'success' });
      }
      setIsModalOpen(false);
      fetchBlogs();
    } catch (err) {
      toast({ message: 'Error al guardar el artículo', type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este artículo?")) {
      try {
        await axios.delete(`/api/operations/portal-blogs/${id}/`);
        toast({ message: 'Artículo eliminado', type: 'success' });
        fetchBlogs();
      } catch (err) {
        toast({ message: 'Error al eliminar', type: 'error' });
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
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{formData.id ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
              <button type="button" className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Título del Artículo</label>
                  <input type="text" className="input-field" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label className="input-label">Autor</label>
                    <input type="text" className="input-field" required value={formData.author} onChange={e => setFormData({...formData, author: e.target.value})} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Imagen de Portada (Opcional)</label>
                    <input type="file" accept="image/*" className="input-field" onChange={e => setFormData({...formData, image: e.target.files[0]})} />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Contenido del Artículo (Puedes usar HTML/Markdown)</label>
                  <textarea className="input-field" required rows="10" value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} style={{ fontFamily: 'monospace' }}></textarea>
                </div>
                <div className="input-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isPublished" checked={formData.is_published} onChange={e => setFormData({...formData, is_published: e.target.checked})} />
                  <label className="input-label" htmlFor="isPublished" style={{ margin: 0 }}>Publicar inmediatamente</label>
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
