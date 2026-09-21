import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const tsLanguage =
  (TypeScript as any).typescript ||
  (TypeScript as any).default?.typescript ||
  TypeScript;

export class TreeShaker {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(tsLanguage);
  }

  /**
   * Shakes unused declarations and scrubs resulting dead imports.
   */
  public shakeFile(sourceCode: string, requiredSymbols: Set<string>): string {
    if (requiredSymbols.size === 0 || requiredSymbols.has('*')) {
      return sourceCode;
    }

    // Pass 1: Prune unused top-level declarations
    const codeWithPrunedDeclarations = this.pruneDeclarations(sourceCode, requiredSymbols);

    // Pass 2: Scrub dead imports from the pruned code
    const cleanedCode = this.pruneUnusedImports(codeWithPrunedDeclarations);

    return cleanedCode;
  }

  /**
   * Removes top-level statements not present in requiredSymbols.
   */
  private pruneDeclarations(sourceCode: string, requiredSymbols: Set<string>): string {
    const tree = this.parser.parse(sourceCode);
    const rootNode = tree.rootNode;
    const rangesToRemove: Array<{ start: number; end: number }> = [];

    for (let i = 0; i < rootNode.namedChildCount; i++) {
      const child = rootNode.namedChild(i);
      if (!child) continue;

      if (
        child.type === 'export_statement' ||
        child.type === 'function_declaration' ||
        child.type === 'class_declaration' ||
        child.type === 'type_alias_declaration' ||
        child.type === 'interface_declaration' ||
        child.type === 'lexical_declaration'
      ) {
        const declaredName = this.extractDeclaredName(child);

        if (declaredName && !requiredSymbols.has(declaredName)) {
          rangesToRemove.push({
            start: child.startIndex,
            end: child.endIndex,
          });
        }
      }
    }

    if (rangesToRemove.length === 0) {
      return sourceCode;
    }

    rangesToRemove.sort((a, b) => b.start - a.start);

    let pruned = sourceCode;
    for (const range of rangesToRemove) {
      pruned = pruned.slice(0, range.start) + pruned.slice(range.end);
    }

    return pruned;
  }

  /**
   * AST traversal to remove imports whose imported symbols are not used in the code body.
   */
  private pruneUnusedImports(sourceCode: string): string {
    const tree = this.parser.parse(sourceCode);
    const rootNode = tree.rootNode;

    // 1. Gather all import nodes
    const importNodes: Parser.SyntaxNode[] = [];
    for (let i = 0; i < rootNode.namedChildCount; i++) {
      const child = rootNode.namedChild(i);
      if (child && child.type === 'import_statement') {
        importNodes.push(child);
      }
    }

    if (importNodes.length === 0) {
      return sourceCode;
    }

    // 2. Identify all identifiers used outside of import declarations
    const usedIdentifiers = new Set<string>();
    const collectUsedIdentifiers = (node: Parser.SyntaxNode) => {
      // Ignore nodes inside import statements
      if (node.type === 'import_statement') return;

      if (node.type === 'identifier' || node.type === 'type_identifier') {
        usedIdentifiers.add(node.text);
      }

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) collectUsedIdentifiers(child);
      }
    };

    for (let i = 0; i < rootNode.namedChildCount; i++) {
      const child = rootNode.namedChild(i);
      if (child && child.type !== 'import_statement') {
        collectUsedIdentifiers(child);
      }
    }

    // 3. Evaluate each import statement for dead specifiers
    const textEdits: Array<{ start: number; end: number; replacement: string }> = [];

    for (const importNode of importNodes) {
      const importClause = importNode.namedChildren.find((c) => c.type === 'import_clause');
      if (!importClause) {
        // Side-effect import: import './polyfills' -> keep intact
        continue;
      }

      // Check for default import: import Foo from '...'
      const defaultIdentifier = importClause.namedChildren.find((c) => c.type === 'identifier');
      let defaultNeeded = defaultIdentifier ? usedIdentifiers.has(defaultIdentifier.text) : false;

      // Check for named imports: import { A, B } from '...'
      const namedImportsNode = importClause.namedChildren.find((c) => c.type === 'named_imports');
      const keptNamedSpecifiers: string[] = [];
      let hadNamedImports = false;

      if (namedImportsNode) {
        hadNamedImports = true;
        for (let i = 0; i < namedImportsNode.namedChildCount; i++) {
          const specifier = namedImportsNode.namedChild(i);
          if (specifier && specifier.type === 'import_specifier') {
            // Check alias or name (e.g. import { original as alias })
            const nameNode = specifier.namedChildren[specifier.namedChildren.length - 1];
            if (nameNode && usedIdentifiers.has(nameNode.text)) {
              keptNamedSpecifiers.push(specifier.text);
            }
          }
        }
      }

      // Check namespace import: import * as Foo from '...'
      const namespaceImport = importClause.namedChildren.find((c) => c.type === 'namespace_import');
      let namespaceNeeded = false;
      if (namespaceImport) {
        const nsId = namespaceImport.namedChildren.find((c) => c.type === 'identifier');
        if (nsId && usedIdentifiers.has(nsId.text)) {
          namespaceNeeded = true;
        }
      }

      // Determine action for this import statement
      const hasRemainingSpecifiers =
        defaultNeeded || namespaceNeeded || (hadNamedImports && keptNamedSpecifiers.length > 0);

      if (!hasRemainingSpecifiers) {
        // Remove whole import statement (including trailing newline if any)
        const nextCharIndex = importNode.endIndex;
        const hasTrailingNewline = sourceCode[nextCharIndex] === '\n';
        textEdits.push({
          start: importNode.startIndex,
          end: hasTrailingNewline ? nextCharIndex + 1 : nextCharIndex,
          replacement: '',
        });
      } else if (hadNamedImports && keptNamedSpecifiers.length !== namedImportsNode?.namedChildCount) {
        // Some named specifiers were dropped, rewrite just the import clause
        const sourcePathNode = importNode.namedChildren.find((c) => c.type === 'string');
        const sourceModule = sourcePathNode ? sourcePathNode.text : "''";

        let newClauseParts: string[] = [];
        if (defaultNeeded && defaultIdentifier) {
          newClauseParts.push(defaultIdentifier.text);
        }
        if (keptNamedSpecifiers.length > 0) {
          newClauseParts.push(`{ ${keptNamedSpecifiers.join(', ')} }`);
        }

        const replacement = `import ${newClauseParts.join(', ')} from ${sourceModule};`;
        textEdits.push({
          start: importNode.startIndex,
          end: importNode.endIndex,
          replacement,
        });
      }
    }

    if (textEdits.length === 0) {
      return sourceCode;
    }

    // Apply edits bottom to top
    textEdits.sort((a, b) => b.start - a.start);

    let cleaned = sourceCode;
    for (const edit of textEdits) {
      cleaned = cleaned.slice(0, edit.start) + edit.replacement + cleaned.slice(edit.end);
    }

    return cleaned.replace(/\n\s*\n\s*\n/g, '\n\n').trim() + '\n';
  }

  private extractDeclaredName(node: Parser.SyntaxNode): string | null {
    let target = node;
    if (node.type === 'export_statement') {
      const declaration = node.namedChildren.find((c) =>
        [
          'function_declaration',
          'class_declaration',
          'type_alias_declaration',
          'interface_declaration',
          'lexical_declaration',
        ].includes(c.type)
      );
      if (declaration) target = declaration;
    }

    const identifier = target.namedChildren.find(
      (c) => c.type === 'type_identifier' || c.type === 'identifier'
    );
    if (identifier) {
      return identifier.text;
    }

    if (target.type === 'lexical_declaration') {
      const declarator = target.namedChildren.find((c) => c.type === 'variable_declarator');
      if (declarator) {
        const nameNode = declarator.namedChildren.find((c) => c.type === 'identifier');
        if (nameNode) return nameNode.text;
      }
    }

    return null;
  }
}