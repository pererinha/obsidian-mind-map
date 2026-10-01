import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';

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
    typescript(),
    nodeResolve({browser: true}),
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