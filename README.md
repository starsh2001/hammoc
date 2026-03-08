# BMad Studio

A web-based IDE for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions, projects, and workflows.

## Quick Start

Run directly with npx (no installation needed):

```bash
npx bmad-studio
```

Or install globally:

```bash
npm install -g bmad-studio
bmad-studio
```

Then open http://localhost:3000 in your browser.

### CLI Options

```
bmad-studio [options]

Options:
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --host <string>   Host to bind to (default: 0.0.0.0, env: HOST)
  --reset-password  Reset the admin password
  -h, --help        Show this help message
  -v, --version     Show version number
```

## Prerequisites

- **Node.js** >= 18.0.0 (v22 LTS recommended)
- **Claude Code CLI** installed and configured

## Development

### Setup

```bash
git clone https://github.com/bmad-studio/bmad-studio.git
cd bmad-studio
npm install
```

### Development Mode

Start both server and client with hot-reload:

```bash
npm run dev
```

- Server: http://localhost:3000
- Client: http://localhost:5173

### Production Mode

```bash
npm run build
npm start
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run build` | Build all packages for production |
| `npm run start` | Run server in production mode |
| `npm run test` | Run all tests |
| `npm run lint` | Run ESLint on all packages |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |

## Project Structure

```
bmad-studio/
├── bin/
│   └── bmad-studio.js            # CLI entry point
├── package.json                  # Root package with workspaces
├── packages/
│   ├── shared/                   # Shared types and utilities
│   ├── server/                   # Express + Socket.io backend
│   └── client/                   # React + Vite frontend
└── scripts/
    └── postinstall.cjs           # Post-install shared package linker
```

## License

MIT
