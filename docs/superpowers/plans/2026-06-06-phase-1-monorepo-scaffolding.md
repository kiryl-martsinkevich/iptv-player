# Phase 1 — Monorepo Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a pnpm monorepo with TypeScript strict mode, ESLint (with a hard import-boundary keeping `packages/core` free of platform code), and Jest — ready for Phase 2 parser implementation.

**Architecture:** Three packages share a root toolchain. `packages/core` is a plain TypeScript library (no React, no RN, no DOM). `packages/tv` and `packages/desktop` are platform shells that will be fully scaffolded in Phases 4 and 5; here they are stubs that satisfy the workspace graph and typecheck.

**Tech Stack:** pnpm 9, TypeScript 5.5, ESLint 8 + @typescript-eslint/eslint-plugin, Jest 29, ts-jest

---

## File Map

| Path | Role |
|------|------|
| `package.json` | Root workspace — scripts, shared devDeps |
| `pnpm-workspace.yaml` | Declares `packages/*` workspace globs |
| `tsconfig.base.json` | Shared TS options (strict, ES2020, source maps) |
| `.eslintrc.js` | Root ESLint — @typescript-eslint/recommended |
| `jest.config.js` | Root Jest — projects array pointing at core |
| `.gitignore` | Standard Node + RN + Tauri ignores |
| `CLAUDE.md` | Decisions, conventions, platform buffer notes |
| `packages/core/package.json` | Core package manifest, no platform deps |
| `packages/core/tsconfig.json` | Extends base; CommonJS, composite build |
| `packages/core/jest.config.js` | ts-jest, node env, displayName: core |
| `packages/core/.eslintrc.js` | **Import boundary** — blocks react-native/* imports |
| `packages/core/src/index.ts` | Empty barrel (expanded each phase) |
| `packages/core/tests/smoke.test.ts` | Verifies Jest + ts-jest are wired correctly |
| `packages/tv/package.json` | TV stub; depends on workspace:core |
| `packages/tv/tsconfig.json` | Extends base; jsx react-native |
| `packages/tv/src/index.ts` | Phase 4 placeholder |
| `packages/desktop/package.json` | Desktop stub; depends on workspace:core |
| `packages/desktop/tsconfig.json` | Extends base; jsx react-jsx, DOM lib |
| `packages/desktop/src/index.ts` | Phase 5 placeholder |

---

### Task 1: Root workspace manifest

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "iptv-player",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "typecheck": "tsc -b packages/core",
    "lint": "eslint 'packages/*/src/**/*.{ts,tsx}'",
    "test": "jest",
    "test:core": "jest --selectProjects core"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.5",
    "typescript": "^5.5.2"
  }
}
```

- [ ] **Step 2: Write pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml
git commit -m "chore: init pnpm workspace root"
```

---

### Task 2: Shared TypeScript config

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write tsconfig.base.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "lib": ["ES2020"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add shared tsconfig.base.json (strict)"
```

---

### Task 3: Root ESLint config

**Files:**
- Create: `.eslintrc.js`

- [ ] **Step 1: Write .eslintrc.js**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Require justifying comment when any is used
    '@typescript-eslint/no-explicit-any': 'error',
  },
  env: {
    node: true,
    es2020: true,
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add .eslintrc.js
git commit -m "chore: add root ESLint config"
```

---

### Task 4: Root Jest config

**Files:**
- Create: `jest.config.js`

- [ ] **Step 1: Write jest.config.js**

```js
/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/packages/core/jest.config.js'],
};
```

- [ ] **Step 2: Commit**

```bash
git add jest.config.js
git commit -m "chore: add root Jest config"
```

---

### Task 5: packages/core scaffold

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/jest.config.js`
- Create: `packages/core/.eslintrc.js`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/smoke.test.ts`

- [ ] **Step 1: Write packages/core/package.json**

```json
{
  "name": "@iptv-player/core",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "devDependencies": {
    "@types/jest": "*"
  }
}
```

- [ ] **Step 2: Write packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write packages/core/jest.config.js**

```js
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'core',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
};
```

- [ ] **Step 4: Write packages/core/.eslintrc.js (platform import boundary)**

```js
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['react-native', 'react-native-*', '@react-native/*', '@react-native-*/*'],
            message:
              'packages/core must not import platform code. Implement the PlaybackController interface in packages/tv or packages/desktop instead.',
          },
        ],
      },
    ],
  },
};
```

- [ ] **Step 5: Write packages/core/src/index.ts**

```ts
// Public API surface — expanded as phases are implemented.
export {};
```

- [ ] **Step 6: Write packages/core/tests/smoke.test.ts**

```ts
describe('core package bootstrap', () => {
  it('imports without error', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('../src/index');
    expect(core).toBeDefined();
  });
});
```

- [ ] **Step 7: Run smoke test — expect PASS**

```bash
cd /path/to/repo && pnpm --filter @iptv-player/core test
```

Expected output: `Tests: 1 passed, 1 total`

- [ ] **Step 8: Commit**

```bash
git add packages/core
git commit -m "feat(core): scaffold core package with platform import boundary"
```

---

### Task 6: packages/tv stub

**Files:**
- Create: `packages/tv/package.json`
- Create: `packages/tv/tsconfig.json`
- Create: `packages/tv/src/index.ts`

- [ ] **Step 1: Write packages/tv/package.json**

```json
{
  "name": "@iptv-player/tv",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@iptv-player/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Write packages/tv/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "jsx": "react-native",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write packages/tv/src/index.ts**

```ts
// Phase 4 placeholder — react-native-tvos scaffold goes here.
export {};
```

- [ ] **Step 4: Commit**

```bash
git add packages/tv
git commit -m "chore(tv): add Phase 4 placeholder package"
```

---

### Task 7: packages/desktop stub

**Files:**
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/tsconfig.json`
- Create: `packages/desktop/src/index.ts`

- [ ] **Step 1: Write packages/desktop/package.json**

```json
{
  "name": "@iptv-player/desktop",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@iptv-player/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Write packages/desktop/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write packages/desktop/src/index.ts**

```ts
// Phase 5 placeholder — RN-Web + Tauri scaffold goes here.
export {};
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop
git commit -m "chore(desktop): add Phase 5 placeholder package"
```

---

### Task 8: .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write .gitignore**

```
# dependencies
node_modules/
.pnpm-store/

# build output
dist/
*.tsbuildinfo

# Tauri
packages/desktop/src-tauri/target/

# RN
packages/tv/.metro-health-check*
packages/tv/android/build/
packages/tv/android/.gradle/
packages/tv/ios/Pods/
packages/tv/ios/build/

# misc
.DS_Store
*.log
.env
.env.local
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

### Task 9: Verify full toolchain

- [ ] **Step 1: Install all dependencies**

```bash
pnpm install
```

Expected: lockfile written, no errors.

- [ ] **Step 2: Typecheck core**

```bash
pnpm typecheck
```

Expected: exits 0, no errors.

- [ ] **Step 3: Run linter**

```bash
pnpm lint
```

Expected: exits 0.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: `Test Suites: 1 passed` (core smoke test).

- [ ] **Step 5: Verify boundary rule fires**

Add a temporary bad import to `packages/core/src/index.ts`:
```ts
import { View } from 'react-native'; // should trigger lint error
```

Run:
```bash
pnpm lint
```

Expected: error `no-restricted-imports` on that line. Remove the line after confirming.

---

### Task 10: CLAUDE.md

See separate task — written after all other files are in place so it can reference accurate paths.
