import React, { useState } from 'react';
import axios from 'axios';

const VisualInspection = () => {
  const categories = ['Motor', 'Frenos', 'Neumáticos', 'Suspensión', 'Transmisión', 'Sistema Eléctrico'];
  const [inspectionState, setInspectionState] = useState({});
  const [aiNotes, setAiNotes] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleStatusChange = (category, status) => {
    setInspectionState(prev => ({ ...prev, [category]: status }));
  };

  const handleSimulateRecording = async () => {
    setIsRecording(true);
    // Simulate recording delay
    setTimeout(async () => {
      setIsRecording(false);
      setLoadingAi(true);
      try {
        // En un entorno real enviaríamos el Blob de audio
        const formData = new FormData();
        formData.append('audio', new Blob(['test'], { type: 'audio/webm' }));
        
        const response = await axios.post('/api/ai/transcribe/', formData);
        setAiNotes(prev => prev + ' ' + response.data.transcription);
      } catch (err) {
        console.error("Error transcribiendo audio:", err);
        setAiNotes("Error al transcribir. ¿Está el backend encendido?");
      }
      setLoadingAi(false);
    }, 2000);
  };

  const handleGenerateDiagnosis = async () => {
    if (!aiNotes) return;
    setLoadingAi(true);
    try {
      const response = await axios.post('/api/ai/diagnose/', { notes: aiNotes });
      setAiDiagnosis(response.data.diagnosis);
    } catch (err) {
      console.error("Error generando diagnóstico:", err);
      setAiDiagnosis("Error al generar el diagnóstico.");
    }
    setLoadingAi(false);
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <div className="glass-card" style={{ flex: '1 1 500px' }}>
        <div className="ot-header">
          <h2>Inspección Visual (Semáforo)</h2>
          <span className="badge pending">OT #1 - AB-12-CD</span>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Marca el estado de cada componente. Evidencia requerida para Rojo/Amarillo.
        </p>

        <div className="checklist">
          {categories.map(category => (
            <div key={category} className="checklist-item">
              <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>{category}</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                {inspectionState[category] && inspectionState[category] !== 'green' && (
                  <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                    📸 Añadir Foto
                  </button>
                )}
                
                <div className="status-buttons">
                  <button 
                    className={`status-btn green ${inspectionState[category] === 'green' ? 'active' : ''}`}
                    onClick={() => handleStatusChange(category, 'green')}
                    title="Bien"
                  />
                  <button 
                    className={`status-btn yellow ${inspectionState[category] === 'yellow' ? 'active' : ''}`}
                    onClick={() => handleStatusChange(category, 'yellow')}
                    title="Advertencia"
                  />
                  <button 
                    className={`status-btn red ${inspectionState[category] === 'red' ? 'active' : ''}`}
                    onClick={() => handleStatusChange(category, 'red')}
                    title="Crítico"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'right' }}>
          <button className="btn">Guardar Inspección</button>
        </div>
      </div>

      <div className="glass-card" style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column' }}>
        <div className="ot-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🤖 Asistente IA
          </h2>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <button 
            className={`btn ${isRecording ? 'red' : ''}`} 
            style={{ borderRadius: '50%', width: '80px', height: '80px', fontSize: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isRecording ? 'var(--status-red)' : 'var(--primary-color)' }}
            onClick={handleSimulateRecording}
            disabled={loadingAi}
          >
            {isRecording ? '⏹' : '🎤'}
          </button>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          {isRecording ? 'Grabando hallazgos...' : 'Presiona para grabar notas de voz'}
        </p>

        <textarea 
          value={aiNotes}
          onChange={(e) => setAiNotes(e.target.value)}
          placeholder="Notas transcritas aparecerán aquí..."
          style={{ width: '100%', height: '100px', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: 'Outfit', resize: 'none', marginBottom: '1rem' }}
        />

        <button 
          className="btn" 
          style={{ width: '100%', marginBottom: '1.5rem' }}
          onClick={handleGenerateDiagnosis}
          disabled={loadingAi || !aiNotes}
        >
          {loadingAi ? 'Procesando...' : '✨ Generar Diagnóstico Técnico'}
        </button>

        {aiDiagnosis && (
          <div style={{ padding: '1rem', background: 'rgba(102, 252, 241, 0.1)', border: '1px solid var(--primary-color)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
            {aiDiagnosis}
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualInspection;
