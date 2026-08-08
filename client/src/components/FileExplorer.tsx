import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { FileNode, GitStatus } from '../types';
import { createFile, deleteFile, renameFile } from '../services/files';
import { uploadFiles } from '../services/upload';

// ── File extension → icon mapping ──
const FILE_ICONS: Record<string, string> = {
  ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️', mjs: '🟨', cjs: '🟨',
  py: '🐍', rs: '🦀', go: '🔵', css: '🎨', scss: '💠', less: '💠',
  html: '🌐', htm: '🌐', json: '📋', md: '📝', mdx: '📝',
  yml: '⚙️', yaml: '⚙️', toml: '⚙️', sh: '💻', bash: '💻',
  sql: '🗄️', graphql: '◈', gql: '◈', svg: '🖼️', xml: '📰',
  env: '🔧', dockerfile: '🐳', prisma: '🔺', proto: '📡',
  lock: '🔒', txt: '📄', cfg: '⚙️', ini: '⚙️', conf: '⚙️',
  editorconfig: '⚙️', gitignore: '🙈',
  // ── Hardware/Embedded ──
  kicad_pcb: '🔌', kicad_sch: '🔌', kicad_pro: '🔌',
  sch: '🔌', brd: '🔌',
  gbr: '📐', drl: '📐',
  step: '📦', stp: '📦', stl: '📦', f3d: '📦', scad: '📦',
  dts: '🌲', dtsi: '🌲', dtbo: '🌲',
  S: '⚡',
  v: '🧮', vhd: '🧮', vhdl: '🧮',
  ld: '🔗',
};

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!ext && name.toLowerCase() === 'dockerfile') return '🐳';
  if (!ext && name.toLowerCase() === 'makefile') return '⚙️';
  if (!ext && name.toLowerCase() === 'license') return '📄';
  // ── Hardware build/config filenames ──
  const lower = name.toLowerCase();
  if (lower === 'platformio.ini') return '⚙️';
  if (lower === 'west.yml') return '⚙️';
  if (lower === 'kconfig' || lower === 'defconfig' || lower === 'prj.conf') return '⚙️';
  return FILE_ICONS[ext] || '📄';
}

// ── Context menu types ──
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: FileNode;
  parentPath: string; // path of the directory containing this node
}

interface FileExplorerProps {
  fileTree: FileNode[];
  openFiles: { path: string; name: string }[];
  activeFilePath: string | null;
  onFileOpen: (filePath: string, fileName: string) => void;
  projectRoot?: string;
  /** Callback to request a full tree refresh after operations */
  onTreeChanged?: () => void;
  /** Callback when a file is deleted (so parent can close tabs) */
  onFileDeleted?: (absolutePath: string) => void;
  /** Callback when a file is renamed */
  onFileRenamed?: (oldPath: string, newPath: string) => void;
  /** Git status for showing change indicators */
  gitStatus?: GitStatus | null;
}

