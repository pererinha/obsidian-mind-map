/*
 * React Flow editor for one tree. The tree is the state; node positions are
 * derived from it on every change. Keys mirror the phase 1 protocol:
 * double-click edits, Tab adds a child, Enter adds a sibling, Delete removes,
 * Alt+Up/Down reorders, drag onto a node reparents, Cmd+Z / Cmd+Shift+Z
 * undo and redo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
    Background,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, OnNodeDrag, OnSelectionChangeFunc, ReactFlowInstance } from '@xyflow/react';
import { PlainNode } from './md-tree';
import { MdNodeData, NODE_TYPE, layoutTree } from './tree-layout';
import { addChild, addSiblingAfter, moveInto, moveSibling, remove, rename } from './tree-ops';

export interface MapEditorHandle {
    reload(root: PlainNode): void;
    fit(): Promise<boolean>;
    /** The React Flow instance, for scripts that drive the view. */
    instance: ReactFlowInstance<EditorNode>;
}

interface MapEditorProps {
    root: PlainNode;
    onChange(root: PlainNode, source: string): void;
    onReady(handle: MapEditorHandle): void;
}

interface EditorNodeData extends MdNodeData {
    editing: boolean;
    onCommit(id: string, title: string): void;
    onCancel(): void;
}

type EditorNode = Node<EditorNodeData, typeof NODE_TYPE>;

function MdNode({ id, data, selected }: NodeProps<EditorNode>) {
    const classes = ['poc-rf-node', data.depth === 0 ? 'poc-rf-root-node' : '', selected ? 'poc-rf-selected' : ''].join(' ');
    const style = data.color ? ({ '--poc-branch': data.color } as CSSProperties) : undefined;
    // The root feeds both sides; other nodes face the root with their target handle.
    const handles =
        data.depth === 0 ? (
            <>
                <Handle type="source" id="left" position={Position.Left} className="poc-rf-handle" />
                <Handle type="source" id="right" position={Position.Right} className="poc-rf-handle" />
            </>
        ) : data.side === 'left' ? (
            <>
                <Handle type="target" position={Position.Right} className="poc-rf-handle" />
                <Handle type="source" position={Position.Left} className="poc-rf-handle" />
            </>
        ) : (
            <>
                <Handle type="target" position={Position.Left} className="poc-rf-handle" />
                <Handle type="source" position={Position.Right} className="poc-rf-handle" />
            </>
        );
    return (
        <div className={classes} style={style} title={data.title}>
            {handles}
            {data.editing ? (
                <input
                    className="poc-rf-input"
                    defaultValue={data.title}
                    autoFocus
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                            data.onCommit(id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                            data.onCancel();
                        }
                    }}
                    onBlur={e => data.onCommit(id, e.currentTarget.value)}
                />
            ) : (
                <span className="poc-rf-title">{data.label}</span>
            )}
        </div>
    );
}

const nodeTypes = { [NODE_TYPE]: MdNode };

