// Lint do Tem Água? (ESLint 10, flat config).
//
//   npm run lint            → tudo
//   npm run lint:backend    → só a API (apps/api, Node)
//   npm run lint:frontend   → shell (Angular), mapa (React), painel e métricas (Vue) e contracts
//
// Só regras que pegam erro de verdade (recommended / essential); formatação fica de fora.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/.angular/**', 'apps/api/data/**']),

  js.configs.recommended,

  // Backend e scripts: Node com ES modules.
  {
    files: ['apps/api/**/*.mjs', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Front-ends em TypeScript (Angular, React, contracts).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
  },

  // Vue (painel e métricas): <script setup lang="ts">.
  {
    files: ['**/*.vue'],
    extends: [vue.configs['flat/essential'], tseslint.configs.recommended],
    // O recommended do TypeScript troca o parser; o do .vue tem de ser o vue-eslint-parser,
    // que entrega o <script lang="ts"> ao parser do TypeScript.
    languageOptions: {
      parser: vueParser,
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },

  // TypeScript já confere nomes não declarados (inclusive tipos do DOM, como Keyframe).
  {
    files: ['**/*.{ts,tsx,vue}'],
    rules: { 'no-undef': 'off' },
  },

  // Componentes montados por código (mount()), nunca usados como tag: nome de uma palavra não colide com HTML.
  {
    files: ['**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  // React (mapa): regras dos hooks.
  {
    files: ['apps/mapa/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Configs do Vite/Angular rodam no Node.
  {
    files: ['apps/*/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
