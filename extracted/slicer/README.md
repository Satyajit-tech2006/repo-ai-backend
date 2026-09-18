# Codebase Dependency Analysis and Feature Slicing

> Category: `developer_tools`

A static analysis suite that parses TypeScript and JavaScript codebases to build internal and external dependency graphs. It provides entry-point-driven dependency slicing using graph traversal to identify all reachable internal files and npm package dependencies required by a specific feature slice.

## Capabilities
- AST-based import and export extraction using Tree-sitter for TypeScript
- Repository-wide file scanning and metadata generation
- Module resolution for internal relative imports and external npm packages
- Dependency graph construction mapping file nodes and symbol edges
- Transitive graph traversal (BFS) to extract isolated feature slices from a designated entry point

## Files Extracted
- `src/analyzer/slicer.ts`
- `src/analyzer/resolver.ts`
- `src/analyzer/scanner.ts`
- `src/analyzer/parser.ts`
