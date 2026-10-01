import { expect } from 'chai';
import { mapRoot, parseMarkdown, reconcile, serializeMarkdown, PlainNode } from '../src/md-tree';

const CANAL = [
    '# Canal',
    '',
    '## Pesquisa',
    '',
    '### Referências',
    '### Artigos',
    '',
    '## Roteiro',
    '',
    '### Introdução',
    '### Desenvolvimento',
    '',
].join('\n');

const CANAL_AFTER_MOVE = [
    '# Canal',
    '',
    '## Pesquisa',
    '',
    '### Referências',
    '',
    '## Roteiro',
    '',
    '### Introdução',
    '### Desenvolvimento',
    '### Artigos',
    '',
].join('\n');

function find(node: PlainNode, title: string): PlainNode | undefined {
    if (node.title === title) return node;
    for (const child of node.children) {
        const hit = find(child, title);
        if (hit) return hit;
    }
    return undefined;
}

describe('md-tree', () => {
    it('round-trips the Canal example byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(CANAL))).to.equal(CANAL);
    });

    it('builds the expected hierarchy', () => {
        const root = mapRoot(parseMarkdown(CANAL), 'file');
        expect(root.title).to.equal('Canal');
        expect(root.children.map(c => c.title)).to.deep.equal(['Pesquisa', 'Roteiro']);
        expect(root.children[0].children.map(c => c.title)).to.deep.equal(['Referências', 'Artigos']);
    });

    it('moving Artigos into Roteiro produces the expected markdown', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        const pesquisa = find(root, 'Pesquisa')!;
        const roteiro = find(root, 'Roteiro')!;
        const artigos = find(root, 'Artigos')!;
        pesquisa.children = pesquisa.children.filter(c => c !== artigos);
        roteiro.children.push(artigos);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(CANAL_AFTER_MOVE);
    });

    it('reordering siblings keeps the spacing pattern of the parent', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        const pesquisa = find(root, 'Pesquisa')!;
        pesquisa.children.reverse();
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Pesquisa\n\n### Artigos\n\n### Referências\n\n## Roteiro');
    });

    it('re-parsing with the previous tree keeps node ids', () => {
        const first = parseMarkdown(CANAL);
        const roteiroId = find(mapRoot(first, 'f'), 'Roteiro')!.id;
        const second = parseMarkdown(CANAL + '### Encerramento\n', first);
        const root = mapRoot(second, 'f');
        expect(find(root, 'Roteiro')!.id).to.equal(roteiroId);
        expect(find(root, 'Encerramento')!.id).to.not.equal(roteiroId);
        const renamed = parseMarkdown(CANAL.replace('## Roteiro', '## Script'), first);
        expect(find(mapRoot(renamed, 'f'), 'Script')!.id).to.equal(roteiroId);
    });

    it('body text travels with its heading and is re-leveled', () => {
        const md = '# A\n\n## B\n\ntext under b\n\n## C\n';
        const tree = parseMarkdown(md);
        const root = mapRoot(tree, 'file');
        const b = find(root, 'B')!;
        const c = find(root, 'C')!;
        root.children = [c];
        c.children.push(b);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal('# A\n\n## C\n\n### B\n\ntext under b\n');
    });

    it('keeps front matter, preamble and fenced code', () => {
        const md = '---\ntags: x\n---\nintro\n\n# A\n\n```\n# not a heading\n```\n\n## B\n';
        expect(serializeMarkdown(parseMarkdown(md))).to.equal(md);
        expect(mapRoot(parseMarkdown(md), 'f').children.map(c => c.title)).to.deep.equal(['B']);
    });

    it('uses a virtual root when there are several top-level headings', () => {
        const md = '## A\n## B\n';
        const tree = parseMarkdown(md);
        const root = mapRoot(tree, 'note');
        expect(root.title).to.equal('note');
        expect(root.children.map(c => c.title)).to.deep.equal(['A', 'B']);
        expect(serializeMarkdown(reconcile(tree, root))).to.equal(md);
    });

    it('renames and adds nodes through reconcile', () => {
        const tree = parseMarkdown(CANAL);
        const root = mapRoot(tree, 'file');
        find(root, 'Roteiro')!.title = 'Script';
        find(root, 'Introdução')!.children.push({ id: 'new1', title: 'Gancho', children: [] });
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('## Script\n');
        expect(out).to.contain('### Introdução\n\n#### Gancho\n### Desenvolvimento');
    });
});

describe('md-tree with a real note (story.md)', () => {
    const fs = require('fs');
    const story: string = fs.readFileSync(__dirname + '/fixtures-story.md', 'utf8');

    it('round-trips byte for byte', () => {
        expect(serializeMarkdown(parseMarkdown(story))).to.equal(story);
    });

    it('keeps lists and paragraphs as body of their heading', () => {
        const root = mapRoot(parseMarkdown(story), 'story');
        expect(root.title).to.equal('story');
        expect(root.children.map(c => c.title)).to.deep.equal(['story vs narrative', 'what is a story', 'the spine', 'summary']);
        expect(find(root, 'a narrative')!.children).to.have.length(0);
    });

    it('moving "summary" under "the spine" carries its paragraphs and re-levels "important"', () => {
        const tree = parseMarkdown(story);
        const root = mapRoot(tree, 'story');
        const summary = find(root, 'summary')!;
        root.children = root.children.filter(c => c !== summary);
        find(root, 'the spine')!.children.push(summary);
        const out = serializeMarkdown(reconcile(tree, root));
        expect(out).to.contain('### summary\nthe protagonist encounters');
        expect(out).to.contain('#### important\na story without a *problem*');
        expect(out.split('\n').length).to.equal(story.split('\n').length);
    });
});
