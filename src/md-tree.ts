/*
 * Markdown <-> tree adapter.
 *
 * The .md file stays the source of truth. Each ATX heading becomes a node; the
 * lines under a heading (up to the next heading) are its body and travel with
 * the node when it moves. Heading levels are recomputed from tree depth on
 * serialization, so moving a node under a new parent re-levels its subtree.
 *
 * Blank lines that separate sections are stored on the node that follows
 * them (`gapBefore`), except for a parent's first child, whose gap is stored
 * on the parent (`gapFirstChild`). Reordering siblings then keeps the
 * document's spacing pattern, and an unchanged document round-trips byte for
 * byte.
 */

export interface MdNode {
    id: string;
    title: string;
    /** Blank lines before this heading when it is not its parent's first child; undefined falls back to the tree default. */
    gapBefore?: number;
    /** Blank lines between this node's body and its first child heading; undefined falls back to the tree default. */
    gapFirstChild?: number;
    /** Lines under the heading, trailing blank lines removed. */
    body: string[];
    children: MdNode[];
}

export interface MdTree {
    /** Lines before the first heading (front matter, intro text), trailing blanks removed. */
    preamble: string[];
    /** Heading level of the first heading; top-level nodes serialize at this level. */
    baseLevel: number;
    /** Blank lines at the end of the file (1 means the file ends with a newline). */
    trailingBlanks: number;
    /** Most common gap in the document; used for new nodes and parents that had no children. */
    defaultGap: number;
    /** Not serialized; holds the top-level headings. */
    root: MdNode;
}

/** Engine-agnostic shape the views exchange with the editor libraries. */
export interface PlainNode {
    id: string;
    title: string;
    children: PlainNode[];
}

const HEADING_RE = /^(#{1,6})(?:\s+(.*))?$/;
const FENCE_RE = /^(```|~~~)/;

let idCounter = 0;
export function nextId(): string {
    idCounter += 1;
    return `md${idCounter}`;
}

function trimTrailingBlanks(lines: string[]): number {
    let removed = 0;
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
        removed += 1;
    }
    return removed;
}

/**
 * Parses `md`. When `previous` is given, nodes keep the ids of the matching
 * nodes in the previous tree (same title under the same parent, else same
 * position), so editors keyed by id survive an external edit of the file.
 */
export function parseMarkdown(md: string, previous?: MdTree): MdTree {
    const lines = md.split('\n');
    const root: MdNode = { id: 'root', title: '', body: [], children: [] };
    const tree: MdTree = { preamble: [], baseLevel: 1, trailingBlanks: 0, defaultGap: 0, root };
    const gapCounts = new Map<number, number>();

    // stack of [level, node]; the virtual root sits at level 0
    const stack: Array<{ level: number; node: MdNode }> = [{ level: 0, node: root }];
    let current: MdNode | null = null;
    let inFence = false;
    let seenHeading = false;

    for (const line of lines) {
        if (FENCE_RE.test(line)) {
            inFence = !inFence;
        }
        const match = inFence ? null : line.match(HEADING_RE);
        if (!match) {
            if (current) {
                current.body.push(line);
            } else {
                tree.preamble.push(line);
            }
            continue;
        }

        const level = match[1].length;
        const title = match[2] ?? '';
        const gapBefore = current ? trimTrailingBlanks(current.body) : trimTrailingBlanks(tree.preamble);
        if (!seenHeading) {
            tree.baseLevel = level;
            seenHeading = true;
        }

        gapCounts.set(gapBefore, (gapCounts.get(gapBefore) ?? 0) + 1);
        const node: MdNode = { id: nextId(), title, body: [], children: [] };
        while (stack[stack.length - 1].level >= level) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].node;
        if (parent.children.length === 0) {
            parent.gapFirstChild = gapBefore;
        } else {
            node.gapBefore = gapBefore;
        }
        parent.children.push(node);
        stack.push({ level, node });
        current = node;
    }

    tree.trailingBlanks = current ? trimTrailingBlanks(current.body) : trimTrailingBlanks(tree.preamble);
    gapCounts.forEach((count, gap) => {
        const best = gapCounts.get(tree.defaultGap) ?? 0;
        if (count > best || (count === best && gap > tree.defaultGap)) {
            tree.defaultGap = gap;
        }
    });
    if (previous) {
        adoptIds(root, previous.root);
    }
    return tree;
}

function adoptIds(node: MdNode, previous: MdNode): void {
    const unused = [...previous.children];
    const matches: Array<[MdNode, MdNode | undefined]> = node.children.map(child => {
        const byTitle = unused.findIndex(old => old.title === child.title);
        return [child, byTitle >= 0 ? unused.splice(byTitle, 1)[0] : undefined];
    });
    matches.forEach(([child, old], index) => {
        const match = old ?? (unused.length > 0 && previous.children[index] && unused.includes(previous.children[index])
            ? unused.splice(unused.indexOf(previous.children[index]), 1)[0]
            : undefined);
        if (match) {
            child.id = match.id;
            adoptIds(child, match);
        }
    });
}

export function serializeMarkdown(tree: MdTree): string {
    const out: string[] = [...tree.preamble];
    const emit = (node: MdNode, level: number, gap: number) => {
        for (let i = 0; i < gap; i++) {
            out.push('');
        }
        out.push(node.title === '' ? '#'.repeat(level) : `${'#'.repeat(level)} ${node.title}`);
        out.push(...node.body);
        node.children.forEach((child, index) => emit(child, level + 1, gapFor(node, child, index)));
    };
    const gapFor = (parent: MdNode, child: MdNode, index: number) =>
        (index === 0 ? parent.gapFirstChild : child.gapBefore) ?? tree.defaultGap;
    tree.root.children.forEach((child, index) => emit(child, tree.baseLevel, gapFor(tree.root, child, index)));
    for (let i = 0; i < tree.trailingBlanks; i++) {
        out.push('');
    }
    return out.join('\n');
}

/**
 * The node the editor shows as its root. A document with a single top-level
 * heading uses that heading; otherwise the virtual root stands in, titled
 * with the given fallback (typically the file name).
 */
export function mapRoot(tree: MdTree, fallbackTitle: string): PlainNode {
    const top = tree.root.children;
    const source = top.length === 1 ? top[0] : { ...tree.root, title: fallbackTitle };
    return toPlain(source);
}

export function toPlain(node: MdNode): PlainNode {
    return { id: node.id, title: node.title, children: node.children.map(toPlain) };
}

function indexNodes(node: MdNode, into: Map<string, MdNode>): void {
    into.set(node.id, node);
    node.children.forEach(child => indexNodes(child, into));
}

/**
 * Rebuild the tree from the editor's current structure. Titles, order and
 * nesting come from the editor; bodies and gaps come from the existing nodes
 * matched by id. Unknown ids are new nodes.
 */
export function reconcile(tree: MdTree, editorRoot: PlainNode): MdTree {
    const known = new Map<string, MdNode>();
    indexNodes(tree.root, known);

    const rebuild = (plain: PlainNode): MdNode => {
        const existing = known.get(plain.id);
        return {
            id: plain.id,
            title: plain.title,
            gapBefore: existing?.gapBefore,
            gapFirstChild: existing?.gapFirstChild,
            body: existing ? existing.body : [],
            children: plain.children.map(rebuild),
        };
    };

    const rebuilt = rebuild(editorRoot);
    const singleTop = tree.root.children.length === 1 && tree.root.children[0].id === editorRoot.id;
    const root: MdNode = singleTop
        ? { ...tree.root, children: [rebuilt] }
        : { ...tree.root, children: rebuilt.children };
    return { ...tree, root };
}
