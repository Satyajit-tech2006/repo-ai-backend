import simpleGitModule from 'simple-git';

export interface CloneOptions {
  url: string;
  targetPath: string;
  branch?: string;
  token?: string;
}

export class GitCloner {
  /**
   * Clones a repository with a depth of 1 to minimize disk usage and network transfer.
   */
  public static async clone(options: CloneOptions): Promise<string> {
    const { url, targetPath, branch, token } = options;

    let authenticatedUrl = url;
    if (token && url.startsWith('https://')) {
      authenticatedUrl = url.replace('https://', `https://${token}@`);
    }

    // Handles both CommonJS and ESM default import shapes
    const simpleGitFn = typeof simpleGitModule === 'function' 
      ? simpleGitModule 
      : (simpleGitModule as any).default || (simpleGitModule as any).simpleGit;

    const git = simpleGitFn({
      baseDir: targetPath,
      binary: 'git',
      maxConcurrentProcesses: 4,
      trimmed: true,
    });

    const cloneArgs: string[] = ['--depth', '1'];
    if (branch) {
      cloneArgs.push('--branch', branch);
    }

    console.log(`[GitCloner] Cloning ${url} (depth: 1) into ${targetPath}...`);
    await git.clone(authenticatedUrl, targetPath, cloneArgs);
    console.log(`[GitCloner] Clone completed successfully.`);

    return targetPath;
  }
}