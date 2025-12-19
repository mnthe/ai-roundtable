# AI Roundtable - Development Commands

## Testing
- `pnpm test` - Run all unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:integration` - Run integration tests (requires API keys)

## Code Quality
- `pnpm lint` - Check linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting
- `pnpm typecheck` - TypeScript type checking

## Build
- `pnpm build` - Build the project
- `pnpm dev` - Run in development mode

## Pre-commit Checklist
1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm format:check`
4. `pnpm test`
