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

/** 
 * Custom Node for WhatsApp Flow
 */
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
            fontFamily: 'Outfit, sans-serif'
        }}>
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} style={{ background: 'var(--text-secondary)' }} />
            
            <div style={{
                background: 'rgba(239, 68, 68, 0.15)', // primary-dim
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
                    <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Trigger: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{data.trigger_type}</span>
                </div>
                {data.keywords && (
                    <div style={{ marginBottom: 'var(--space-2)' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Keywords: </span>
                        <span style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{data.keywords}</span>
                    </div>
                )}
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
    const [flows, setFlows] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Fetch Flows
    const fetchFlows = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`/api/operations/whatsapp-flows/`, {
                headers: { Authorization: `Token ${token}` },
            });
            const data = response.data;
            setFlows(data);
            
            // Map Database to React Flow Nodes
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
            
            // Map Edges
            const initialEdges = [];
            data.forEach(flow => {
                // Edge for generic next step
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
                
                // Edges for button routes
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
    
    useEffect(() => {
        fetchFlows();
    }, []);

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

    const onSave = async () => {
        try {
            const token = localStorage.getItem('token');
            const promises = nodes.map(node => {
                // Encontrar edges que salen de este nodo
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
            showSuccess("Estructura de flujos guardada");
        } catch (error) {
            console.error("Error guardando flujo", error);
            showError("Error al guardar la posición y conexiones.");
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
            <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-6)' }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Constructor de Flujos de WhatsApp</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Une las respuestas del cliente para enrutar los flujos automáticamente.</p>
                </div>
                <div>
                    <button onClick={onSave} className="btn">
                        💾 Guardar Posiciones y Rutas
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
        </div>
    );
};

export default WhatsAppCanvas;
