import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class WorkspaceManager {
  private static readonly BASE_TEMP_DIR = path.join(os.tmpdir(), 'repo-ai-workspaces');

  public static createWorkspace(): string {
    if (!fs.existsSync(this.BASE_TEMP_DIR)) {
      fs.mkdirSync(this.BASE_TEMP_DIR, { recursive: true });
    }

    const workspaceId = uuidv4();
    const workspacePath = path.join(this.BASE_TEMP_DIR, workspaceId);
    fs.mkdirSync(workspacePath, { recursive: true });

    return workspacePath;
  }

  public static cleanupWorkspace(workspacePath: string): void {
    if (fs.existsSync(workspacePath)) {
      try {
        fs.rmSync(workspacePath, { recursive: true, force: true });
      } catch (err: any) {
        console.warn(`[Workspace] Warning: Failed to clean up ${workspacePath}: ${err.message}`);
      }
    }
  }

  public static async withWorkspace<T>(action: (workspacePath: string) => Promise<T>): Promise<T> {
    const workspacePath = this.createWorkspace();
    try {
      return await action(workspacePath);
    } finally {
      this.cleanupWorkspace(workspacePath);
    }
  }
}