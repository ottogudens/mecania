import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const VisualInspection = () => {
  const [markers, setMarkers] = useState([]);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState(null);
  
  // AI Voice states
  const [aiNotes, setAiNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  
  // Audio recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const toast = useToast();

  const handleSvgClick = (e) => {
    // Solo permitir añadir marcadores si no hay uno seleccionado
    if (selectedMarkerIndex !== null) return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    
    // Calcular coordenadas relativas (0 a 100%)
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const newMarker = { x, y, note: '', type: 'red' }; // red, yellow, green
    setMarkers([...markers, newMarker]);
    setSelectedMarkerIndex(markers.length);
  };

  const updateMarker = (index, field, value) => {
    const newMarkers = [...markers];
    newMarkers[index][field] = value;
    setMarkers(newMarkers);
  };

  const deleteMarker = (index) => {
    setMarkers(markers.filter((_, i) => i !== index));
    setSelectedMarkerIndex(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Intentar soportar tipos MIME soportados por el navegador
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendAudioForTranscription(audioBlob, mimeType);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast({ title: 'Grabando...', message: 'Habla ahora para registrar tu nota de voz.', type: 'info' });
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      toast({ title: 'Error de Micrófono', message: 'No se pudo acceder al micrófono. Verifica los permisos de tu navegador.', type: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // detener todas las pistas del stream
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const sendAudioForTranscription = async (audioBlob, mimeType = 'audio/webm') => {
    setLoadingAi(true);
    try {
      const formData = new FormData();
      
      // Determinar extensión correcta según el navegador (Safari usa mp4)
      let ext = 'webm';
      if (mimeType.includes('mp4')) ext = 'mp4';
      else if (mimeType.includes('ogg')) ext = 'ogg';
      
      // Django necesita un archivo con extensión para pasarlo a OpenAI
      formData.append('audio', audioBlob, `nota_voz.${ext}`);
      
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-transcribe/', formData, {
        headers: { 
          'Authorization': `Token ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Añadir la transcripción a las notas
      setAiNotes(prev => prev + (prev ? ' ' : '') + response.data.transcription);
      toast({ title: 'Transcripción completada', message: 'La nota de voz se convirtió a texto.', type: 'success' });
    } catch (err) {
      console.error("Error transcribiendo audio:", err);
      toast({ title: 'Error', message: 'Error al transcribir el audio usando Inteligencia Artificial.', type: 'error' });
    }
    setLoadingAi(false);
  };

  const saveInspection = async () => {
    toast({ title: 'Guardado', message: 'Inspección Guardada con Éxito (Demo)', type: 'success' });
  };

  return (
    <div className="visual-inspection" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', animation: 'fadeIn 0.5s ease-out' }}>
      
      {/* 2D Wireframe Section */}
      <div className="glass-card" style={{ flex: '2 1 600px', minHeight: '500px', position: 'relative' }}>
        <div className="ot-header" style={{ marginBottom: '1rem' }}>
          <h2>Diagrama de Inspección 2D</h2>
          <span className="badge in_progress">Interactúe con la imagen</span>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Haga clic en cualquier parte del vehículo para añadir un marcador de daño (rayón, abolladura, etc.).
        </p>

        <div style={{ position: 'relative', width: '100%', maxWidth: '400px', margin: '0 auto', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '12px', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          {/* Simple Top-Down Car Wireframe SVG */}
          <svg 
            viewBox="0 0 200 400" 
            style={{ width: '100%', height: 'auto', cursor: 'crosshair', opacity: 0.8 }}
            onClick={handleSvgClick}
          >
            {/* Chasis */}
            <rect x="40" y="20" width="120" height="360" rx="40" fill="transparent" stroke="#60a5fa" strokeWidth="4" />
            {/* Ruedas */}
            <rect x="25" y="60" width="15" height="40" rx="5" fill="#334155" />
            <rect x="160" y="60" width="15" height="40" rx="5" fill="#334155" />
            <rect x="25" y="300" width="15" height="40" rx="5" fill="#334155" />
            <rect x="160" y="300" width="15" height="40" rx="5" fill="#334155" />
            {/* Cabina */}
            <rect x="50" y="120" width="100" height="150" rx="20" fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth="3" />
            {/* Focos delanteros */}
            <circle cx="65" cy="30" r="8" fill="#fcd34d" />
            <circle cx="135" cy="30" r="8" fill="#fcd34d" />
            {/* Focos traseros */}
            <rect x="55" y="375" width="20" height="5" fill="#ef4444" />
            <rect x="125" y="375" width="20" height="5" fill="#ef4444" />
          </svg>

          {/* Marcadores */}
          {markers.map((marker, idx) => (
            <div 
              key={idx}
              style={{
                position: 'absolute',
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                transform: 'translate(-50%, -100%)',
                cursor: 'pointer',
                zIndex: 10
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMarkerIndex(idx);
              }}
            >
              <i className="fa-solid fa-location-dot" style={{ 
                fontSize: selectedMarkerIndex === idx ? '2rem' : '1.5rem', 
                color: marker.type === 'red' ? '#ef4444' : marker.type === 'yellow' ? '#f59e0b' : '#10b981',
                filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.5))',
                transition: 'all 0.2s'
              }}></i>
            </div>
          ))}
        </div>
      </div>

      {/* Editor Lateral */}
      <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Editor de Marcador */}
        <div className="glass-card" style={{ flex: '1' }}>
          <h3 style={{ marginTop: 0, color: '#60a5fa' }}>
            <i className="fa-solid fa-circle-info" style={{ marginRight: '8px' }}></i>
            Detalle del Daño
          </h3>
          
          {selectedMarkerIndex !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Gravedad</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => updateMarker(selectedMarkerIndex, 'type', 'red')}
                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '4px', background: markers[selectedMarkerIndex].type === 'red' ? '#ef4444' : 'rgba(239,68,68,0.2)', color: markers[selectedMarkerIndex].type === 'red' ? '#ffffff' : '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}
                  >Crítico</button>
                  <button 
                    onClick={() => updateMarker(selectedMarkerIndex, 'type', 'yellow')}
                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '4px', background: markers[selectedMarkerIndex].type === 'yellow' ? '#f59e0b' : 'rgba(245,158,11,0.2)', color: markers[selectedMarkerIndex].type === 'yellow' ? '#000000' : '#f59e0b', fontWeight: 'bold', cursor: 'pointer' }}
                  >Leve</button>
                </div>
              </div>
              
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Descripción / Notas</label>
                <textarea 
                  className="input-field"
                  style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                  value={markers[selectedMarkerIndex].note}
                  onChange={(e) => updateMarker(selectedMarkerIndex, 'note', e.target.value)}
                  placeholder="Ej: Abolladura profunda de 5cm..."
                />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                <button 
                  className="btn btn-outline" 
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={() => deleteMarker(selectedMarkerIndex)}
                >
                  <i className="fa-solid fa-trash"></i> Eliminar
                </button>
                <button className="btn" onClick={() => setSelectedMarkerIndex(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-hand-pointer" style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}></i>
              <p>Selecciona o añade un marcador en el diagrama para ver sus detalles.</p>
            </div>
          )}
        </div>

        {/* Módulo IA - Notas de Voz */}
        <div className="glass-card" style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0, color: '#8b5cf6' }}>
            <i className="fa-solid fa-microphone-lines" style={{ marginRight: '8px' }}></i>
            Notas de Voz con IA
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Grabe sus observaciones generales y MecanIA las transcribirá automáticamente a texto.
          </p>

          <textarea 
            className="input-field" 
            style={{ width: '100%', flex: 1, minHeight: '120px', resize: 'vertical', marginBottom: '1rem' }}
            placeholder="Las notas transcritas aparecerán aquí..."
            value={aiNotes}
            onChange={(e) => setAiNotes(e.target.value)}
          />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${isRecording ? 'btn-danger' : 'btn-success'}`} 
              style={{ flex: 1, height: '48px', fontSize: '1rem' }}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? (
                <span><i className="fa-solid fa-circle-stop"></i> Detener Grabación</span>
              ) : (
                <span><i className="fa-solid fa-microphone"></i> Iniciar Nota de Voz</span>
              )}
            </button>
          </div>
          {loadingAi && <div style={{ textAlign: 'center', marginTop: '0.5rem', color: '#8b5cf6', fontSize: '0.9rem' }}><i className="fa-solid fa-circle-notch fa-spin"></i> Transcribiendo audio con Whisper...</div>}

          <div style={{ marginTop: '2rem' }}>
            <button className="btn" style={{ width: '100%' }} onClick={saveInspection}>
              <i className="fa-solid fa-floppy-disk" style={{ marginRight: '8px' }}></i> 
              Guardar Inspección Completa
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default VisualInspection;
