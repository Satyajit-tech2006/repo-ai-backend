import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Robust grammar resolution across ES and CommonJS builds
const tsGrammar =
  (TypeScript as any).typescript ||
  (TypeScript as any).default?.typescript ||
  (TypeScript as any).default ||
  TypeScript;

export interface ImportSpecifier {
  name: string;        // The local name used in the file
  imported?: string;   // The original exported name if aliased (e.g., 'B' in 'import { B as C }')
  isDefault: boolean;
  isNamespace: boolean; // e.g., import * as utils from './utils'
}

export interface FileImport {
  source: string;
  specifiers: ImportSpecifier[];
}

export interface FileExport {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
}

export interface FileSymbols {
  imports: FileImport[];
  exports: FileExport[];
}

export class CodeParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(tsGrammar);
  }

  public parseSource(sourceCode: string): FileSymbols {
    // Strip UTF-8 BOM, normalize line breaks, and guarantee string type
    const sanitizedSource = String(sourceCode || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');

    let tree: Parser.Tree;
    try {
      tree = this.parser.parse(sanitizedSource);
    } catch {
      // Return empty symbols if the native parser encounters unsupported syntax
      return { imports: [], exports: [] };
    }

    const symbols: FileSymbols = {
      imports: [],
      exports: [],
    };

    // -------------------------------------------------------------
    // 1. EXTRACT IMPORTS
    // -------------------------------------------------------------
    try {
      const importQuery = new Parser.Query(tsGrammar, `(import_statement) @import`);
      const importMatches = importQuery.matches(tree.rootNode);

      for (const match of importMatches) {
        const importNode = match.captures[0]?.node;
        if (!importNode) continue;

        const sourceNode = importNode.childForFieldName('source');
        if (!sourceNode) continue;

        const source = sourceNode.text.replace(/^['"]|['"]$/g, '');
        const specifiers: ImportSpecifier[] = [];

        for (let i = 0; i < importNode.namedChildCount; i++) {
          const child = importNode.namedChild(i);
          if (!child) continue;

          if (child.type === 'import_clause') {
            for (let j = 0; j < child.namedChildCount; j++) {
              const clauseChild = child.namedChild(j);
              if (!clauseChild) continue;

              if (clauseChild.type === 'identifier') {
                specifiers.push({
                  name: clauseChild.text,
                  isDefault: true,
                  isNamespace: false,
                });
              }

              if (clauseChild.type === 'named_imports') {
                for (let k = 0; k < clauseChild.namedChildCount; k++) {
                  const spec = clauseChild.namedChild(k);
                  if (!spec || spec.type !== 'import_specifier') continue;

                  const nameNode = spec.childForFieldName('name');
                  const aliasNode = spec.childForFieldName('alias');

                  if (aliasNode && nameNode) {
                    specifiers.push({
                      name: aliasNode.text,
                      imported: nameNode.text,
                      isDefault: false,
                      isNamespace: false,
                    });
                  } else if (nameNode) {
                    specifiers.push({
                      name: nameNode.text,
                      isDefault: false,
                      isNamespace: false,
                    });
                  }
                }
              }

              if (clauseChild.type === 'namespace_import') {
                const idNode = clauseChild.namedChild(0);
                if (idNode) {
                  specifiers.push({
                    name: idNode.text,
                    isDefault: false,
                    isNamespace: true,
                  });
                }
              }
            }
          }
        }

        symbols.imports.push({ source, specifiers });
      }
    } catch (err: any) {
      console.warn(`[Parser] Import query warning: ${err?.message || err}`);
    }

    // -------------------------------------------------------------
    // 2. EXTRACT EXPORTS
    // -------------------------------------------------------------
    try {
      const exportQuery = new Parser.Query(
        tsGrammar,
        `(export_statement declaration: (_) @decl) @export`
      );
      const exportMatches = exportQuery.matches(tree.rootNode);

      for (const match of exportMatches) {
        const declNode = match.captures.find((c) => c.name === 'decl')?.node;
        if (!declNode) continue;

        if (declNode.type === 'function_declaration') {
          const nameNode = declNode.childForFieldName('name');
          if (nameNode) {
            symbols.exports.push({ name: nameNode.text, type: 'function' });
          }
        }

        if (declNode.type === 'class_declaration') {
          const nameNode = declNode.childForFieldName('name');
          if (nameNode) {
            symbols.exports.push({ name: nameNode.text, type: 'class' });
          }
        }

        if (declNode.type === 'interface_declaration') {
          const nameNode = declNode.childForFieldName('name');
          if (nameNode) {
            symbols.exports.push({ name: nameNode.text, type: 'interface' });
          }
        }

        if (declNode.type === 'type_alias_declaration') {
          const nameNode = declNode.childForFieldName('name');
          if (nameNode) {
            symbols.exports.push({ name: nameNode.text, type: 'type' });
          }
        }

        if (declNode.type === 'lexical_declaration') {
          for (let i = 0; i < declNode.namedChildCount; i++) {
            const declarator = declNode.namedChild(i);
            if (declarator?.type === 'variable_declarator') {
              const nameNode = declarator.childForFieldName('name');
              const valueNode = declarator.childForFieldName('value');

              if (nameNode) {
                const isFunction =
                  valueNode?.type === 'arrow_function' ||
                  valueNode?.type === 'function_expression';

                symbols.exports.push({
                  name: nameNode.text,
                  type: isFunction ? 'function' : 'variable',
                });
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Parser] Export query warning: ${err?.message || err}`);
    }

    return symbols;
  }
}

// Verification Harness (guarded so it does not auto-run when imported)
const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('parser.ts')) {
  const testCode = `
  import express, { Request, Response as Res } from 'express';
  import * as dotenv from 'dotenv';
  import { User } from '../models/user';

  export const API_PORT = 5000;
  export const verifyToken = (token: string): boolean => token.length > 0;
  export class AuthService { login() {} }
  export interface AuthConfig { secret: string; }
  export type Role = 'admin' | 'user';
  `;

  const parser = new CodeParser();
  console.log(JSON.stringify(parser.parseSource(testCode), null, 2));
}