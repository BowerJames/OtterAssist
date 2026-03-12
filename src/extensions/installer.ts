/**
 * Extension installer - install, uninstall, and manage OtterAssist extensions
 * @see Issue #27
 */

import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { loadConfig, saveConfig } from "../config/loader.ts";
import type { Logger } from "../types/index.ts";
import { GLOBAL_EXTENSIONS_DIR, loadExtensionFromPath } from "./index.ts";

/**
 * Options for installing an extension
 */
export interface InstallOptions {
  /** Create symlink instead of copy (for development) */
  link?: boolean;
  /** Overwrite existing extension */
  force?: boolean;
  /** Auto-enable in config after install (default: true) */
  enable?: boolean;
}

/**
 * Information about an installed extension
 */
export interface InstalledExtension {
  /** Extension name */
  name: string;
  /** Extension description */
  description: string;
  /** Path to extension directory/file */
  path: string;
  /** Extension version if available */
  version?: string;
  /** Whether this is a symlink */
  linked: boolean;
  /** Git URL if installed from git */
  gitUrl?: string;
  /** When the extension was installed */
  installedAt: Date;
  /** Whether the extension is enabled in config */
  enabled: boolean;
}

/**
 * Result of an install operation
 */
export interface InstallResult {
  /** Information about the installed extension */
  extension: InstalledExtension;
  /** Whether dependencies were installed (package.json existed) */
  dependenciesInstalled: boolean;
  /** Whether a symlink was created */
  wasLinked: boolean;
  /** Whether the extension was enabled in config */
  wasEnabled: boolean;
}

/**
 * Resolved source for installation
 */
interface ResolvedSource {
  type: "local-file" | "local-dir" | "git";
  /** Local path (for local sources) or temp clone path (for git) */
  path: string;
  /** Original git URL if git source */
  gitUrl?: string;
  /** Subdirectory within the source to use */
  subdir?: string;
  /** Temp directory to clean up after install (for git clones) */
  tempDir?: string;
}

/**
 * Extension metadata from otterassist.json
 */
interface ExtensionMetadata {
  name?: string;
  version?: string;
  description?: string;
}

/**
 * Install an extension from a local path or git URL
 *
 * @param source - Path to extension file/directory or git URL
 * @param options - Installation options
 * @param logger - Optional logger for output
 * @returns Install result with extension info
 */
