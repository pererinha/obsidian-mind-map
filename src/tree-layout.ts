/*
 * Positions for the editor tree. React Flow has no layout of its own. This
 * is a tidy tree, root on the left: every leaf takes one row, a parent is
 * centred on its children, siblings keep the document order.
 */

import type { Edge, Node } from '@xyflow/react';
import { PlainNode } from './md-tree';

export const NODE_TYPE = 'md';

export interface MdNodeData extends Record<string, unknown> {
    title: string;
    depth: number;
}

export type MdFlowNode = Node<MdNodeData, typeof NODE_TYPE>;

const CHAR_WIDTH = 7.5;
const PADDING_X = 24;
const NODE_HEIGHT = 36;
const GAP_X = 60;
const GAP_Y = 16;

/** Estimated box size before the node is measured. */
export function estimateSize(title: string): { width: number; height: number } {
    return { width: Math.max(60, Math.round(title.length * CHAR_WIDTH + PADDING_X)), height: NODE_HEIGHT };
}

export function layoutTree(root: PlainNode): { nodes: MdFlowNode[]; edges: Edge[] } {
    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    const columnWidth: number[] = [];

    const measure = (node: PlainNode, depth: number) => {
        columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, estimateSize(node.title).width);
        node.children.forEach(child => measure(child, depth + 1));
    };
    measure(root, 0);

    const columnX: number[] = [];
    columnWidth.reduce((x, width, depth) => {
        columnX[depth] = x;
        return x + width + GAP_X;
    }, 0);

    let nextRow = 0;
    /** Places the subtree and returns the node's centre y. */
    const place = (node: PlainNode, depth: number, parent?: PlainNode): number => {
        const size = estimateSize(node.title);
        let centerY: number;
        if (node.children.length === 0) {
            centerY = nextRow * (NODE_HEIGHT + GAP_Y) + NODE_HEIGHT / 2;
            nextRow += 1;
        } else {
            const centers = node.children.map(child => place(child, depth + 1, node));
            centerY = (centers[0] + centers[centers.length - 1]) / 2;
        }
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x: columnX[depth], y: centerY - size.height / 2 },
            data: { title: node.title, depth },
            ...size,
        });
        if (parent) {
            edges.push({ id: `${parent.id}-${node.id}`, source: parent.id, target: node.id, type: 'default' });
        }
        return centerY;
    };
    place(root, 0);
    return { nodes, edges };
}
