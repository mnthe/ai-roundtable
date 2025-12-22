# File Search Tools Implementation Plan

> **Status**: Planning
> **Priority**: P2 (Optional Enhancement)
> **Prerequisite**: Context Request Pattern (P0) - Completed

## Overview

This plan describes the implementation of embedded file search tools for AI agents during debates. These tools provide low-latency, sandboxed read-only file access without requiring caller roundtrips.

**Key Characteristics:**
- Read-only operations only
- Sandboxed with multiple security layers
- Opt-in via environment variable (disabled by default)
- Complements `request_context` tool (not a replacement)

## Tools Specification

### 1. `read_file`

Read file contents with security validation.

```typescript
// Schema
const ReadFileInputSchema = z.object({
  path: z.string().describe('Relative path to the file to read'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  maxLines: z.number().optional().describe('Maximum lines to read (from start)'),
});

// Output
interface ReadFileOutput {
  path: string;
  content: string;
  size: number;
  encoding: 'utf-8' | 'base64';
}
```

### 2. `list_directory`

List directory contents with optional recursion.

```typescript
// Schema
const ListDirectoryInputSchema = z.object({
  path: z.string().describe('Relative path to the directory'),
  recursive: z.boolean().default(false),
  maxDepth: z.number().default(1).describe('Max recursion depth if recursive'),
  includeHidden: z.boolean().default(false),
});

// Output
interface ListDirectoryOutput {
  path: string;
  entries: DirectoryEntry[];
  totalCount: number;
}

interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}
```

### 3. `file_exists`

Check if a file or directory exists.

```typescript
// Schema
const FileExistsInputSchema = z.object({
  path: z.string().describe('Relative path to check'),
});

// Output
interface FileExistsOutput {
  path: string;
  exists: boolean;
  type?: 'file' | 'directory';
}
```

### 4. `get_file_info`

Get file metadata without reading content.

```typescript
// Schema
const GetFileInfoInputSchema = z.object({
  path: z.string().describe('Relative path to the file'),
});

// Output
interface GetFileInfoOutput {
  path: string;
  size: number;
  modified: Date;
  created: Date;
  type: 'file' | 'directory';
  permissions: string;
}
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    DefaultAgentToolkit                           │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                 File Search Tools (NEW)                      ││
│  │  ┌──────────────────────────────────────────────────────────┐││
│  │  │                 FileSystemSandbox                        │││
│  │  │  ┌─────────────┐ ┌────────────────┐ ┌──────────────────┐ │││
│  │  │  │PathValidator│ │ResourceLimiter │ │   AuditLogger    │ │││
│  │  │  └──────┬──────┘ └───────┬────────┘ └─────────┬────────┘ │││
│  │  │         │                │                    │          │││
│  │  │  ┌──────▼────────────────▼────────────────────▼────────┐ │││
│  │  │  │              Sandboxed FS Operations                │ │││
│  │  │  │  read_file | list_directory | file_exists | info    │ │││
│  │  │  └─────────────────────────────────────────────────────┘ │││
│  │  └──────────────────────────────────────────────────────────┘││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

## Security Design

### Layer 1: Path Validator

```typescript
// src/tools/sandbox/path-validator.ts
export interface PathValidatorConfig {
  basePath: string;             // Sandbox root (default: cwd)
  allowedExtensions?: string[]; // Optional file type filter
  deniedPatterns: string[];     // Glob patterns to block
  maxPathDepth: number;         // Max directory depth (default: 20)
}

export class PathValidator {
  validate(requestedPath: string): ValidatedPath {
    // 1. Resolve to absolute path
    // 2. Canonical path check (resolve symlinks)
    // 3. Verify still under basePath after resolution
    // 4. Block parent directory traversal (..)
    // 5. Check denied patterns
    // 6. Check path depth
    // 7. Check allowed extensions (if configured)
  }
}
```

**Security checks:**
| Check              | Purpose                        |
| ------------------ | ------------------------------ |
| Path resolution    | Prevent relative path escapes  |
| Symlink resolution | Prevent symlink-based escapes  |
| Parent traversal   | Block `..` in paths            |
| Denied patterns    | Block sensitive files          |
| Path depth         | Prevent deep traversal attacks |
| Extension filter   | Optional file type restriction |

### Layer 2: Resource Limiter

```typescript
// src/tools/sandbox/resource-limiter.ts
export interface ResourceLimits {
  maxFileSize: number;           // 1MB default
  maxFilesPerRequest: number;    // 100 files default
  maxTotalBytesPerRound: number; // 5MB per round
  maxRequestsPerRound: number;   // 50 requests per round
  requestTimeoutMs: number;      // 5 seconds per operation
}

