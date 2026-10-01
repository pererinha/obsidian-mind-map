import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';

// Inline .css imports as strings so views can inject engine styles at runtime.
const cssAsString = () => ({
  name: 'css-as-string',
  transform(code, id) {
    if (!id.endsWith('.css')) return null;
    return { code: `export default ${JSON.stringify(code)};`, map: { mappings: '' } };
  }
});

const TEST_VAULT = 'test-vault/.obsidian/plugins/obsidian-mind-map';

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist/',
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    cssAsString(),
    // React and React Flow read process.env.NODE_ENV; Obsidian has no process.env.
    replace({ 'process.env.NODE_ENV': JSON.stringify('production'), preventAssignment: true }),
    typescript(),
    // markmap (d3 v6) and React Flow pull different d3-selection majors; d3-transition
    // patches only one Selection prototype, so a single copy is required for zoom to work.
    nodeResolve({browser: true, dedupe: ['d3-selection']}),
    commonjs(),
    json(),
    copy({
      targets: [
        { src: 'dist/main.js', dest: TEST_VAULT },
        { src: ['manifest.json', 'styles.css'], dest: TEST_VAULT }
      ], flatten: true, hook: 'writeBundle'
    })
  ]
};