function Editor({ root: initialRoot, onChange, onReady }: MapEditorProps) {
    const flow = useReactFlow<EditorNode>();
    const rootRef = useRef(initialRoot);
    const past = useRef<PlainNode[]>([]);
    const future = useRef<PlainNode[]>([]);
    const selectedId = useRef<string | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const render = useCallback(
        (root: PlainNode) => {
            const laid = layoutTree(root);
            setNodes(
                laid.nodes.map(node => ({
                    ...node,
                    selected: node.id === selectedId.current,
                    data: { ...node.data, editing: false, onCommit, onCancel },
                })),
            );
            setEdges(laid.edges);
        },
        [setNodes, setEdges],
    );

    useEffect(() => {
        render(rootRef.current);
    }, []);

    // Nodes are measured after the first render; fit the viewport once they are.
    const initialized = useNodesInitialized();
    const fitted = useRef(false);
    useEffect(() => {
        if (initialized && !fitted.current) {
            fitted.current = true;
            // The split that hosts the view may still be resizing on its first frames.
            setTimeout(() => flow.fitView({ padding: 0.1, maxZoom: 1.25 }), 100);
        }
    }, [initialized, flow]);

    useEffect(() => {
        onReady({
            reload(root) {
                rootRef.current = root;
                render(root);
            },
            fit() {
                return flow.fitView({ padding: 0.1, maxZoom: 1.25 });
            },
            instance: flow,
        });
    }, [onReady, render, flow]);

    /** Replaces the tree, records history and notifies the view. */
    const apply = useCallback(
        (next: PlainNode, source: string) => {
            if (next === rootRef.current) {
                return;
            }
            past.current.push(rootRef.current);
            future.current = [];
            rootRef.current = next;
            render(next);
            onChange(next, source);
        },
        [render, onChange],
    );

    const restore = useCallback(
        (from: PlainNode[], to: PlainNode[], source: string) => {
            const target = from.pop();
            if (!target) {
                return;
            }
            to.push(rootRef.current);
            rootRef.current = target;
            render(target);
            onChange(target, source);
        },
        [render, onChange],
    );

    const startEditing = useCallback(
        (id: string) => {
            selectedId.current = id;
            setEditingId(id);
        },
        [],
    );

    const onCommit = useCallback(
        (id: string, title: string) => {
            setEditingId(current => (current === id ? null : current));
            const trimmed = title.trim();
            if (trimmed) {
                apply(rename(rootRef.current, id, trimmed), 'rename');
            }
        },
        [apply],
    );

    const onCancel = useCallback(() => setEditingId(null), []);

    const onSelectionChange = useCallback<OnSelectionChangeFunc<EditorNode>>(({ nodes: selected }) => {
        selectedId.current = selected[0]?.id ?? null;
    }, []);

    const onNodeDragStop = useCallback<OnNodeDrag<EditorNode>>(
        (_event, node) => {
            const target = flow.getIntersectingNodes(node).find(other => other.id !== node.id);
            if (target) {
                apply(moveInto(rootRef.current, node.id, target.id), 'move');
            } else {
                render(rootRef.current);
            }
        },
        [flow, apply, render],
    );

    const onKeyDown = useCallback(
        (event: ReactKeyboardEvent) => {
            if (editingId) {
                return;
            }
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                    restore(future.current, past.current, 'redo');
                } else {
                    restore(past.current, future.current, 'undo');
                }
                return;
            }
            const id = selectedId.current;
            if (!id) {
                return;
            }
            const root = rootRef.current;
            switch (event.key) {
                case 'Tab': {
                    event.preventDefault();
                    const added = addChild(root, id);
                    apply(added.root, 'addChild');
                    startEditing(added.id);
                    break;
                }
                case 'Enter': {
                    event.preventDefault();
                    const added = addSiblingAfter(root, id);
                    apply(added.root, 'addSibling');
                    startEditing(added.id);
                    break;
                }
                case 'Delete':
                case 'Backspace':
                    event.preventDefault();
                    selectedId.current = null;
                    apply(remove(root, id), 'remove');
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                    if (event.altKey) {
                        event.preventDefault();
                        apply(moveSibling(root, id, event.key === 'ArrowUp' ? -1 : 1), 'reorder');
                    }
                    break;
            }
        },
        [editingId, apply, restore, startEditing],
    );

    const displayNodes = useMemo<EditorNode[]>(
        () => nodes.map(node => ({ ...node, data: { ...node.data, editing: node.id === editingId } })),
        [nodes, editingId],
    );

    return (
        <div className="poc-rf-root" tabIndex={0} onKeyDown={onKeyDown}>
            <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={onSelectionChange}
                onNodeDoubleClick={(_event, node) => startEditing(node.id)}
                onNodeDragStop={onNodeDragStop}
                deleteKeyCode={null}
                selectionKeyCode={null}
                multiSelectionKeyCode={null}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
            >
                <Background />
            </ReactFlow>
        </div>
    );
}

export function MapEditor(props: MapEditorProps) {
    return (
        <ReactFlowProvider>
            <Editor {...props} />
        </ReactFlowProvider>
    );
}
