import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [currentUser, setCurrentUser] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    role: 'MECHANIC',
    password: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/users/', {
        headers: { Authorization: `Token ${token}` }
      });
      setUsers(response.data.results || response.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Error al cargar los usuarios del sistema.");
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setCurrentUser({
      ...currentUser,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = {
        username: currentUser.username,
        email: currentUser.email,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        profile: {
          role: currentUser.role
        }
      };
      
      // Password is only sent if provided (optional on edit)
      if (currentUser.password) {
        payload.password = currentUser.password;
      }

      if (isEditing) {
        await axios.put(`/api/operations/users/${currentUserId}/`, payload, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("Usuario actualizado correctamente.");
      } else {
        if (!currentUser.password) {
          alert("La contraseña es obligatoria para nuevos usuarios.");
          return;
        }
        await axios.post('/api/operations/users/', payload, {
          headers: { Authorization: `Token ${token}` }
        });
        alert("Usuario creado correctamente.");
      }

      setShowModal(false);
      fetchUsers();
    } catch (err) {
      console.error(err);
      alert("Error al guardar el usuario. Verifica que el nombre de usuario sea único.");
    }
  };

  const handleDelete = async (id) => {
    if (id === parseInt(localStorage.getItem('user_id'))) {
      alert("No puedes eliminar tu propio usuario activo.");
      return;
    }

    if (!window.confirm("¿Estás seguro de eliminar este usuario del sistema?")) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/operations/users/${id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      alert("Usuario eliminado correctamente.");
      fetchUsers();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el usuario.");
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setCurrentUserId(null);
    setCurrentUser({
      username: '', email: '', first_name: '', last_name: '', role: 'MECHANIC', password: ''
    });
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setIsEditing(true);
    setCurrentUserId(user.id);
    setCurrentUser({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || 'MECHANIC',
      password: '' // Keep password empty by default
    });
    setShowModal(true);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando Usuarios...</div>;
  if (error) return <div style={{ color: 'var(--status-red)', textAlign: 'center', padding: '2rem' }}>{error}</div>;

  return (
    <div className="user-manager">
      <div className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Gestión de Usuarios</h2>
          <p style={{ color: 'var(--text-muted)' }}>Crea y administra cuentas de Administradores y Mecánicos.</p>
        </div>
        <button className="btn" onClick={openNewModal}>Nuevo Usuario</button>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '1rem' }}>Usuario</th>
              <th style={{ padding: '1rem' }}>Nombre Completo</th>
              <th style={{ padding: '1rem' }}>Correo</th>
              <th style={{ padding: '1rem' }}>Rol</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)', hover: { backgroundColor: 'var(--surface-hover)' } }}>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{user.username}</td>
                <td style={{ padding: '1rem' }}>{user.first_name} {user.last_name}</td>
                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{user.email || '—'}</td>
                <td style={{ padding: '1rem' }}>
                  <span className={`badge ${user.role === 'ADMIN' ? 'in_progress' : 'pending'}`}>
                    {user.role === 'ADMIN' ? 'Administrador' : 'Mecánico'}
                  </span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button className="btn btn-outline btn-sm" style={{ marginRight: '0.5rem' }} onClick={() => openEditModal(user)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(user.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New/Edit User Modal */}
      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{isEditing ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}</h3>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Nombre de Usuario *</label>
                <input type="text" name="username" required value={currentUser.username} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Nombre</label>
                  <input type="text" name="first_name" value={currentUser.first_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Apellido</label>
                  <input type="text" name="last_name" value={currentUser.last_name} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Correo Electrónico</label>
                <input type="email" name="email" value={currentUser.email} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Rol *</label>
                  <select name="role" required value={currentUser.role} onChange={handleInputChange} className="input-field" style={{ width: '100%', backgroundColor: 'var(--bg-card)' }}>
                    <option value="MECHANIC">Mecánico</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Contraseña {isEditing && '(Opcional)'}</label>
                  <input type="password" name="password" required={!isEditing} value={currentUser.password} onChange={handleInputChange} className="input-field" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn">{isEditing ? 'Actualizar Usuario' : 'Guardar Usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
