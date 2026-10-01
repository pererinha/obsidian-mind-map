/*
 * React Flow editor for one tree. The tree is the state; node positions are
 * derived from it on every change. Keys mirror the phase 1 protocol:
 * double-click edits, Tab adds a child, Enter adds a sibling, Delete removes,
 * Alt+Up/Down reorders, drag onto a node reparents, Cmd+Z / Cmd+Shift+Z
 * undo and redo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
    Background,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, OnNodeDrag, OnSelectionChangeFunc } from '@xyflow/react';
import { PlainNode } from './md-tree';
import { MdFlowNode, NODE_TYPE, layoutTree } from './tree-layout';
import { addChild, addSiblingAfter, moveInto, moveSibling, remove, rename } from './tree-ops';

export interface MapEditorHandle {
    reload(root: PlainNode): void;
}

interface MapEditorProps {
    root: PlainNode;
    onChange(root: PlainNode, source: string): void;
    onReady(handle: MapEditorHandle): void;
}

interface EditorNodeData extends Record<string, unknown> {
    title: string;
    depth: number;
    editing: boolean;
    onCommit(id: string, title: string): void;
    onCancel(): void;
}

type EditorNode = Node<EditorNodeData, typeof NODE_TYPE>;

function MdNode({ id, data, selected }: NodeProps<EditorNode>) {
    const classes = ['poc-rf-node', `poc-rf-depth-${data.depth}`, selected ? 'poc-rf-selected' : ''].join(' ');
    return (
        <div className={classes}>
            <Handle type="target" position={Position.Left} className="poc-rf-handle" />
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
                <span className="poc-rf-title">{data.title}</span>
            )}
            <Handle type="source" position={Position.Right} className="poc-rf-handle" />
        </div>
    );
}

const nodeTypes = { [NODE_TYPE]: MdNode };

function Editor({ root: initialRoot, onChange, onReady }: MapEditorProps) {
    const flow = useReactFlow<MdFlowNode>();
    const rootRef = useRef(initialRoot);
    const past = useRef<PlainNode[]>([]);
    const future = useRef<PlainNode[]>([]);
    const selectedId = useRef<string | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<MdFlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const render = useCallback(
        (root: PlainNode) => {
            const laid = layoutTree(root);
            setNodes(laid.nodes.map(node => ({ ...node, selected: node.id === selectedId.current })));
            setEdges(laid.edges);
        },
        [setNodes, setEdges],
    );

    useEffect(() => {
        render(rootRef.current);
        requestAnimationFrame(() => flow.fitView({ padding: 0.2 }));
    }, []);

    useEffect(() => {
        onReady({
            reload(root) {
                rootRef.current = root;
                render(root);
            },
        });
    }, [onReady, render]);

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

    const onSelectionChange = useCallback<OnSelectionChangeFunc<MdFlowNode>>(({ nodes: selected }) => {
        selectedId.current = selected[0]?.id ?? null;
    }, []);

    const onNodeDragStop = useCallback<OnNodeDrag<MdFlowNode>>(
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
        () => nodes.map(node => ({ ...node, data: { ...node.data, editing: node.id === editingId, onCommit, onCancel } })),
        [nodes, editingId, onCommit, onCancel],
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