// ── A single row in the tree ──
interface TreeNodeProps {
  node: FileNode;
  depth: number;
  openFiles: { path: string; name: string }[];
  activeFilePath: string | null;
  onFileOpen: (filePath: string, fileName: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  gitChangedPaths?: Map<string, string>;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  openFiles,
  activeFilePath,
  onFileOpen,
  onContextMenu,
  gitChangedPaths,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isDirectory = node.type === 'directory';
  const isOpen = openFiles.some((f) => f.path === node.path);
  const isActive = activeFilePath === node.path;

  const handleClick = useCallback(() => {
    if (isDirectory) {
      setExpanded((prev) => !prev);
    } else {
      onFileOpen(node.path, node.name);
    }
  }, [isDirectory, node.path, node.name, onFileOpen]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, node);
    },
    [onContextMenu, node],
  );

  const hasChildren = isDirectory && node.children && node.children.length > 0;
  const indent = depth * 16;

  // Git status dot color
  const gitStatusColor = gitChangedPaths?.get(node.path);
  const gitDotColors: Record<string, string> = {
    M: '#d29922',
    A: '#3fb950',
    D: '#f85149',
    R: '#a371f7',
    '??': '#8b949e',
  };
  const dotColor = gitStatusColor ? (gitDotColors[gitStatusColor] || '#8b949e') : undefined;

  return (
    <div>
      <div
        style={{
          ...styles.row,
          paddingLeft: 8 + indent,
          backgroundColor: isActive
            ? 'var(--accent-primary)'
            : isOpen
              ? 'rgba(88,166,255,0.08)'
              : 'transparent',
          color: isActive ? '#fff' : isOpen ? 'var(--text-link)' : 'var(--text-primary)',
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        <span style={styles.toggle}>
          {isDirectory ? (
            <span
              style={{
                ...styles.arrow,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              ▶
            </span>
          ) : (
            <span style={styles.icon}>{getFileIcon(node.name)}</span>
          )}
        </span>
        <span style={styles.name}>{node.name}</span>
        {dotColor && (
          <span
            style={{
              ...styles.gitDot,
              backgroundColor: dotColor,
            }}
            title={gitStatusColor === '??' ? 'Untracked' : gitStatusColor === 'M' ? 'Modified' : gitStatusColor === 'A' ? 'Added' : gitStatusColor === 'D' ? 'Deleted' : 'Changed'}
          />
        )}
      </div>

      {isDirectory && hasChildren && (
        <div
          style={{
            ...styles.children,
            maxHeight: expanded ? (node.children!.length + 1) * 32 : 0,
            opacity: expanded ? 1 : 0,
          }}
        >
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              openFiles={openFiles}
              activeFilePath={activeFilePath}
              onFileOpen={onFileOpen}
              onContextMenu={onContextMenu}
              gitChangedPaths={gitChangedPaths}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Inline input component for file/folder names ──
interface InlineInputProps {
  initialValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

const InlineInput: React.FC<InlineInputProps> = ({
  initialValue = '',
  placeholder = 'Name',
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={styles.inlineInputContainer}>
      <input
        ref={inputRef}
        type="text"
        style={styles.inlineInput}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCancel()}
        placeholder={placeholder}
      />
    </div>
  );
};

// ── Confirm dialog ──
interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <p style={styles.dialogMessage}>{message}</p>
        <div style={styles.dialogActions}>
          <button style={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
          <button style={styles.dialogConfirmBtn} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
};

// ── Main FileExplorer component ──
const FileExplorer: React.FC<FileExplorerProps> = ({
  fileTree,
  openFiles,
  activeFilePath,
  onFileOpen,
  projectRoot,
  onTreeChanged,
  onFileDeleted,
  onFileRenamed,
  gitStatus,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineAction, setInlineAction] = useState<{
    type: 'newFile' | 'newFolder' | 'rename';
    node?: FileNode;
    parentPath: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    node: FileNode;
  } | null>(null);
  const [newRootFile, setNewRootFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUploadStatus = useCallback((status: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setUploadStatus(status);
    statusTimerRef.current = setTimeout(() => setUploadStatus(null), 3500);
  }, []);

  useEffect(() => () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    if (!projectRoot || !files.length || uploading) return;
    const selectedFiles = Array.from(files);
    setUploading(true);
    setUploadProgress(0);
    showUploadStatus(`Uploading ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}...`);
    try {
      await uploadFiles(projectRoot, selectedFiles, setUploadProgress);
      onTreeChanged?.();
      showUploadStatus(`${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} uploaded`);
    } catch (err) {
      showUploadStatus(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [projectRoot, uploading, onTreeChanged, showUploadStatus]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!projectRoot || !e.dataTransfer.types.includes('Files')) return;
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, [projectRoot]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    if (projectRoot) void handleUpload(e.dataTransfer.files);
  }, [projectRoot, handleUpload]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
      parentPath: node.type === 'directory' ? node.path : node.path.substring(0, node.path.lastIndexOf('/')),
    });
  }, []);

  // ── Determine parent path for a node ──
  const getParentPath = (node: FileNode): string => {
    if (node.type === 'directory') return node.path;
    const lastSlash = node.path.lastIndexOf('/');
    return lastSlash >= 0 ? node.path.substring(0, lastSlash) : '';
  };

  // ── File operations ──
  const handleCreateFile = useCallback(
    async (name: string, parentPath: string) => {
      if (!projectRoot) return;
      try {
        const newPath = `${parentPath}/${name}`;
        await createFile(newPath, 'file', projectRoot);
        setInlineAction(null);
        setNewRootFile(false);
        onTreeChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create file';
        alert(message);
      }
    },
    [projectRoot, onTreeChanged],
  );

  const handleCreateFolder = useCallback(
    async (name: string, parentPath: string) => {
      if (!projectRoot) return;
      try {
        const newPath = `${parentPath}/${name}`;
        await createFile(newPath, 'directory', projectRoot);
        setInlineAction(null);
        setNewRootFile(false);
        onTreeChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create folder';
        alert(message);
      }
    },
    [projectRoot, onTreeChanged],
  );

  const handleDelete = useCallback(
    async (node: FileNode) => {
      if (!projectRoot) return;
      try {
        await deleteFile(node.path, projectRoot);
        setConfirmDelete(null);
        setContextMenu(null);
        if (node.type === 'file') {
          onFileDeleted?.(node.path);
        }
        onTreeChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete';
        alert(message);
        setConfirmDelete(null);
      }
    },
    [projectRoot, onFileDeleted, onTreeChanged],
  );

  const handleRename = useCallback(
    async (node: FileNode, newName: string, parentPath: string) => {
      if (!projectRoot) return;
      try {
        const newPath = `${parentPath}/${newName}`;
        await renameFile(node.path, newPath, projectRoot);
        setInlineAction(null);
        setContextMenu(null);
        onFileRenamed?.(node.path, newPath);
        onTreeChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rename';
        alert(message);
      }
    },
    [projectRoot, onFileRenamed, onTreeChanged],
  );

  // ── Inline input submit handler ──
  const handleInlineSubmit = useCallback(
    (value: string) => {
      if (!inlineAction) return;

      switch (inlineAction.type) {
        case 'newFile':
          handleCreateFile(value, inlineAction.parentPath);
          break;
        case 'newFolder':
          handleCreateFolder(value, inlineAction.parentPath);
          break;
        case 'rename': {
          if (inlineAction.node) {
            handleRename(inlineAction.node, value, inlineAction.parentPath);
          }
          break;
        }
      }
    },
    [inlineAction, handleCreateFile, handleCreateFolder, handleRename],
  );

  const handleInlineCancel = useCallback(() => {
    setInlineAction(null);
    setNewRootFile(false);
  }, []);

  // ── Build git changed paths map for fast lookup ──
  const gitChangedPaths = useMemo(() => {
    if (!gitStatus || !gitStatus.isRepo || gitStatus.files.length === 0) return undefined;
    const map = new Map<string, string>();
    for (const f of gitStatus.files) {
      // Map the display status for the dot color
      if (f.index === '?' && f.workingTree === '?') {
        map.set(f.path, '??');
      } else if (f.index !== ' ') {
        map.set(f.path, f.index);
      } else {
        map.set(f.path, f.workingTree);
      }
    }
    return map;
  }, [gitStatus]);

  // ── Empty state ──
  if (fileTree.length === 0 && !projectRoot) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyText}>No project loaded</p>
        <p style={styles.emptyHint}>
          Scan a project to explore its files
        </p>
        <p style={styles.emptyShortcut}>
          <kbd style={styles.kbd}>Ctrl</kbd> + <kbd style={styles.kbd}>K</kbd>
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ ...styles.container, ...(isDragOver ? styles.containerDragOver : {}) }}
      ref={containerRef}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={styles.headerRow}>
        <span style={styles.header}>Files</span>
        {projectRoot && (
          <div style={styles.toolbarActions}>
            <button
              style={styles.newFileBtn}
              onClick={() => {
                // Determine the root path for the new file
                // If fileTree has at least one entry, use its path context
                const rootNode = fileTree[0];
                const rootParent = rootNode ? getParentPath(rootNode) || projectRoot : projectRoot;
                setNewRootFile(true);
                setInlineAction({ type: 'newFile', parentPath: rootParent });
              }}
              title="New File"
            >
              + New File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void handleUpload(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              style={styles.newFileBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload files"
            >
              {uploading ? `Uploading ${uploadProgress}%` : '↑ Upload'}
            </button>
          </div>
        )}
      </div>
      {projectRoot && uploadStatus && <div style={styles.uploadStatus}>{uploadStatus}</div>}
      {projectRoot && isDragOver && <div style={styles.dropHint}>Drop files to upload</div>}

      <div style={styles.tree}>
        {/* Inline input at root level */}
        {newRootFile && inlineAction && !inlineAction.node && (
          <div style={{ paddingLeft: 8, paddingRight: 8 }}>
            <InlineInput
              placeholder={inlineAction.type === 'newFolder' ? 'folder-name' : 'filename.ts'}
              onSubmit={handleInlineSubmit}
              onCancel={handleInlineCancel}
            />
          </div>
        )}

        {fileTree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            openFiles={openFiles}
            activeFilePath={activeFilePath}
            onFileOpen={onFileOpen}
            onContextMenu={handleContextMenu}
            gitChangedPaths={gitChangedPaths}
          />
        ))}
      </div>

      {/* ── Context menu ── */}
      {contextMenu && projectRoot && (
        <div
          style={{
            ...styles.contextMenu,
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.type === 'directory' && (
            <>
              <button
                style={styles.menuItem}
                onClick={() => {
                  setInlineAction({
                    type: 'newFile',
                    parentPath: contextMenu.node.path,
                  });
                  setContextMenu(null);
                }}
              >
                <span style={styles.menuIcon}>📄</span> New File
              </button>
              <button
                style={styles.menuItem}
                onClick={() => {
                  setInlineAction({
                    type: 'newFolder',
                    parentPath: contextMenu.node.path,
                  });
                  setContextMenu(null);
                }}
              >
                <span style={styles.menuIcon}>📁</span> New Folder
              </button>
            </>
          )}
          <button
            style={styles.menuItem}
            onClick={() => {
              setInlineAction({
                type: 'rename',
                node: contextMenu.node,
                parentPath: contextMenu.parentPath,
              });
              setContextMenu(null);
            }}
          >
            <span style={styles.menuIcon}>✏️</span> Rename
          </button>
          <div style={styles.menuDivider} />
          <button
            style={{ ...styles.menuItem, color: 'var(--accent-danger)' }}
            onClick={() => {
              setConfirmDelete({ node: contextMenu.node });
              setContextMenu(null);
            }}
          >
            <span style={styles.menuIcon}>🗑️</span> Delete
          </button>
        </div>
      )}

      {/* ── Inline rename input (appears on the tree node) ── */}
      {inlineAction?.node && !newRootFile && (
        <div style={styles.inlineOverlay}>
          <InlineInput
            initialValue={inlineAction.node.name}
            placeholder="new-name"
            onSubmit={handleInlineSubmit}
            onCancel={handleInlineCancel}
          />
        </div>
      )}

      {/* ── Confirm delete dialog ── */}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${confirmDelete.node.type === 'directory' ? 'folder' : 'file'} "${confirmDelete.node.name}"? This cannot be undone.`}
          onConfirm={() => handleDelete(confirmDelete.node)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  containerDragOver: {
    outline: '1px dashed var(--accent-primary)',
    outlineOffset: '-3px',
    backgroundColor: 'rgba(88,166,255,0.06)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px 4px',
    flexShrink: 0,
  },
  header: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-muted)',
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  uploadStatus: {
    padding: '2px 16px 4px',
    fontSize: '10px',
    color: 'var(--text-link)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dropHint: {
    position: 'absolute',
    top: '38px',
    left: '8px',
    right: '8px',
    zIndex: 2,
    padding: '8px',
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--text-link)',
    border: '1px dashed var(--accent-primary)',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-secondary)',
    pointerEvents: 'none',
  },
  newFileBtn: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  },
  tree: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    height: '28px',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    transition: 'background-color 0.1s',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    paddingRight: '12px',
  },
  toggle: {
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  arrow: {
    fontSize: '8px',
    color: 'var(--text-muted)',
    transition: 'transform 0.15s ease',
    display: 'inline-block',
  },
  icon: {
    fontSize: '13px',
    lineHeight: 1,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gitDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginLeft: '4px',
  },
  children: {
    overflow: 'hidden',
    transition: 'max-height 0.2s ease, opacity 0.2s ease',
  },
  // ── Context menu ──
  contextMenu: {
    position: 'fixed',
    zIndex: 1000,
    backgroundColor: 'var(--bg-elevated, #2a2a3c)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    padding: '4px 0',
    minWidth: '160px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '6px 14px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
    transition: 'background-color 0.1s',
  },
  menuIcon: {
    fontSize: '13px',
    width: '20px',
    textAlign: 'center',
  },
  menuDivider: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: '4px 0',
  },
  // ── Inline input ──
  inlineInputContainer: {
    padding: '4px 8px',
  },
  inlineInput: {
    width: '100%',
    padding: '4px 8px',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--accent-primary)',
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inlineOverlay: {
    position: 'absolute',
    top: '40px',
    left: '16px',
    right: '16px',
    zIndex: 10,
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    padding: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  // ── Confirm dialog ──
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: '12px',
    padding: '20px 24px',
    maxWidth: '360px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  },
  dialogMessage: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    margin: '0 0 16px',
    lineHeight: 1.5,
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  dialogCancelBtn: {
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  dialogConfirmBtn: {
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--accent-danger)',
    color: '#fff',
    cursor: 'pointer',
  },
  // ── Empty state ──
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '24px 16px',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
  emptyHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    opacity: 0.7,
  },
  emptyShortcut: {
    marginTop: '12px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    opacity: 0.6,
  },
  kbd: {
    display: 'inline-block',
    padding: '1px 6px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '3px',
    color: 'var(--text-secondary)',
  },
};

export default FileExplorer;
