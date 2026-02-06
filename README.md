# BMad Studio

BMad Studio is a monorepo project that provides a unified development environment for building AI-powered applications with a Node.js backend and React frontend.

## Prerequisites

- **Node.js** ^22.0.0 (LTS recommended)
- **npm** ^10.0.0 (included with Node.js)
- **Claude Code CLI** (for AI-assisted development)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd bmad-studio

# Install all dependencies
npm install
```

## Running the Application

### Development Mode

Start both server and client in development mode with hot-reload:

```bash
npm run dev
```

- Server runs at: http://localhost:3000
- Client runs at: http://localhost:5173

### Production Mode

Build and run in production mode:

```bash
# Build all packages
npm run build

# Start server and client
npm start
```

### Other Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run build` | Build all packages for production |
| `npm run start` | Run server and client concurrently |
| `npm run test` | Run all tests |
| `npm run lint` | Run ESLint on all packages |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |

## Project Structure

```
bmad-studio/
├── package.json              # Root package with workspaces
├── tsconfig.base.json        # Shared TypeScript config
├── eslint.config.js          # ESLint 9 flat config
├── .prettierrc               # Shared Prettier config
│
├── packages/
│   ├── shared/               # Shared types and utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   │
│   ├── server/               # Express backend (port 3000)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts      # Server entry point
│   │       └── app.ts        # Express app configuration
│   │
│   └── client/               # React frontend (port 5173)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx      # React entry point
│           └── App.tsx       # Main App component
│
└── .vscode/
    └── settings.json         # VS Code workspace settings
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check, returns `{ status: "ok" }` |
| `/api/health` | GET | Detailed health check with version and timestamp |

## License

Private