export class ResourceLimiter {
  checkFileSize(size: number): void;
  trackBytesRead(bytes: number): void;
  trackRequest(): void;
  resetForNewRound(): void;
}
```

**Default limits:**
| Limit                  | Default Value |
| ---------------------- | ------------- |
| Max file size          | 1 MB          |
| Max files per list     | 100           |
| Max bytes per round    | 5 MB          |
| Max requests per round | 50            |
| Request timeout        | 5 seconds     |

### Layer 3: Denied Patterns

Default patterns to block:

```typescript
const DEFAULT_DENIED_PATTERNS = [
  // Secrets and credentials
  '**/.env', '**/.env.*', '**/*.key', '**/*.pem',
  '**/credentials*', '**/secrets*', '**/*password*', '**/*token*',

  // Git internals
  '**/.git/**',

  // Package managers (large, rarely useful)
  '**/node_modules/**', '**/vendor/**', '**/.venv/**',

  // Build outputs
  '**/dist/**', '**/build/**', '**/target/**', '**/.next/**',

  // IDE and editor
  '**/.idea/**', '**/.vscode/**',

  // OS files
  '**/.DS_Store', '**/Thumbs.db',

  // Binary files
  '**/*.exe', '**/*.dll', '**/*.so', '**/*.dylib',
];
```

### Layer 4: Audit Logger

```typescript
// src/tools/sandbox/audit-logger.ts
export interface AuditEntry {
  timestamp: Date;
  sessionId: string;
  agentId: string;
  operation: 'read_file' | 'list_directory' | 'file_exists' | 'get_file_info';
  path: string;
  result: 'success' | 'denied' | 'error';
  reason?: string;
  bytesRead?: number;
  fileCount?: number;
  durationMs: number;
}

export class AuditLogger {
  log(entry: Omit<AuditEntry, 'timestamp'>): void;
  getEntriesForSession(sessionId: string): AuditEntry[];
  exportForDebug(): AuditEntry[];
}
```

## Error Types

```typescript
// src/tools/sandbox/errors.ts
export class SecurityError extends RoundtableError {
  code: 'PATH_ESCAPE' | 'PATH_TRAVERSAL' | 'DENIED_PATTERN' |
        'EXTENSION_DENIED' | 'PATH_TOO_DEEP';
}

export class ResourceError extends RoundtableError {
  code: 'FILE_TOO_LARGE' | 'ROUND_LIMIT_EXCEEDED' |
        'RATE_LIMIT_EXCEEDED' | 'TIMEOUT';
}
```

## Configuration

### Environment Variables

| Variable                      | Default         | Description               |
| ----------------------------- | --------------- | ------------------------- |
| `AI_ROUNDTABLE_FILE_TOOLS`    | `false`         | Enable file search tools  |
| `AI_ROUNDTABLE_BASE_PATH`     | `process.cwd()` | Sandbox root directory    |
| `AI_ROUNDTABLE_MAX_FILE_SIZE` | `1048576`       | Maximum file size (bytes) |

### Configuration Interface

```typescript
// src/config/file-tools.ts
export interface FileToolsConfig {
  enabled: boolean;
  basePath: string;
  pathValidation: {
    deniedPatterns: string[];
    allowedExtensions?: string[];
    maxPathDepth: number;
  };
  resourceLimits: ResourceLimits;
  audit: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn';
  };
}

