import React, { useState } from 'react';

const ClientPortal = () => {
  const [phone, setPhone] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (phone) {
      // In a real app, this would verify the magic link token
      setAuthenticated(true);
    }
  };

  if (!authenticated) {
    return (
      <div className="glass-card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Client Portal Login</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Enter your WhatsApp number to receive a secure login link.
        </p>
        <form onSubmit={handleLogin}>
          <input 
            type="tel" 
            placeholder="+1 234 567 8900" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ 
              width: '100%', padding: '0.75rem', borderRadius: '8px', 
              border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)',
              color: '#fff', marginBottom: '1.5rem', fontFamily: 'Outfit'
            }}
          />
          <button type="submit" className="btn" style={{ width: '100%' }}>Send Magic Link</button>
        </form>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div className="header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <h2>My Vehicles & Services</h2>
        <button className="btn btn-outline" onClick={() => setAuthenticated(false)}>Logout</button>
      </div>
      
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        <div className="ot-header">
          <h3 style={{ color: '#fff' }}>Toyota Corolla (AB-12-CD)</h3>
          <span className="badge in_progress">IN PROGRESS</span>
        </div>
        <p style={{ color: 'var(--text-muted)' }}>Service: Full Maintenance</p>
        
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="btn" style={{ flex: 1 }}>View Inspection Report</button>
          <button className="btn btn-outline" style={{ flex: 1 }}>Approve Quote ($150)</button>
        </div>
      </div>
    </div>
  );
};

export default ClientPortal;
