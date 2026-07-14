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
import { toast } from 'react-toastify';
import { FaSave, FaPlus, FaTrash, FaEdit } from 'react-icons/fa';

/** 
 * Custom Node for WhatsApp Flow
 */
const FlowNode = ({ data, isConnectable }) => {
    return (
        <div className="bg-white border-2 border-indigo-500 rounded-lg shadow-lg w-64">
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
            
            <div className="bg-indigo-600 text-white font-bold p-2 rounded-t-sm flex justify-between items-center">
                <span className="truncate">{data.name}</span>
                {data.is_active ? 
                    <span className="w-3 h-3 bg-green-400 rounded-full" title="Activo"></span> : 
                    <span className="w-3 h-3 bg-red-400 rounded-full" title="Inactivo"></span>
                }
            </div>
            
            <div className="p-3 text-sm">
                <div className="mb-2">
                    <span className="font-semibold text-gray-600 text-xs uppercase">Trigger: </span>
                    <span className="text-gray-800">{data.trigger_type}</span>
                </div>
                {data.keywords && (
                    <div className="mb-2">
                        <span className="font-semibold text-gray-600 text-xs uppercase">Keywords: </span>
                        <span className="text-gray-800 text-xs bg-gray-100 p-1 rounded">{data.keywords}</span>
                    </div>
                )}
                <div className="mb-2">
                    <span className="font-semibold text-gray-600 text-xs uppercase">Acción: </span>
                    <span className="text-gray-800">{data.action_type}</span>
                </div>
                {data.buttons && (
                    <div className="mt-2 border-t pt-2">
                        <span className="font-semibold text-gray-600 text-xs uppercase block mb-1">Opciones:</span>
                        <div className="space-y-1">
                            {data.buttons.split('\n').map((btn, idx) => (
                                btn.trim() && (
                                    <div key={idx} className="bg-gray-100 p-1 rounded text-xs flex justify-between items-center relative">
                                        <span>{btn}</span>
                                        <Handle 
                                            type="source" 
                                            position={Position.Right} 
                                            id={`btn-${idx}`}
                                            className="w-2 h-2 !bg-indigo-500 absolute -right-2 top-1/2 transform -translate-y-1/2"
                                            isConnectable={isConnectable}
                                        />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            <Handle type="source" position={Position.Bottom} id="default" isConnectable={isConnectable} className="w-3 h-3 !bg-green-500" />
        </div>
    );
};

const nodeTypes = {
    whatsappNode: FlowNode,
};

const WhatsAppCanvas = () => {
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
            toast.error("Error cargando flujos");
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
            toast.success("Estructura de flujos guardada correctamente");
        } catch (error) {
            console.error("Error guardando flujo", error);
            toast.error("Error al guardar la posición y conexiones.");
        }
    };

    return (
        <div className="h-full w-full bg-gray-50 flex flex-col pt-16">
            <div className="bg-white px-6 py-4 border-b flex justify-between items-center shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Constructor de Flujos de WhatsApp</h1>
                    <p className="text-sm text-gray-500">Une las respuestas del cliente para enrutar los flujos automáticamente.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={onSave}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
                    >
                        <FaSave /> Guardar Posiciones y Rutas
                    </button>
                </div>
            </div>
            
            <div className="flex-1 w-full h-[calc(100vh-140px)] relative">
                {loading ? (
                    <div className="flex justify-center items-center h-full">Cargando flujos...</div>
                ) : (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-gray-100"
                    >
                        <Controls />
                        <MiniMap 
                            nodeColor={(node) => {
                                return node.data?.is_active ? '#4f46e5' : '#9ca3af';
                            }}
                            nodeStrokeWidth={3}
                        />
                        <Background color="#ccc" gap={16} />
                    </ReactFlow>
                )}
            </div>
        </div>
    );
};

export default WhatsAppCanvas;
