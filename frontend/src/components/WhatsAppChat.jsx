import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const WhatsAppChat = () => {
  const [chats, setChats] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChatInfo, setSelectedChatInfo] = useState(null);
  const [silencing, setSilencing] = useState(false);
  
  const toast = useToast();
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Cargar lista de chats
  const fetchChats = async (silent = false) => {
    if (!silent) setLoadingChats(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/operations/whatsapp-messages/chats/', {
        headers: { Authorization: `Token ${token}` }
      });
      setChats(response.data);
    } catch (err) {
      console.error("Error al cargar chats:", err);
      if (!silent) toast({ title: 'Error', message: 'No se pudieron cargar las conversaciones.', type: 'error' });
    } finally {
      if (!silent) setLoadingChats(false);
    }
  };

  // Cargar historial de mensajes para el chat seleccionado
  const fetchMessages = async (phoneStr, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/operations/whatsapp-messages/?phone=${encodeURIComponent(phoneStr)}`, {
        headers: { Authorization: `Token ${token}` }
      });
      setMessages(response.data.results || response.data);
    } catch (err) {
      console.error("Error al cargar mensajes:", err);
      if (!silent) toast({ title: 'Error', message: 'No se pudo cargar el historial de mensajes.', type: 'error' });
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Enviar mensaje manual
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedPhone) return;

    setSending(true);
    const textToSend = inputText.trim();
    setInputText('');

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/operations/whatsapp-messages/send-manual/', {
        phone: selectedPhone,
        text: textToSend
      }, {
        headers: { Authorization: `Token ${token}` }
      });

      toast({ title: 'Mensaje Enviado', message: 'El mensaje ha sido enviado exitosamente al cliente.', type: 'success' });
      // Recargar mensajes inmediatamente
      await fetchMessages(selectedPhone, true);
      // Recargar lista de chats para actualizar el snippet
      fetchChats(true);
    } catch (err) {
      console.error("Error al enviar mensaje:", err);
      // Restaurar el texto en caso de error
      setInputText(textToSend);
      toast({ 
        title: 'Error al enviar', 
        message: err.response?.data?.error || 'Hubo un problema al enviar el mensaje por WhatsApp. Asegúrate de que el microservicio esté conectado.', 
        type: 'error' 
      });
    } finally {
      setSending(false);
    }
  };

  // Cambiar/Desactivar el silencio del bot
  const handleToggleSilence = async () => {
    if (!selectedPhone) return;
    setSilencing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/whatsapp-messages/toggle-silence/', {
        phone: selectedPhone
      }, {
        headers: { Authorization: `Token ${token}` }
      });
      
      const { is_bot_silenced, bot_silenced_until } = response.data;
      toast({ 
        title: is_bot_silenced ? 'Bot Silenciado' : 'Bot Activado', 
        message: is_bot_silenced 
          ? 'El asistente automático ha sido silenciado por 2 horas.' 
          : 'El asistente automático está activo para responder a este cliente.', 
        type: 'success' 
      });
      
      // Actualizar localmente en el listado de chats
      setChats(prevChats => prevChats.map(c => {
        if (c.phone === selectedPhone) {
          return {
            ...c,
            is_bot_silenced,
            bot_silenced_until,
            client: c.client ? { ...c.client, is_bot_silenced, bot_silenced_until } : null
          };
        }
        return c;
      }));
    } catch (err) {
      console.error("Error al cambiar silencio del bot:", err);
      toast({ 
        title: 'Error', 
        message: 'No se pudo cambiar el estado del bot inteligente.', 
        type: 'error' 
      });
    } finally {
      setSilencing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchChats();
    // Setup polling every 5 seconds for messages/chats
    pollIntervalRef.current = setInterval(() => {
      fetchChats(true);
      if (selectedPhone) {
        fetchMessages(selectedPhone, true);
      }
    }, 5000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedPhone]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Sincronizar selectedChatInfo cuando cambie el item correspondiente en la lista (polling o acciones)
  useEffect(() => {
    if (selectedPhone && chats.length > 0) {
      const updatedChat = chats.find(c => c.phone === selectedPhone);
      if (updatedChat) {
        setSelectedChatInfo(updatedChat);
      }
    }
  }, [chats, selectedPhone]);

  // Manejar selección de chat
  const handleSelectChat = (chat) => {
    setSelectedPhone(chat.phone);
    setSelectedChatInfo(chat);
    fetchMessages(chat.phone);
  };

  // Filtrar chats por término de búsqueda
  const filteredChats = chats.filter(chat => {
    const term = searchTerm.toLowerCase();
    const nameMatch = chat.client_name ? chat.client_name.toLowerCase().includes(term) : false;
    const phoneMatch = chat.phone ? chat.phone.includes(term) : false;
    const msgMatch = chat.last_message ? chat.last_message.toLowerCase().includes(term) : false;
    return nameMatch || phoneMatch || msgMatch;
  });

  // Helper para dar formato a fechas
  const formatTime = (timeString) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timeString) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // Determinar badge de remitente
  const getSenderLabel = (sender) => {
    switch (sender) {
      case 'client': return { text: 'Cliente', class: 'badge-pending' };
      case 'assistant': return { text: 'Bot IA', class: 'badge-completed' };
      case 'operator': return { text: 'Operador', class: 'badge-delivered' };
      default: return { text: 'Sistema', class: 'badge-cancelled' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(280px, 100%), 350px) 1fr', gap: '1rem', height: '100%', minHeight: 0 }}>
        
        {/* PANEL IZQUIERDO: LISTA DE CHATS */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1rem', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>💬 Conversaciones</h3>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => fetchChats()} 
              style={{ padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              🔄 Refrescar
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Buscar cliente, número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {loadingChats ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Cargando chats...</div>
            ) : filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontSize: '0.9rem' }}>
                No se encontraron chats.
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isActive = chat.phone === selectedPhone;
                return (
                  <div
                    key={chat.phone}
                    onClick={() => handleSelectChat(chat)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isActive ? 'var(--primary-dim)' : 'rgba(255, 255, 255, 0.02)',
                      border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="chat-list-item"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                        {chat.client_name || 'Desconocido'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        {formatTime(chat.last_time)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                      {chat.phone}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        maxWidth: '160px',
                      }}>
                        {chat.last_message || ''}
                      </p>
                      {chat.last_sender && (
                        <span className={`badge ${getSenderLabel(chat.last_sender).class}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                          {getSenderLabel(chat.last_sender).text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* PANEL DERECHO: VISOR DE CHAT + INFORMACIÓN */}
        {selectedPhone ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) min(280px, 30%)', gap: '1rem', height: '100%', minHeight: 0 }}>
            {/* COLL DE CHAT */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1rem', minHeight: 0 }}>
              {/* Header del Chat Activo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {selectedChatInfo?.client_name || 'Cliente Sin Registrar'}
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedPhone}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span className="badge badge-delivered" style={{ fontSize: '0.7rem' }}>Asistente Activo</span>
                </div>
              </div>

              {/* Historial de Mensajes */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {loadingMessages ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Cargando conversación...</div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem' }}>No hay mensajes anteriores en esta conversación.</div>
                ) : (
                  messages.map((msg, index) => {
                    const isClient = msg.sender === 'client';
                    const isAI = msg.sender === 'assistant';
                    const isOperator = msg.sender === 'operator';
                    
                    let bubbleBg = 'var(--surface-1)';
                    let alignSelf = 'flex-start';
                    let borderCol = 'var(--border-subtle)';
                    let textColor = 'var(--text-primary)';

                    if (isClient) {
                      bubbleBg = 'rgba(255, 255, 255, 0.03)';
                      alignSelf = 'flex-start';
                    } else if (isAI) {
                      bubbleBg = 'rgba(239, 68, 68, 0.05)';
                      alignSelf = 'flex-end';
                      borderCol = 'rgba(239, 68, 68, 0.2)';
                    } else if (isOperator) {
                      bubbleBg = 'rgba(16, 185, 129, 0.08)';
                      alignSelf = 'flex-end';
                      borderCol = 'rgba(16, 185, 129, 0.25)';
                    }

                    return (
                      <div
                        key={msg.id || index}
                        style={{
                          alignSelf,
                          maxWidth: '75%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <div
                          style={{
                            padding: '0.75rem',
                            borderRadius: isClient ? '0px 10px 10px 10px' : '10px 0px 10px 10px',
                            backgroundColor: bubbleBg,
                            border: `1px solid ${borderCol}`,
                            color: textColor,
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {msg.text}
                        </div>
                        <div style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--text-tertiary)', 
                          display: 'flex', 
                          justifyContent: isClient ? 'flex-start' : 'flex-end',
                          gap: '6px',
                          padding: '0 2px' 
                        }}>
                          <span>{getSenderLabel(msg.sender).text}</span>
                          <span>•</span>
                          <span>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Cuadro de envío de mensaje */}
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <textarea
                  placeholder="Escribe una respuesta manual al cliente..."
                  className="glass-input"
                  style={{ flex: 1, minHeight: '44px', maxHeight: '100px', fontSize: '0.9rem', padding: '0.6rem var(--space-4)' }}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="btn btn-success"
                  style={{ padding: '0 1.25rem', height: '44px' }}
                  disabled={sending || !inputText.trim()}
                >
                  {sending ? '...' : 'Enviar'}
                </button>
              </form>
            </div>

            {/* COLL DE DETALLES - PREVIEW LATERAL */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1rem', minHeight: 0, overflowY: 'auto', gap: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                Detalles del Contacto
              </h4>

              {selectedChatInfo ? (
                <>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>NOMBRE</div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                      {selectedChatInfo.client_name || 'No registrado'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>WHATSAPP</div>
                    <div style={{ fontWeight: '500', fontSize: '0.85rem' }}>
                      {selectedChatInfo.phone}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>ESTADO PORTAL</div>
                    <div style={{ marginTop: '4px' }}>
                      {selectedChatInfo.client_id ? (
                        <span className="badge badge-delivered" style={{ fontSize: '0.65rem' }}>Registrado</span>
                      ) : (
                        <span className="badge badge-pending" style={{ fontSize: '0.65rem' }}>Sin Registrar</span>
                      )}
                    </div>
                  </div>

                  {selectedChatInfo.client_id && (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>BOT DE AUTO-RESPUESTA</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        {selectedChatInfo.is_bot_silenced ? (
                          <>
                            <span className="badge badge-pending" style={{ fontSize: '0.65rem', background: '#D97706', color: 'white' }}>Silenciado (2h)</span>
                            <button
                              onClick={handleToggleSilence}
                              disabled={silencing}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--success)', border: '1px solid var(--success)', borderRadius: '4px', cursor: 'pointer' }}
                              title="Re-activar bot inteligente de inmediato"
                            >
                              ⚡ Activar BOT
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="badge badge-delivered" style={{ fontSize: '0.65rem', background: '#059669', color: 'white' }}>Activo</span>
                            <button
                              onClick={handleToggleSilence}
                              disabled={silencing}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer' }}
                              title="Silenciar bot inteligente por 2 horas"
                            >
                              🔕 Silenciar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedChatInfo.vehicles && selectedChatInfo.vehicles.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>VEHÍCULOS ({selectedChatInfo.vehicles.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {selectedChatInfo.vehicles.map((v, i) => (
                          <div key={i} style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: '600' }}>{v.make} {v.model}</div>
                            <div style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>Patente: {v.license_plate}</div>
                            {v.year && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Añor: {v.year}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>VEHÍCULOS</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Sin vehículos registrados.</div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Cargando detalles...</div>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</span>
            <h3>Chat de WhatsApp</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', margin: '0.5rem 0 0 0' }}>
              Selecciona una conversación del listado izquierdo para visualizar los mensajes y responder manualmente al cliente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppChat;
