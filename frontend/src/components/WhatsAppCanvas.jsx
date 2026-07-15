import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, { 
    Background, 
    Controls, 
    MiniMap, 
    applyNodeChanges, 
    applyEdgeChanges, 
    addEdge, 
    Handle, 
    Position,
    MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { useSuccessToast, useErrorToast } from './Toast';

const ASSISTANT_TEMPLATES = [
  {
    id: 'mecanica',
    name: '🔧 Taller Mecánico',
    prompt: `Eres 'MecanIA Bot', el agente inteligente de ventas y atención.
Tu labor es asistir a los clientes de forma amable, profesional y rápida vía WhatsApp.

Reglas:
1. Saludos e Identificación: Si el cliente está identificado, usa su nombre.
2. Agendar Horas: Solicita Nombre, Patente, Marca y Síntoma.
3. Derivaciones: Menciona que un asesor técnico se comunicará.`
  },
  {
    id: 'salon',
    name: '💇 Salón de Belleza',
    prompt: `Eres asistente de atención virtual estrella del Salón.
Ayudas a cotizar servicios y agendar citas.

Reglas:
1. Identificación: Saluda y pregunta su nombre.
2. Coordinación de Citas: Pregunta servicio, fecha y profesional.
3. Tono: Mantén un tono elegante, súper amable y entusiasta.`
  }
];

const FLOW_TEMPLATES = [
    {
        name: "Inicio / Bienvenida",
        trigger_type: "keyword",
        keywords: "hola,buenos dias,buenas,hi",
        action_type: "static",
        response_text: "¡Hola! Bienvenido a nuestro servicio automático. ¿En qué te podemos ayudar el día de hoy?",
        buttons: "Agendar Hora\nHablar con Humano",
        is_active: true
    },
    {
        name: "Agendar Hora",
        trigger_type: "keyword",
        keywords: "agendar,cita,hora,reserva",
        action_type: "static",
        response_text: "Perfecto. Por favor, indícanos tus datos básicos y la fecha aproximada que deseas agendar para revisar disponibilidad de nuestro equipo.",
        buttons: "",
        is_active: true
    },
    {
        name: "Derivación a Humano",
        trigger_type: "keyword",
        keywords: "humano,persona,ejecutivo,agente",
        action_type: "human_transfer",
        response_text: "Comprendo. He notificado a nuestro equipo y un ejecutivo humano continuará esta conversación a la brevedad. ¡Gracias por tu paciencia!",
        buttons: "",
        is_active: true
    }
];

const FlowNode = ({ data, isConnectable }) => {
    return (
        <div style={{
            background: 'var(--surface-1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            width: '260px',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            fontFamily: 'Outfit, sans-serif',
            cursor: 'grab'
        }}>
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} style={{ background: 'var(--text-secondary)' }} />
            
            <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                borderBottom: '1px solid var(--border-subtle)',
                padding: 'var(--space-2) var(--space-3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: '600'
            }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</span>
                {data.is_active ? 
                    <span style={{ width: '10px', height: '10px', background: 'var(--status-green)', borderRadius: '50%' }} title="Activo"></span> : 
                    <span style={{ width: '10px', height: '10px', background: 'var(--status-red)', borderRadius: '50%' }} title="Inactivo"></span>
                }
            </div>
            
            <div style={{ padding: 'var(--space-3)', fontSize: '0.85rem' }}>
                <div style={{ marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Acción: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{data.action_type}</span>
                </div>
                {data.buttons && (
                    <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--space-2)' }}>Opciones:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {data.buttons.split('\n').map((btn, idx) => (
                                btn.trim() && (
                                    <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                                        <span>{btn}</span>
                                        <Handle 
                                            type="source" 
                                            position={Position.Right} 
                                            id={`btn-${idx}`}
                                            isConnectable={isConnectable}
                                            style={{ background: 'var(--status-blue)', width: '10px', height: '10px', right: '-10px' }}
                                        />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            <Handle type="source" position={Position.Bottom} id="default" isConnectable={isConnectable} style={{ background: 'var(--status-green)', width: '12px', height: '12px' }} />
        </div>
    );
};

const nodeTypes = {
    whatsappNode: FlowNode,
};

const WhatsAppCanvas = () => {
    const showSuccess = useSuccessToast();
    const showError = useErrorToast();
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [workshopSettings, setWorkshopSettings] = useState({ assistant_prompt: '' });
    
    // Modal & Side-panel states
    const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const [flowForm, setFlowForm] = useState({
        id: null,
        name: '',
        trigger_type: 'keyword',
        keywords: '',
        action_type: 'static',
        response_text: '',
        buttons: '',
        is_active: true
    });

    const [savingSettings, setSavingSettings] = useState(false);
    
    // Simulator states
    const [isSimulateChatOpen, setIsSimulateChatOpen] = useState(false);
    const [simulatedMessages, setSimulatedMessages] = useState([
        { sender: 'assistant', text: '¡Hola! Soy el simulador. Escribe un mensaje para probar los flujos.' }
    ]);
    const [simulateInputText, setSimulateInputText] = useState('');
    
    // Custom flow templates state
    const [customFlowTemplates, setCustomFlowTemplates] = useState([]);

    useEffect(() => {
        fetchFlows();
        fetchWorkshopSettings();
    }, []);

    const fetchWorkshopSettings = async () => {
        try {
            const res = await axios.get('/api/operations/settings/');
            setWorkshopSettings(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFlows = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/operations/whatsapp-flows/', {
                headers: { Authorization: `Token ${token}` },
            });
            const data = response.data.results || response.data;
            
            const initialNodes = data.map((flow, i) => {
                let position = flow.canvas_position && flow.canvas_position.x !== undefined 
                    ? flow.canvas_position 
                    : { x: 250 * (i % 3) + 100, y: 150 * Math.floor(i / 3) + 100 };
                
                return {
                    id: flow.id.toString(),
                    type: 'whatsappNode',
                    position: position,
                    data: { ...flow },
                };
            });
            
            const initialEdges = [];
            data.forEach(flow => {
                if (flow.next_step) {
                    initialEdges.push({
                        id: `e-${flow.id}-default-${flow.next_step}`,
                        source: flow.id.toString(),
                        sourceHandle: 'default',
                        target: flow.next_step.toString(),
                        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#10b981' },
                        style: { stroke: '#10b981', strokeWidth: 2 },
                        animated: true,
                    });
                }
                
                if (flow.button_routes && flow.buttons) {
                    const buttonsArray = flow.buttons.split('\n').filter(b => b.trim());
                    buttonsArray.forEach((btn, idx) => {
                        const targetId = flow.button_routes[idx.toString()] || flow.button_routes[btn.trim()];
                        if (targetId) {
                            initialEdges.push({
                                id: `e-${flow.id}-btn${idx}-${targetId}`,
                                source: flow.id.toString(),
                                sourceHandle: `btn-${idx}`,
                                target: targetId.toString(),
                                markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#6366f1' },
                                style: { stroke: '#6366f1', strokeWidth: 2 },
                            });
                        }
                    });
                }
            });
            
            setNodes(initialNodes);
            setEdges(initialEdges);
            setLoading(false);
        } catch (error) {
            console.error("Error cargando flujos", error);
            showError("Error cargando flujos");
            setLoading(false);
        }
    };

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );
    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, animated: params.sourceHandle === 'default' }, eds)),
        []
    );

    const onSaveStructure = async () => {
        try {
            const token = localStorage.getItem('token');
            const promises = nodes.map(node => {
                const nodeOutgoingEdges = edges.filter(e => e.source === node.id);
                let next_step = null;
                let button_routes = {};
                
                nodeOutgoingEdges.forEach(edge => {
                    if (edge.sourceHandle === 'default') {
                        next_step = parseInt(edge.target);
                    } else if (edge.sourceHandle && edge.sourceHandle.startsWith('btn-')) {
                        const btnIdx = edge.sourceHandle.split('-')[1];
                        button_routes[btnIdx] = parseInt(edge.target);
                    }
                });
                
                return axios.patch(`/api/operations/whatsapp-flows/${node.id}/`, {
                    canvas_position: node.position,
                    next_step: next_step,
                    button_routes: button_routes
                }, {
                    headers: { Authorization: `Token ${token}` }
                });
            });
            
            await Promise.all(promises);
            showSuccess("Estructura y conexiones guardadas.");
        } catch (error) {
            console.error("Error guardando flujo", error);
            showError("Error al guardar la posición y conexiones.");
        }
    };

    const handleNodeDoubleClick = (e, node) => {
        setFlowForm({
            id: node.data.id,
            name: node.data.name,
            trigger_type: node.data.trigger_type,
            keywords: node.data.keywords || '',
            action_type: node.data.action_type,
            response_text: node.data.response_text || '',
            buttons: node.data.buttons || '',
            is_active: node.data.is_active
        });
        setIsFlowModalOpen(true);
    };

    const handleSaveNode = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Token ${token}` } };
            const payload = { ...flowForm };
            if (!payload.id) {
                delete payload.id;
            }
            if (flowForm.id) {
                await axios.put(`/api/operations/whatsapp-flows/${flowForm.id}/`, payload, config);
                showSuccess("Nodo modificado");
            } else {
                await axios.post('/api/operations/whatsapp-flows/', payload, config);
                showSuccess("Nuevo nodo creado");
            }
            setIsFlowModalOpen(false);
            fetchFlows();
        } catch (err) {
            console.error(err);
            showError("Error al guardar el nodo.");
        }
    };

    const handleDeleteNode = async () => {
        if (!flowForm.id || !window.confirm("¿Eliminar este nodo?")) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/operations/whatsapp-flows/${flowForm.id}/`, { headers: { Authorization: `Token ${token}` } });
            showSuccess("Nodo eliminado");
            setIsFlowModalOpen(false);
            fetchFlows();
        } catch (err) {
            showError("Error al eliminar nodo.");
        }
    };

    const handleSaveAssistantPrompt = async () => {
        setSavingSettings(true);
        try {
            // Note: Update settings might use session authentication or need token depending on the backend, let's include it
            const token = localStorage.getItem('token');
            await axios.put('/api/operations/settings/', {
                assistant_prompt: workshopSettings.assistant_prompt || '',
            }, { headers: { Authorization: `Token ${token}` } });
            showSuccess('Prompt del asistente guardado correctamente.');
            setIsSettingsOpen(false);
        } catch (err) {
            console.error(err);
            showError('Error al guardar el prompt del asistente.');
        } finally {
            setSavingSettings(false);
        }
    };

    const loadFlowTemplates = async () => {
        if (!window.confirm("Se crearán varios nodos estándar (Bienvenida, Agendar, Derivar humano). ¿Continuar?")) return;
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Token ${token}` } };
            for (const tpl of FLOW_TEMPLATES) {
                await axios.post('/api/operations/whatsapp-flows/', tpl, config);
            }
            showSuccess("Plantillas de flujos generadas con éxito.");
            fetchFlows();
        } catch (err) {
            console.error(err);
            showError("Error al crear plantillas.");
        }
    };

    const handleSendSimulatedMessage = async (e) => {
        e.preventDefault();
        if (!simulateInputText.trim()) return;

        const newMsg = { sender: 'client', text: simulateInputText };
        setSimulatedMessages([...simulatedMessages, newMsg]);
        setSimulateInputText('');

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/ai/whatsapp-agent/', 
                { number: 'Simulador', text: newMsg.text, simulate: true },
                { headers: { Authorization: `Token ${token}` } }
            );

            if (res.data && res.data.reply) {
                setSimulatedMessages(prev => [...prev, { sender: 'assistant', text: res.data.reply }]);
            }
        } catch (err) {
            console.error('Error simulating chat:', err);
            setSimulatedMessages(prev => [...prev, { sender: 'assistant', text: '⚠️ [Error del Simulador] No se pudo procesar la respuesta.' }]);
        }
    };

    const handleSaveFlowAsTemplate = () => {
        const tplName = window.prompt("Nombre de esta plantilla de flujo:");
        if (!tplName || tplName.trim() === '') return;
        const newTemplate = {
            ...flowForm,
            _id: 'custom_' + Date.now(),
            name: '⭐ ' + tplName,
        };
        const updated = [...customFlowTemplates, newTemplate];
        setCustomFlowTemplates(updated);
        localStorage.setItem('custom_flow_templates', JSON.stringify(updated));
        showSuccess("Plantilla de flujo guardada.");
    };

    const [customPrompts, setCustomPrompts] = useState([]);
    useEffect(() => {
        const storedAssistant = localStorage.getItem('custom_assistant_prompts');
        if (storedAssistant) {
            try { setCustomPrompts(JSON.parse(storedAssistant)); } catch (e) {}
        }
        const storedFlows = localStorage.getItem('custom_flow_templates');
        if (storedFlows) {
            try { setCustomFlowTemplates(JSON.parse(storedFlows)); } catch (e) {}
        }
    }, [isSettingsOpen, isFlowModalOpen]);

    const handleSaveCustomPrompt = () => {
        const name = window.prompt("Nombre de esta plantilla personalizada:");
        if (!name || name.trim() === '') return;
        const newTemplate = {
            id: 'custom_' + Date.now(),
            name: '⭐ ' + name,
            prompt: workshopSettings.assistant_prompt
        };
        const updated = [...customPrompts, newTemplate];
        setCustomPrompts(updated);
        localStorage.setItem('custom_assistant_prompts', JSON.stringify(updated));
        showSuccess("Plantilla predeterminada guardada.");
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)', position: 'relative' }}>
            <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-6)' }}>
                <div style={{ flex: '1 1 min-content' }}>
                    <h2 style={{ fontSize: 'clamp(1rem, 3vw, 1.2rem)', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Gestión de Enrutamiento y Comportamiento</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Dibuja, conecta y edita los flujos de respuesta de WhatsApp. Haz doble click en un nodo para editarlo.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => {
                        setFlowForm({ id: null, name: '', trigger_type: 'keyword', keywords: '', action_type: 'static', response_text: '', buttons: '', is_active: true });
                        setIsFlowModalOpen(true);
                    }} className="btn btn-outline">
                         <i className="fa-solid fa-plus"></i> Crear Nodo
                    </button>
                    <button onClick={loadFlowTemplates} className="btn btn-outline">
                         <i className="fa-solid fa-magic"></i> Plantillas Init
                    </button>
                    <button onClick={() => setIsSimulateChatOpen(true)} className="btn btn-outline" style={{ borderColor: 'var(--primary)' }}>
                         <i className="fa-solid fa-comment-dots"></i> Probar Flujos
                    </button>
                    <button onClick={() => setIsSettingsOpen(true)} className="btn btn-outline" style={{ borderColor: 'var(--info)' }}>
                         <i className="fa-solid fa-robot"></i> Instruir IA
                    </button>
                    <button onClick={onSaveStructure} className="btn">
                        💾 Guardar Canvas
                    </button>
                </div>
            </div>
            
            <div className="glass-card" style={{ flex: 1, padding: 0, overflow: 'hidden', minHeight: '600px', display: 'flex' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', color: 'var(--text-secondary)' }}>
                        Cargando flujos...
                    </div>
                ) : (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        fitView
                        style={{ background: 'var(--bg-secondary)', width: '100%', height: '100%' }}
                    >
                        <Controls style={{ button: { background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' } }} />
                        <MiniMap 
                            nodeColor={(node) => node.data?.is_active ? 'var(--primary)' : 'var(--status-gray)'}
                            maskColor="rgba(0, 0, 0, 0.7)"
                            style={{ background: 'var(--surface-1)' }}
                        />
                        <Background color="var(--border-muted)" gap={20} size={1} />
                    </ReactFlow>
                )}
            </div>

            {/* Modal for Creating/Editing Nodes */}
            {isFlowModalOpen && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="glass-card" style={{ width: '90%', maxWidth: '500px', padding: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>{flowForm.id ? 'Editar Nodo' : 'Crear Nodo'}</h3>
                        
                        {customFlowTemplates.length > 0 && !flowForm.id && (
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Cargar Plantilla Guardada:</label>
                                <select className="input-field" onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const tpl = customFlowTemplates.find(t => t._id === val);
                                    if (tpl) {
                                        setFlowForm({ 
                                            id: null, name: tpl.name.replace('⭐ ', ''), trigger_type: tpl.trigger_type, 
                                            keywords: tpl.keywords || '', action_type: tpl.action_type, 
                                            response_text: tpl.response_text || '', buttons: tpl.buttons || '', is_active: true 
                                        });
                                    }
                                    e.target.value = "";
                                }}>
                                    <option value="">Seleccionar plantilla personalizada...</option>
                                    {customFlowTemplates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}

                        <form onSubmit={handleSaveNode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nombre del Flujo</label>
                                <input className="input-field" type="text" required value={flowForm.name} onChange={e => setFlowForm({...flowForm, name: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Acción a Ejecutar</label>
                                <select className="input-field" value={flowForm.action_type} onChange={e => setFlowForm({...flowForm, action_type: e.target.value})}>
                                    <option value="static">Texto Estático (Manual)</option>
                                    <option value="ai_completion">IA: GPT Completado Inmediato</option>
                                    <option value="escalate">Derivar a Humano Inmediatamente</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Respuesta de Texto</label>
                                <textarea className="input-field" rows="3" value={flowForm.response_text} onChange={e => setFlowForm({...flowForm, response_text: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Opciones / Botones (Uno por línea)</label>
                                <textarea className="input-field" rows="3" placeholder="Sí&#10;No&#10;Volver al menú" value={flowForm.buttons} onChange={e => setFlowForm({...flowForm, buttons: e.target.value})} />
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
                                <button type="button" onClick={handleSaveFlowAsTemplate} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '6px 10px' }}>
                                    <i className="fa-solid fa-star"></i> Guardar como plantilla
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                                <button type="submit" className="btn" style={{ flex: 1, backgroundColor: 'var(--primary)' }}>Guardar Nodo</button>
                                {flowForm.id && <button type="button" onClick={handleDeleteNode} className="btn" style={{ backgroundColor: 'var(--status-red)' }}>Eliminar</button>}
                                <button type="button" onClick={() => setIsFlowModalOpen(false)} className="btn btn-outline" style={{ flex: 1 }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Chat Simulator Sidebar */}
            {isSimulateChatOpen && (
                <div style={{ position: 'absolute', top: 0, right: 0, width: '380px', height: '100%', background: 'var(--surface-1)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', zIndex: 900, boxShadow: '-5px 0 20px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                        <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}><i className="fa-solid fa-comment-dots"></i> Simulador de Flujos</h3>
                        <button onClick={() => setIsSimulateChatOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--brand-dark)', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                        Estas conversaciones solo son simulaciones de tus flujos activos e inactivos. No se guardarán.
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {simulatedMessages.map((m, idx) => (
                            <div key={idx} style={{ 
                                alignSelf: m.sender === 'client' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                padding: '10px 14px',
                                borderRadius: '15px',
                                backgroundColor: m.sender === 'client' ? 'var(--primary)' : 'var(--surface-2)',
                                color: m.sender === 'client' ? '#fff' : 'var(--text-primary)',
                                boxShadow: 'var(--shadow-sm)',
                                fontSize: '0.9rem',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {m.text}
                            </div>
                        ))}
                    </div>

                    <form onSubmit={handleSendSimulatedMessage} style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-1)' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="text" 
                                className="input-field" 
                                placeholder="Escribe un mensaje..."
                                value={simulateInputText}
                                onChange={e => setSimulateInputText(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button type="submit" className="btn" style={{ background: 'var(--primary)', padding: '0 1rem' }}>
                                <i className="fa-solid fa-paper-plane"></i>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Right Sidebar for Prompt Settings */}
            {isSettingsOpen && (
                <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '100%', background: 'var(--surface-1)', borderLeft: '1px solid var(--border-color)', padding: '2rem', zIndex: 900, boxShadow: '-5px 0 20px rgba(0,0,0,0.5)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, color: 'var(--primary)' }}><i className="fa-solid fa-robot"></i> Instrucciones IA</h3>
                        <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Define la personalidad e instrucciones maestras del asistente de IA.</p>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Plantillas Rápidas</label>
                        <select className="input-field" onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const tpl = [...ASSISTANT_TEMPLATES, ...customPrompts].find(t => t.id === val);
                            if (tpl && window.confirm("¿Sobrescribir el prompt actual?")) {
                                setWorkshopSettings({ ...workshopSettings, assistant_prompt: tpl.prompt });
                            }
                            e.target.value = "";
                        }}>
                            <option value="">Seleccionar plantilla...</option>
                            <optgroup label="Plantillas de Sistema">
                                {ASSISTANT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                            {customPrompts.length > 0 && (
                                <optgroup label="Mis Plantillas Personalizadas">
                                    {customPrompts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>System Prompt Personalizado</label>
                        <textarea 
                            className="input-field" 
                            rows={15} 
                            value={workshopSettings.assistant_prompt || ''}
                            onChange={e => setWorkshopSettings({ ...workshopSettings, assistant_prompt: e.target.value })}
                            style={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5', marginBottom: '0.5rem' }}
                        />
                        <button type="button" onClick={handleSaveCustomPrompt} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '6px 10px', float: 'right' }}>
                             Guardar como plantilla
                        </button>
                        <div style={{ clear: 'both' }}></div>
                    </div>

                    <button disabled={savingSettings} onClick={handleSaveAssistantPrompt} className="btn" style={{ width: '100%', backgroundColor: 'var(--primary)' }}>
                        {savingSettings ? "Guardando..." : "💾 Aplicar Instrucciones"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default WhatsAppCanvas;