export async function installExtension(
  source: string,
  options: InstallOptions = {},
  logger?: Logger,
): Promise<InstallResult> {
  const { link = false, force = false, enable = true } = options;

  logger?.info(`Installing extension from: ${source}`);

  // 1. Resolve the source
  const resolved = await resolveSource(source);
  logger?.debug(`Resolved source type: ${resolved.type}`);

  // 2. Find the extension entry point and validate
  const entryPoint = await findEntryPoint(resolved.path, resolved.subdir);
  logger?.debug(`Entry point: ${entryPoint}`);

  // 3. Load and validate the extension
  const loaded = await loadExtensionFromPath(entryPoint);
  logger?.info(`Validated extension: ${loaded.name} - ${loaded.description}`);

  // 4. Check for existing installation
  const destPath = join(GLOBAL_EXTENSIONS_DIR, loaded.name);
  const existingType = await checkExisting(destPath);

  if (existingType !== "none" && !force) {
    throw new Error(
      `Extension "${loaded.name}" is already installed. Use --force to overwrite.`,
    );
  }

  // 5. Ensure extensions directory exists
  await mkdir(GLOBAL_EXTENSIONS_DIR, { recursive: true });

  // 6. Remove existing if force is set
  if (existingType && force) {
    logger?.info(`Removing existing extension: ${loaded.name}`);
    await rm(destPath, { recursive: true, force: true });
  }

  // 7. Get source directory (entry point's directory or subdir if specified)
  let sourceDir: string;
  let isSingleFile = false;

  if (resolved.subdir) {
    sourceDir = join(resolved.path, resolved.subdir);
  } else if (resolved.type === "local-file") {
    // For single file installs, we'll copy just the file
    sourceDir = dirname(entryPoint);
    isSingleFile = true;
  } else {
    sourceDir = dirname(entryPoint);
  }

  // 8. Copy or symlink
  let wasLinked = false;
  if (link) {
    logger?.info(`Creating symlink: ${destPath} -> ${sourceDir}`);
    await symlink(resolve(sourceDir), destPath);
    wasLinked = true;
  } else if (isSingleFile) {
    // For single file, create directory and copy file as index.ts
    logger?.info(`Creating extension directory: ${destPath}`);
    await mkdir(destPath, { recursive: true });
    const destFile = join(destPath, "index.ts");
    logger?.info(`Copying ${entryPoint} to ${destFile}`);
    await Bun.write(destFile, Bun.file(entryPoint));
  } else {
    logger?.info(`Copying extension to: ${destPath}`);
    await copyDirectory(sourceDir, destPath);
  }

  // 9. Install dependencies if package.json exists
  let dependenciesInstalled = false;
  const packageJsonPath = join(destPath, "package.json");
  if (existsSync(packageJsonPath)) {
    logger?.info("Installing dependencies...");
    try {
      const result = Bun.spawnSync(["bun", "install"], {
        cwd: destPath,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.success) {
        dependenciesInstalled = true;
        logger?.info("Dependencies installed successfully");
      } else {
        logger?.warn(
          `Failed to install dependencies: ${result.stderr.toString()}`,
        );
      }
    } catch (error) {
      logger?.warn(`Failed to install dependencies: ${error}`);
    }
  }

  // 10. Update config to enable extension
  let wasEnabled = false;
  if (enable) {
    const config = await loadConfig();
    config.extensions[loaded.name] = {
      enabled: true,
      config: config.extensions[loaded.name]?.config,
    };
    await saveConfig(config);
    wasEnabled = true;
    logger?.info(`Extension "${loaded.name}" enabled in config`);
  }

  // 11. Clean up temp directory if git clone
  if (resolved.tempDir) {
    try {
      await rm(resolved.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  // 12. Build result
  const installedExtension: InstalledExtension = {
    name: loaded.name,
    description: loaded.description,
    version: loaded.version,
    path: destPath,
    linked: wasLinked,
    gitUrl: resolved.gitUrl,
    installedAt: new Date(),
    enabled: wasEnabled,
  };

  return {
    extension: installedExtension,
    dependenciesInstalled,
    wasLinked,
    wasEnabled,
  };
}

/**
 * Uninstall an extension
 *
 * @param name - Extension name to uninstall
 * @param logger - Optional logger for output
 */
export async function uninstallExtension(
  name: string,
  logger?: Logger,
): Promise<void> {
  const extPath = join(GLOBAL_EXTENSIONS_DIR, name);

  if (!existsSync(extPath)) {
    throw new Error(`Extension "${name}" is not installed`);
  }

  logger?.info(`Uninstalling extension: ${name}`);

  // Remove the extension files
  await rm(extPath, { recursive: true, force: true });

  // Update config to remove extension
  const config = await loadConfig();
  if (config.extensions[name]) {
    delete config.extensions[name];
    await saveConfig(config);
    logger?.info(`Extension "${name}" removed from config`);
  }

  logger?.info(`Extension "${name}" uninstalled successfully`);
}

/**
 * List all installed extensions
 *
 * @param logger - Optional logger for output
 * @returns Array of installed extensions
 */
export async function listInstalledExtensions(
  logger?: Logger,
): Promise<InstalledExtension[]> {
  const extensions: InstalledExtension[] = [];
  const config = await loadConfig();

  if (!existsSync(GLOBAL_EXTENSIONS_DIR)) {
    return extensions;
  }

  const entries = await readdir(GLOBAL_EXTENSIONS_DIR);

  for (const entry of entries) {
    const extPath = join(GLOBAL_EXTENSIONS_DIR, entry);
    const entryPoint = await findEntryPoint(extPath);

    try {
      const loaded = await loadExtensionFromPath(entryPoint);
      const stats = await lstat(extPath);
      const isSymlink = stats.isSymbolicLink();

      extensions.push({
        name: loaded.name,
        description: loaded.description,
        version: loaded.version,
        path: extPath,
        linked: isSymlink,
        installedAt: stats.mtime,
        enabled: config.extensions[loaded.name]?.enabled ?? false,
      });
    } catch (error) {
      logger?.warn(`Failed to load extension ${entry}: ${error}`);
    }
  }

  return extensions;
}

/**
 * Get information about a specific installed extension
 *
 * @param name - Extension name
 * @returns Extension info or null if not found
 */
export async function getInstalledExtension(
  name: string,
): Promise<InstalledExtension | null> {
  const extPath = join(GLOBAL_EXTENSIONS_DIR, name);

  if (!existsSync(extPath)) {
    return null;
  }

  const entryPoint = await findEntryPoint(extPath);
  const loaded = await loadExtensionFromPath(entryPoint);
  const stats = await lstat(extPath);
  const isSymlink = stats.isSymbolicLink();
  const config = await loadConfig();

  return {
    name: loaded.name,
    description: loaded.description,
    version: loaded.version,
    path: extPath,
    linked: isSymlink,
    installedAt: stats.mtime,
    enabled: config.extensions[loaded.name]?.enabled ?? false,
  };
}

/**
 * Enable an extension in the config
 *
 * @param name - Extension name
 * @param logger - Optional logger for output
 */
export async function enableExtension(
  name: string,
  logger?: Logger,
): Promise<void> {
  const extPath = join(GLOBAL_EXTENSIONS_DIR, name);

  if (!existsSync(extPath)) {
    throw new Error(`Extension "${name}" is not installed`);
  }

  const config = await loadConfig();

  if (!config.extensions[name]) {
    config.extensions[name] = { enabled: true };
  } else {
    config.extensions[name].enabled = true;
  }

  await saveConfig(config);
  logger?.info(`Extension "${name}" enabled`);
}

/**
 * Disable an extension in the config
 *
 * @param name - Extension name
 * @param logger - Optional logger for output
 */
export async function disableExtension(
  name: string,
  logger?: Logger,
): Promise<void> {
  const config = await loadConfig();

  if (!config.extensions[name]) {
    throw new Error(`Extension "${name}" is not in config`);
  }

  config.extensions[name].enabled = false;
  await saveConfig(config);
  logger?.info(`Extension "${name}" disabled`);
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Resolve a source string to a ResolvedSource
 */
async function resolveSource(source: string): Promise<ResolvedSource> {
  // Check for git URL patterns
  const gitPattern =
    /^(?:github:|gitlab:|bitbucket:|https?:\/\/|git\+https?:\/\/)/;

  if (gitPattern.test(source)) {
    return resolveGitSource(source);
  }

  // Must be a local path
  return resolveLocalSource(source);
}

/**
 * Resolve a git URL to a cloned local path
 */
async function resolveGitSource(source: string): Promise<ResolvedSource> {
  let gitUrl: string;
  let subdir: string | undefined;

  // Parse GitHub shorthand: github:user/repo
  if (source.startsWith("github:")) {
    gitUrl = `https://github.com/${source.slice(7)}.git`;
  }
  // Parse GitLab shorthand: gitlab:user/repo
  else if (source.startsWith("gitlab:")) {
    gitUrl = `https://gitlab.com/${source.slice(7)}.git`;
  }
  // Parse Bitbucket shorthand: bitbucket:user/repo
  else if (source.startsWith("bitbucket:")) {
    gitUrl = `https://bitbucket.org/${source.slice(10)}.git`;
  }
  // Full URL
  else {
    gitUrl = source.replace(/^git\+/, "");
  }

  // Check for subdirectory in URL (tree/blob path)
  // Pattern: .../tree/branch/path or .../blob/branch/path
  const treeMatch = gitUrl.match(/\/(tree|blob)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (treeMatch) {
    const [, , _branch, path] = treeMatch;
    // Remove the tree/blob part from URL
    gitUrl = gitUrl.replace(/\/(tree|blob)\/.+$/, ".git");
    subdir = path;
  }

  // Also check for subdir in the original source after .git
  const gitSubdirMatch = source.match(/\.git\/(.+)$/);
  if (gitSubdirMatch) {
    subdir = gitSubdirMatch[1];
  }

  // Create temp directory for clone
  const tempDir = join(
    homedir(),
    ".otterassist",
    ".temp",
    `clone-${Date.now()}`,
  );
  await mkdir(tempDir, { recursive: true });

  // Clone the repository
  const result = Bun.spawnSync(
    ["git", "clone", "--depth", "1", gitUrl, tempDir],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (!result.success) {
    // Clean up temp dir on failure
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(
      `Failed to clone repository: ${gitUrl}\n${result.stderr.toString()}`,
    );
  }

  return {
    type: "git",
    path: tempDir,
    gitUrl,
    subdir,
    tempDir,
  };
}

/**
 * Resolve a local path
 */
async function resolveLocalSource(source: string): Promise<ResolvedSource> {
  const resolvedPath = resolve(source);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Extension not found at: ${resolvedPath}`);
  }

  const stats = await stat(resolvedPath);

  if (stats.isDirectory()) {
    return { type: "local-dir", path: resolvedPath };
  }
  if (stats.isFile() && source.endsWith(".ts")) {
    return { type: "local-file", path: resolvedPath };
  }

  throw new Error(
    `Invalid extension source: ${resolvedPath}. Expected a .ts file or directory.`,
  );
}

/**
 * Find the entry point for an extension
 */
async function findEntryPoint(
  baseDir: string,
  subdir?: string,
): Promise<string> {
  const searchDir = subdir ? join(baseDir, subdir) : baseDir;
  const stats = await stat(searchDir);

  // If it's a file, it must be the entry point
  if (stats.isFile()) {
    return searchDir;
  }

  // Check for index.ts in directory
  const indexPath = join(searchDir, "index.ts");
  if (existsSync(indexPath)) {
    return indexPath;
  }

  // Check for single .ts file in directory
  const entries = await readdir(searchDir);
  const tsFiles = entries.filter((e) => e.endsWith(".ts"));

  if (tsFiles.length === 1 && tsFiles[0]) {
    return join(searchDir, tsFiles[0]);
  }

  // If there are multiple .ts files but none named index.ts, check for one matching the directory name
  const dirName = basename(searchDir);
  const matchingFile = tsFiles.find((f) => f.replace(".ts", "") === dirName);
  if (matchingFile) {
    return join(searchDir, matchingFile);
  }

  // Check for otterassist.json to find entry point
  const metadataPath = join(searchDir, "otterassist.json");
  if (existsSync(metadataPath)) {
    try {
      const metadata: ExtensionMetadata = await Bun.file(metadataPath).json();
      if (metadata.name) {
        // Metadata exists, look for index.ts or any ts file
        if (existsSync(indexPath)) {
          return indexPath;
        }
        if (tsFiles.length > 0 && tsFiles[0]) {
          return join(searchDir, tsFiles[0]);
        }
      }
    } catch {
      // Ignore metadata parse errors
    }
  }

  throw new Error(
    `Could not find extension entry point in: ${searchDir}. ` +
      "Expected index.ts or a single .ts file.",
  );
}

/**
 * Check what exists at a path
 */
async function checkExisting(
  path: string,
): Promise<"none" | "file" | "dir" | "symlink"> {
  if (!existsSync(path)) {
    return "none";
  }

  const stats = await lstat(path);
  if (stats.isSymbolicLink()) {
    return "symlink";
  }
  if (stats.isDirectory()) {
    return "dir";
  }
  return "file";
}

/**
 * Copy a directory recursively
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Read the symlink target and create a new symlink
      const target = await Bun.file(srcPath).text();
      await symlink(target, destPath);
    } else {
      // Copy file using Bun's built-in
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}
