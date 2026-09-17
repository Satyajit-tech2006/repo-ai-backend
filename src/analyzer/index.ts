// Parser exports
export {
  CodeParser,
  type ImportSpecifier,
  type FileImport,
  type FileExport,
  type FileSymbols,
} from './parser';

// Scanner exports
export {
  RepoScanner,
  type RepoMetadata,
} from './scanner';

// Resolver exports
export {
  ModuleResolver,
  type ResolvedEdge,
  type ExternalDependency,
  type DependencyGraph,
} from './resolver';

// Slicer exports
export {
  GraphSlicer,
  type FeatureSlice,
} from './slicer';


// Detector exports
export {
  EntryPointDetector,
  type EntryCandidate,
} from './detector';