/*
 * Positions and visual data for the editor tree. React Flow has no layout of
 * its own. This is a tidy tree, root on the left: every leaf takes one row, a
 * parent is centred on its children, siblings keep the document order.
 */

import type { Edge, Node } from '@xyflow/react';
import { PlainNode } from './md-tree';

export const NODE_TYPE = 'md';

/** One colour per top-level branch, inherited by the subtree. Obsidian defines these for both themes. */
export const BRANCH_COLORS = [
    'var(--color-green)',
    'var(--color-orange)',
    'var(--color-yellow)',
    'var(--color-purple)',
    'var(--color-blue)',
    'var(--color-red)',
];

export const LABEL_MAX = 40;

export interface MdNodeData extends Record<string, unknown> {
    title: string;
    /** Title cut to LABEL_MAX characters for the canvas; the full title goes to the tooltip and the editor. */
    label: string;
    depth: number;
    /** Colour of the top-level branch this node belongs to; undefined on the root. */
    color?: string;
}

export type MdFlowNode = Node<MdNodeData, typeof NODE_TYPE>;

const CHAR_WIDTH = 7.5;
const PADDING_X = 24;
const NODE_HEIGHT = 36;
const ROOT_SIZE = 84;
const GAP_X = 60;
const GAP_Y = 16;

export function shortLabel(title: string): string {
    return title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1).trimEnd()}…` : title;
}

/** Estimated box size before the node is measured. */
export function estimateSize(title: string, depth: number): { width: number; height: number } {
    if (depth === 0) {
        const side = Math.max(ROOT_SIZE, Math.round(shortLabel(title).length * CHAR_WIDTH + PADDING_X));
        return { width: side, height: side };
    }
    return { width: Math.max(60, Math.round(shortLabel(title).length * CHAR_WIDTH + PADDING_X)), height: NODE_HEIGHT };
}

export function layoutTree(root: PlainNode): { nodes: MdFlowNode[]; edges: Edge[] } {
    const nodes: MdFlowNode[] = [];
    const edges: Edge[] = [];
    const columnWidth: number[] = [];

    const measure = (node: PlainNode, depth: number) => {
        columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, estimateSize(node.title, depth).width);
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
    const place = (node: PlainNode, depth: number, color?: string, parent?: PlainNode): number => {
        const size = estimateSize(node.title, depth);
        let centerY: number;
        if (node.children.length === 0) {
            centerY = nextRow * (NODE_HEIGHT + GAP_Y) + NODE_HEIGHT / 2;
            nextRow += 1;
        } else {
            const centers = node.children.map((child, index) =>
                place(child, depth + 1, depth === 0 ? BRANCH_COLORS[index % BRANCH_COLORS.length] : color, node),
            );
            centerY = (centers[0] + centers[centers.length - 1]) / 2;
        }
        nodes.push({
            id: node.id,
            type: NODE_TYPE,
            position: { x: columnX[depth], y: centerY - size.height / 2 },
            data: { title: node.title, label: shortLabel(node.title), depth, color },
            ...size,
        });
        if (parent) {
            edges.push({
                id: `${parent.id}-${node.id}`,
                source: parent.id,
                target: node.id,
                type: 'default',
                style: { stroke: color, strokeWidth: 2 },
            });
        }
        return centerY;
    };
    place(root, 0);
    return { nodes, edges };
}
