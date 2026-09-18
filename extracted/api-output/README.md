# Dependency Graph Feature Slicer

> Category: `code_analysis`

Scans JavaScript/TypeScript codebases, parses source files with Tree-sitter AST queries, and resolves relative import paths alongside external npm dependencies. Provides graph traversal capabilities to isolate self-contained feature slices and their required external dependencies starting from a given entry file.

## Capabilities
- Parse TypeScript/JavaScript source code using Tree-sitter to extract import and export specifiers
- Resolve relative file imports and identify external npm dependency packages
- Construct dependency graphs mapping internal file relationships and external package usages
- Traverse graph dependencies using BFS to isolate feature slices and compute exact file and package requirements

## Files Extracted
- `extracted/slicer/src/analyzer/slicer.ts`
- `extracted/slicer/src/analyzer/resolver.ts`
- `extracted/slicer/src/analyzer/scanner.ts`
- `extracted/slicer/src/analyzer/parser.ts`