export function loadFileToolsConfig(): FileToolsConfig {
  return {
    enabled: process.env.AI_ROUNDTABLE_FILE_TOOLS === 'true',
    basePath: process.env.AI_ROUNDTABLE_BASE_PATH || process.cwd(),
    // ...defaults
  };
}
```

## Integration with Toolkit

```typescript
// src/tools/toolkit.ts
private registerFileTools(): void {
  if (!this.config.fileToolsEnabled) {
    // Don't register - agents use request_context instead
    return;
  }

  const sandbox = new FileSystemSandbox(this.config);

  this.registerTool({
    name: 'read_file',
    description: 'Read file contents from the project directory',
    parameters: { /* from schema */ },
    executor: (input) => executeReadFile(input, sandbox, this.getToolContext()),
  });

  // Similarly for list_directory, file_exists, get_file_info
}
```

## File Structure

```
src/tools/
├── toolkit.ts              # Existing (add file tool registration)
├── schemas.ts              # Existing (add file tool schemas)
└── sandbox/                # NEW
    ├── index.ts            # FileSystemSandbox class
    ├── path-validator.ts   # Path validation
    ├── resource-limiter.ts # Resource limiting
    ├── audit-logger.ts     # Audit logging
    ├── denied-patterns.ts  # Default denied patterns
    ├── errors.ts           # SecurityError, ResourceError
    └── executors/          # Tool executors
        ├── read-file.ts
        ├── list-directory.ts
        ├── file-exists.ts
        └── get-file-info.ts

src/config/
└── file-tools.ts           # NEW - configuration

tests/unit/tools/
└── sandbox/                # NEW
    ├── path-validator.test.ts
    ├── resource-limiter.test.ts
    ├── audit-logger.test.ts
    └── executors/
        ├── read-file.test.ts
        ├── list-directory.test.ts
        ├── file-exists.test.ts
        └── get-file-info.test.ts
```

## Implementation Phases

### Phase 1: Core Sandbox
1. Implement `PathValidator` with all security checks
2. Implement `ResourceLimiter` with per-round tracking
3. Create `AuditLogger` for operation logging
4. Add `SecurityError` and `ResourceError` types
5. Unit tests for all components

### Phase 2: Tool Executors
1. Implement `read_file` executor
2. Implement `list_directory` executor
3. Implement `file_exists` executor
4. Implement `get_file_info` executor
5. Integration tests for each tool

### Phase 3: Integration
1. Add Zod schemas to `src/tools/schemas.ts`
2. Register tools in `DefaultAgentToolkit`
3. Add environment variable configuration
4. Update `ResourceLimiter` reset on new round

### Phase 4: Testing & Documentation
1. Security-focused testing (fuzzing, edge cases)
2. Performance benchmarks
3. Update README with configuration
4. Update `.env.example`

## Testing Strategy

### Unit Tests

```typescript
describe('PathValidator', () => {
  it('should reject path traversal attempts', () => {
    const validator = new PathValidator({ basePath: '/project' });
    expect(() => validator.validate('../etc/passwd')).toThrow('PATH_TRAVERSAL');
  });

  it('should reject symlink escapes');
  it('should reject denied patterns');
  it('should reject paths exceeding max depth');
});

describe('ResourceLimiter', () => {
  it('should enforce file size limits');
  it('should track cumulative bytes per round');
  it('should reset limits on new round');
});
```

### Integration Tests

```typescript
describe('File Tools Integration', () => {
  it('should read allowed files successfully');
  it('should block access to .env files');
  it('should list directory contents');
  it('should enforce rate limits across multiple requests');
});
```

## Checklist

- [ ] Phase 1: Core Sandbox
  - [ ] `PathValidator` class
  - [ ] `ResourceLimiter` class
  - [ ] `AuditLogger` class
  - [ ] Error types (`SecurityError`, `ResourceError`)
  - [ ] Unit tests for sandbox components

- [ ] Phase 2: Tool Executors
  - [ ] `read_file` executor
  - [ ] `list_directory` executor
  - [ ] `file_exists` executor
  - [ ] `get_file_info` executor
  - [ ] Unit tests for executors

- [ ] Phase 3: Integration
  - [ ] Zod schemas in `src/tools/schemas.ts`
  - [ ] Tool registration in `DefaultAgentToolkit`
  - [ ] Configuration loading (`loadFileToolsConfig`)
  - [ ] Environment variable handling
  - [ ] Round reset integration with `ResourceLimiter`

- [ ] Phase 4: Testing & Documentation
  - [ ] Security fuzzing tests
  - [ ] Performance benchmarks
  - [ ] README documentation
  - [ ] `.env.example` updates
