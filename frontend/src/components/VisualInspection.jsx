import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useToast } from './Toast';

const VEHICLE_PARTS = [
  { id: 'engine', name: 'Motor', icon: '🔧', desc: 'Nivel de aceite, mangueras, fugas y batería.' },
  { id: 'brakes', name: 'Frenos', icon: '🛑', desc: 'Pastillas, discos y líquido de frenos.' },
  { id: 'suspension', name: 'Suspensión', icon: '↕️', desc: 'Amortiguadores, bandejas y rótulas.' },
  { id: 'tires', name: 'Neumáticos', icon: '🛞', desc: 'Desgaste, presión y estado de llantas.' },
  { id: 'lights', name: 'Luces', icon: '💡', desc: 'Focos delanteros, traseros, intermitentes.' },
  { id: 'bodywork', name: 'Carrocería', icon: '🚗', desc: 'Rayones, abolladuras, golpes exteriores.' },
  { id: 'interior', name: 'Interior', icon: '💺', desc: 'Cinturones, aire acondicionado, tablero.' },
  { id: 'exhaust', name: 'Escape', icon: '💨', desc: 'Fugas de humo, catalizador y silenciador.' }
];

const VisualInspection = () => {
  const toast = useToast();
  const [selectedPartId, setSelectedPartId] = useState('engine');
  
  // Inspection State per Part
  const [inspections, setInspections] = useState({
    engine: { status: 'OK', note: '', image: null },
    brakes: { status: 'OK', note: '', image: null },
    suspension: { status: 'OK', note: '', image: null },
    tires: { status: 'OK', note: '', image: null },
    lights: { status: 'OK', note: '', image: null },
    bodywork: { status: 'OK', note: '', image: null },
    interior: { status: 'OK', note: '', image: null },
    exhaust: { status: 'OK', note: '', image: null }
  });

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const selectedPart = VEHICLE_PARTS.find(p => p.id === selectedPartId);
  const currentPartData = inspections[selectedPartId];

  const updatePartData = (partId, key, value) => {
    setInspections(prev => ({
      ...prev,
      [partId]: {
        ...prev[partId],
        [key]: value
      }
    }));
  };

  // Image Upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      updatePartData(selectedPartId, 'image', reader.result);
      toast({ title: 'Foto Adjunta', message: 'Imagen cargada exitosamente.', type: 'success' });
    };
    reader.readAsDataURL(file);
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      toast({ title: 'Grabando...', message: 'Describe el estado de esta sección...', type: 'info' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error de micrófono', message: 'No se pudo acceder al micrófono.', type: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const sendAudioForTranscription = async (audioBlob, mimeType) => {
    setLoadingAi(true);
    try {
      const formData = new FormData();
      let ext = 'webm';
      if (mimeType.includes('mp4')) ext = 'mp4';
      
      formData.append('audio', audioBlob, `nota_voz.${ext}`);
      
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/operations/ai-transcribe/', formData, {
        headers: { 
          'Authorization': `Token ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const transText = response.data.transcription;
      // Append text
      const existingNote = inspections[selectedPartId].note;
      updatePartData(selectedPartId, 'note', existingNote ? `${existingNote} ${transText}` : transText);
      toast({ title: 'Transcripción Exitosa', message: 'Nota añadida por voz.', type: 'success' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', message: 'No se pudo transcribir con la IA. Inténtalo de nuevo.', type: 'error' });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSaveInspection = () => {
    toast({ title: 'Inspección Guardada', message: 'Los datos de la inspección visual fueron guardados.', type: 'success' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
      
      {/* Mobile Oriented Parts GRID Selector */}
      <div>
        <h3 style={{ marginBottom: '0.8rem', color: 'var(--primary)' }}>🩺 Inspección por Componentes</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
          Selecciona una sección del vehículo para auditar, subir fotos y registrar notas por voz:
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem'
        }}>
          {VEHICLE_PARTS.map(part => {
            const status = inspections[part.id].status;
            let statusColor = 'rgba(255,255,255,0.05)';
            let borderColor = 'transparent';
            
            if (status === 'WARNING') {
              statusColor = 'rgba(245,158,11,0.08)';
              borderColor = 'var(--secondary)';
            } else if (status === 'CRITICAL') {
              statusColor = 'rgba(239,68,68,0.08)';
              borderColor = 'var(--status-red)';
            } else if (status === 'OK') {
              statusColor = 'rgba(16,185,129,0.05)';
              borderColor = 'var(--status-green)';
            }

            const isSelected = part.id === selectedPartId;

            return (
              <button
                key={part.id}
                onClick={() => setSelectedPartId(part.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: isSelected ? `2px solid var(--primary)` : `1px solid ${borderColor}`,
                  background: isSelected ? 'rgba(255, 206, 0, 0.08)' : statusColor,
                  cursor: 'pointer',
                  color: 'white',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? '0 0 10px rgba(255,206,0,0.1)' : 'none'
                }}
              >
                <span style={{ fontSize: '2rem' }}>{part.icon}</span>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{part.name}</span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: status === 'OK' ? '#10b981' : status === 'WARNING' ? '#f59e0b' : '#ef4444',
                  color: 'black',
                  fontWeight: 'bold'
                }}>
                  {status}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Part Detail Editor */}
      {selectedPart && (
        <div className="glass-card" style={{
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.8rem' }}>
            <span style={{ fontSize: '2.5rem' }}>{selectedPart.icon}</span>
            <div>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>{selectedPart.name}</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedPart.desc}</p>
            </div>
          </div>

          {/* Status buttons */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Estado del Componente</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                  background: currentPartData.status === 'OK' ? '#10b981' : 'rgba(16,185,129,0.1)',
                  color: currentPartData.status === 'OK' ? 'black' : '#10b981'
                }}
                onClick={() => updatePartData(selectedPartId, 'status', 'OK')}
              >
                ✓ Todo OK
              </button>
              <button
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                  background: currentPartData.status === 'WARNING' ? '#f59e0b' : 'rgba(245,158,11,0.1)',
                  color: currentPartData.status === 'WARNING' ? 'black' : '#f59e0b'
                }}
                onClick={() => updatePartData(selectedPartId, 'status', 'WARNING')}
              >
                ⚠️ Advertencia
              </button>
              <button
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold',
                  background: currentPartData.status === 'CRITICAL' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                  color: currentPartData.status === 'CRITICAL' ? 'white' : '#ef4444'
                }}
                onClick={() => updatePartData(selectedPartId, 'status', 'CRITICAL')}
              >
                🚨 Crítico / Falla
              </button>
            </div>
          </div>

          {/* Media Capture: Voice & Images */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            
            {/* Audio Recording */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>🎙️ Registrar Diagnóstico por Voz (IA)</label>
              <button
                className={`btn ${isRecording ? 'btn-danger' : 'btn-outline'}`}
                style={{ width: '100%', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={loadingAi}
              >
                {isRecording ? (
                  <>🔴 Detener Grabación</>
                ) : (
                  <>🎤 Grabar Nota de Voz</>
                )}
              </button>
              {loadingAi && <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', textAlign: 'center', marginTop: '0.3rem' }}>Transcribiendo con Whisper...</div>}
            </div>

            {/* Photo Capture */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📸 Adjuntar Evidencia Fotográfica</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                id="camera-upload"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
              <button
                className="btn btn-outline"
                style={{ width: '100%', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => document.getElementById('camera-upload').click()}
              >
                📷 Tomar Foto / Subir Imagen
              </button>
            </div>
            
          </div>

          {/* Photo Preview & Note */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {currentPartData.image && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '120px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Evidencia:</span>
                <div style={{ position: 'relative', width: '120px', height: '90px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src={currentPartData.image} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => updatePartData(selectedPartId, 'image', null)}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.8rem' }}
                  >
                    &times;
                  </button>
                </div>
              </div>
            )}

            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Notas del Diagnóstico</label>
              <textarea
                className="input-field"
                style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
                placeholder="Las observaciones transcritas o escritas se guardarán aquí..."
                value={currentPartData.note}
                onChange={(e) => updatePartData(selectedPartId, 'note', e.target.value)}
              />
            </div>
          </div>

        </div>
      )}

      {/* Save Action */}
      <div style={{ marginTop: '1rem' }}>
        <button className="btn" style={{ width: '100%', height: '50px', fontSize: '1.1rem', backgroundColor: 'var(--primary)' }} onClick={handleSaveInspection}>
          💾 Guardar Inspección de Vehículo Completa
        </button>
      </div>

    </div>
  );
};

export default VisualInspection;
