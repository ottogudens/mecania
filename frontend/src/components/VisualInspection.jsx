import React, { useState } from 'react';

const VisualInspection = () => {
  const categories = ['Engine', 'Brakes', 'Tires', 'Suspension', 'Transmission', 'Electrical'];
  const [inspectionState, setInspectionState] = useState({});

  const handleStatusChange = (category, status) => {
    setInspectionState(prev => ({ ...prev, [category]: status }));
  };

  return (
    <div className="glass-card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div className="ot-header">
        <h2>Visual Inspection Checklist</h2>
        <span className="badge pending">OT #1 - AB-12-CD</span>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Mark the status of each component. Green (Good), Yellow (Warning), Red (Critical). Evidence required for Red/Yellow.
      </p>

      <div className="checklist">
        {categories.map(category => (
          <div key={category} className="checklist-item">
            <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>{category}</span>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              {inspectionState[category] && inspectionState[category] !== 'green' && (
                <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  📸 Add Photo
                </button>
              )}
              
              <div className="status-buttons">
                <button 
                  className={`status-btn green ${inspectionState[category] === 'green' ? 'active' : ''}`}
                  onClick={() => handleStatusChange(category, 'green')}
                  title="Good"
                />
                <button 
                  className={`status-btn yellow ${inspectionState[category] === 'yellow' ? 'active' : ''}`}
                  onClick={() => handleStatusChange(category, 'yellow')}
                  title="Warning"
                />
                <button 
                  className={`status-btn red ${inspectionState[category] === 'red' ? 'active' : ''}`}
                  onClick={() => handleStatusChange(category, 'red')}
                  title="Critical"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'right' }}>
        <button className="btn">Save Inspection</button>
      </div>
    </div>
  );
};

export default VisualInspection;
