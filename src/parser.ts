import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Define the shape of data we want to extract
export interface FileSymbols {
  imports: Array<{
    source: string;
    specifiers: string[];
  }>;
  exports: Array<{
    name: string;
    type: 'function' | 'class' | 'variable' | 'type';
  }>;
}

export class CodeParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    // Use TypeScript grammar (switch to TypeScript.tsx if parsing .tsx files)
    this.parser.setLanguage(TypeScript.typescript);
  }

  public parseSource(sourceCode: string): FileSymbols {
    const tree = this.parser.parse(sourceCode);
    const symbols: FileSymbols = {
      imports: [],
      exports: [],
    };

    // 1. Query for Imports: matches import declarations and captures the path and imported identifiers
    const importQuery = new Parser.Query(
      TypeScript.typescript,
      `
      (import_statement
        source: (string (string_fragment) @import_path)
      )
      `
    );

    const importMatches = importQuery.matches(tree.rootNode);
    for (const match of importMatches) {
      for (const capture of match.captures) {
        if (capture.name === 'import_path') {
          symbols.imports.push({
            source: capture.node.text,
            specifiers: [], // We will refine named specifiers next
          });
        }
      }
    }

    // 2. Query for Exported Functions
    const exportFunctionQuery = new Parser.Query(
      TypeScript.typescript,
      `
      (export_statement
        declaration: (function_declaration
          name: (identifier) @func_name
        )
      )
      `
    );

    const exportMatches = exportFunctionQuery.matches(tree.rootNode);
    for (const match of exportMatches) {
      for (const capture of match.captures) {
        if (capture.name === 'func_name') {
          symbols.exports.push({
            name: capture.node.text,
            type: 'function',
          });
        }
      }
    }

    return symbols;
  }
}

// Test harness
const sampleCode = `
import { User, Session } from './models/user';
import express from 'express';

export function authenticate(token: string): boolean {
    return true;
}

export function authorizeRole(role: string) {
    return (req, res, next) => next();
}

function internalHelper() {
    return 42;
}
`;

const parser = new CodeParser();
const result = parser.parseSource(sampleCode);

console.log('--- Extracted Symbols ---');
console.log(JSON.stringify(result, null, 2));