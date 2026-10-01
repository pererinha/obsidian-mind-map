# Changelog

## Unreleased

### POC: editable mind maps backed by the note's headings (phase 1)

Goal: find out whether the note's `.md` can stay the single source of truth
while the user edits it as a mind map, and which engine to build on:
[Mind Elixir](https://github.com/SSShooter/mind-elixir-core) 5.15.1 or
[SimpleMindMap](https://github.com/wanglin2/mind-map) 0.14.0.

#### What was built

- `src/md-tree.ts`: Markdown <-> tree adapter. Only ATX headings become nodes.
  Paragraphs, lists, embeds and fenced code under a heading are its body and
  travel with it when the node moves. Heading levels are recomputed from tree
  depth on write, so moving a subtree re-levels it. Blank lines between
  sections are preserved (first-child gap on the parent, sibling gap on the
  node, document default for new nodes). Re-parsing after an external edit
  keeps node ids by matching title under the same parent, so the editor's
  selection and history survive. Unchanged documents round-trip byte for byte.
  Covered by 12 mocha tests in `tests/`, including a real note (`story.md`).
- `src/editor-sync.ts`: one file, one editor. Editor -> file reconciles the
  editor's tree with the parsed file and writes only when the output changed.
  File -> editor listens to the vault `modify` event, ignores our own writes,
  re-parses and reloads the editor.
- `src/mind-elixir-view.ts` and `src/simple-mind-map-view.ts`: one `ItemView`
  per engine, opened by the commands "POC: Edit current note as mind map
  (Mind Elixir | SimpleMindMap)" in a vertical split next to the note.
- Toolchain: TypeScript 5 and `@rollup/plugin-typescript` 8 (Mind Elixir's
  typings use `export type *`), `@rollup/plugin-json` (SimpleMindMap imports
  its `package.json`), a tiny inline rollup plugin that imports `.css` as a
  string, `skipLibCheck` to silence third-party typings.

#### Test protocol and results

Driven against a real Obsidian 1.8.9 instance over the Chrome DevTools
Protocol, with real keyboard and mouse input, checking `Canal.md` after each
step. Both engines passed every step:

| Step | Mind Elixir | SimpleMindMap |
|---|---|---|
| Open note, render map | ok | ok |
| Rename node (double-click) | `finishEdit` | `SET_NODE_TEXT` |
| Add child (Tab) | `addChild` | `INSERT_CHILD_NODE` |
| Add sibling (Enter) | `insertSibling` | `INSERT_NODE` |
| Delete (Delete) | `removeNodes` | `REMOVE_NODE` |
| Reorder (Alt+Up / Cmd+Up) | `moveNodeBefore` | `UP_NODE` |
| Move to another parent (drag) | `moveNodeIn` | `MOVE_NODE_TO` |
| Undo x2, redo x1 | via `linkDiv` + `getData()` | `BACK`/`FORWARD` emit `data_change` |
| External edit of the `.md` | map updates, selection kept, no write-back | same |
| Edit in the map | Obsidian's editor pane reloads immediately | same |

#### Findings that affect the engine decision

- Neither engine parses or writes Markdown headings; the adapter is ours in
  both cases. SimpleMindMap's own Markdown parser keeps only headings and
  lists, drops body text and returns only the first top-level node.
- SimpleMindMap has no Mermaid support despite the README. Mermaid is a third
  representation we would write from the internal tree.
- Mind Elixir's undo/redo emit no operation event; `linkDiv` plus `getData()`
  is the reliable signal and in practice covers every operation.
- Mind Elixir binds F2 to edit; Obsidian binds F2 globally to "rename file"
  and wins. The first scripted run renamed `Canal.md`. Double-click editing
  has no such conflict.
- SimpleMindMap ships no TypeScript declarations on npm and throws if the
  container has zero size at construction. The view waits for layout first.
- Both engines write an intermediate "New node" state before the final text
  when inserting a node, so an insertion costs two writes.
- Bundle: Mind Elixir adds about 120 KB of JS; SimpleMindMap from `index.js`
  with `Drag`, `Select` and `KeyboardNavigation` adds about 1.8 MB.

#### Out of scope for this phase

List items as nodes, indented headings, notes with several top-level headings
(handled with a virtual root named after the file), Mermaid export, choosing
the final engine.
