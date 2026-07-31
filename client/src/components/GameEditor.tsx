/**
 * GameEditor — visual game editor with integrated engine.
 * Supports 2D (Canvas) and 3D (Three.js) render modes.
 * Toolbar, entity panel, layer panel, canvas with grid, selection,
 * drag-to-move, resize handles, zoom/pan, play button, save/load.
 * 3D mode: orbit controls, Z-axis handle, camera presets.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorEngine, EDITOR_TOOLS, type EditMode, type SerializedScene } from '../engine/EditorEngine';
import { Scene } from '../engine/Scene';
import { Entity, type SpriteComponent } from '../engine/Entity';
import { type CameraPreset } from '../engine/Renderer3D';
import { writeFile, readFile } from '../services/files';

export interface GameEditorProps {
  /** Project root for file I/O */
  projectRoot?: string;
  /** FPS for status bar */
  onFpsChange?: (fps: number) => void;
  /** Entity count for status bar */
  onEntityCountChange?: (count: number) => void;
  /** Scene name for status bar */
  onSceneNameChange?: (name: string) => void;
}

/** Simple modal for entering scene name on save */
const SaveModal: React.FC<{
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('level1');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.box}>
        <div style={modalStyles.title}>Save Scene</div>
        <input
          ref={inputRef}
          style={modalStyles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(name);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Scene name..."
        />
        <div style={modalStyles.buttons}>
          <button style={modalStyles.btn} onClick={onCancel}>Cancel</button>
          <button style={{ ...modalStyles.btn, ...modalStyles.btnPrimary }} onClick={() => onSave(name)}>Save</button>
        </div>
      </div>
    </div>
  );
};

interface EntityPropertyPanelProps {
  entity: Entity | null;
  is3D: boolean;
  onChange: () => void;
}

const EntityPropertyPanel: React.FC<EntityPropertyPanelProps> = ({ entity, is3D, onChange }) => {
  if (!entity) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.title}>Properties</div>
        <div style={panelStyles.empty}>No entity selected</div>
      </div>
    );
  }

  const update = (changes: Partial<Entity>) => {
    Object.assign(entity, changes);
    onChange();
  };

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.title}>Properties</div>
      <div style={panelStyles.field}>
        <label>Kind</label>
        <span style={panelStyles.value}>{entity.kind}</span>
      </div>
      <div style={panelStyles.field}>
        <label>ID</label>
        <span style={{ ...panelStyles.value, fontSize: '10px' }}>{entity.id}</span>
      </div>
      <div style={panelStyles.row}>
        <div style={panelStyles.field}>
          <label>X</label>
          <input
            type="number"
            style={panelStyles.input}
            value={Math.round(entity.x)}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </div>
        <div style={panelStyles.field}>
          <label>Y</label>
          <input
            type="number"
            style={panelStyles.input}
            value={Math.round(entity.y)}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </div>
      </div>
      {is3D && (
        <div style={panelStyles.field}>
          <label>Z</label>
          <input
            type="number"
            style={panelStyles.input}
            value={Math.round(entity.z)}
            step={1}
            onChange={(e) => update({ z: Number(e.target.value) })}
          />
        </div>
      )}
      <div style={panelStyles.row}>
        <div style={panelStyles.field}>
          <label>W</label>
          <input
            type="number"
            style={panelStyles.input}
            value={entity.width}
            min={8}
            onChange={(e) => update({ width: Math.max(8, Number(e.target.value)) })}
          />
        </div>
        <div style={panelStyles.field}>
          <label>H</label>
          <input
            type="number"
            style={panelStyles.input}
            value={entity.height}
            min={8}
            onChange={(e) => update({ height: Math.max(8, Number(e.target.value)) })}
          />
        </div>
      </div>
      {is3D && (
        <>
          <div style={panelStyles.row}>
            <div style={panelStyles.field}>
              <label>Depth</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.depth}
                min={1}
                onChange={(e) => update({ depth: Math.max(1, Number(e.target.value)) })}
              />
            </div>
          </div>
          <div style={panelStyles.section}>Rotation (rad)</div>
          <div style={panelStyles.row}>
            <div style={panelStyles.field}>
              <label>RX</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.rotationX}
                step={0.1}
                onChange={(e) => update({ rotationX: Number(e.target.value) })}
              />
            </div>
            <div style={panelStyles.field}>
              <label>RY</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.rotationY}
                step={0.1}
                onChange={(e) => update({ rotationY: Number(e.target.value) })}
              />
            </div>
            <div style={panelStyles.field}>
              <label>RZ</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.rotationZ}
                step={0.1}
                onChange={(e) => update({ rotationZ: Number(e.target.value) })}
              />
            </div>
          </div>
          <div style={panelStyles.section}>Scale</div>
          <div style={panelStyles.row}>
            <div style={panelStyles.field}>
              <label>SX</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.scaleX}
                step={0.1}
                min={0.1}
                onChange={(e) => update({ scaleX: Math.max(0.1, Number(e.target.value)) })}
              />
            </div>
            <div style={panelStyles.field}>
              <label>SY</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.scaleY}
                step={0.1}
                min={0.1}
                onChange={(e) => update({ scaleY: Math.max(0.1, Number(e.target.value)) })}
              />
            </div>
            <div style={panelStyles.field}>
              <label>SZ</label>
              <input
                type="number"
                style={panelStyles.input}
                value={entity.scaleZ}
                step={0.1}
                min={0.1}
                onChange={(e) => update({ scaleZ: Math.max(0.1, Number(e.target.value)) })}
              />
            </div>
          </div>
        </>
      )}
      <div style={panelStyles.field}>
        <label>Tags</label>
        <input
          type="text"
          style={panelStyles.input}
          value={entity.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            update({ tags });
          }}
        />
      </div>
      <div style={panelStyles.field}>
        <label>
          <input
            type="checkbox"
            checked={entity.visible}
            onChange={(e) => update({ visible: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          Visible
        </label>
      </div>
      <div style={panelStyles.field}>
        <label>
          <input
            type="checkbox"
            checked={entity.active}
            onChange={(e) => update({ active: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          Active
        </label>
      </div>
      <div style={panelStyles.field}>
        <label>Gravity</label>
        <input
          type="number"
          style={panelStyles.input}
          value={entity.gravity}
          onChange={(e) => update({ gravity: Number(e.target.value) })}
        />
      </div>

      <div style={panelStyles.section}>Sprite</div>
      <div style={panelStyles.field}>
        <label>Color</label>
        <input
          type="color"
          style={{ width: '100%', height: 28, border: '1px solid var(--border-default)', borderRadius: 4, padding: 0 }}
          value={entity.sprite?.color || '#4fc3f7'}
          onChange={(e) => {
            const sprite: SpriteComponent = entity.sprite
              ? { ...entity.sprite, color: e.target.value }
              : { type: 'color', color: e.target.value };
            update({ sprite } as Partial<Entity>);
          }}
        />
      </div>

      <div style={panelStyles.actions}>
        <button
          style={panelStyles.actionBtn}
          onClick={() => {
            const gs = 16;
            update({
              x: Math.round(entity.x / gs) * gs,
              y: Math.round(entity.y / gs) * gs,
              width: Math.max(gs, Math.round(entity.width / gs) * gs),
              height: Math.max(gs, Math.round(entity.height / gs) * gs),
            });
          }}
        >
          Snap to Grid
        </button>
      </div>
    </div>
  );
};

interface LayerPanelProps {
  entities: Entity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({ entities, selectedId, onSelect, onToggleVisibility }) => {
  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.title}>Layers ({entities.length})</div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {entities.map((e) => (
          <div
            key={e.id}
            style={{
              ...layerStyles.item,
              ...(selectedId === e.id ? layerStyles.selected : {}),
              ...(e.visible ? {} : layerStyles.hidden),
            }}
            onClick={() => onSelect(e.id)}
          >
            <span
              style={layerStyles.visibility}
              onClick={(ev) => { ev.stopPropagation(); onToggleVisibility(e.id); }}
              title="Toggle visibility"
            >
              {e.visible ? '👁' : '—'}
            </span>
            <span style={layerStyles.kind}>{e.kind}</span>
            <span style={layerStyles.id}>{e.id}</span>
          </div>
        ))}
        {entities.length === 0 && (
          <div style={panelStyles.empty}>No entities</div>
        )}
      </div>
    </div>
  );
};

const GameEditor: React.FC<GameEditorProps> = ({
  projectRoot,
  onFpsChange,
  onEntityCountChange,
  onSceneNameChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [entityRenderKey, setEntityRenderKey] = useState(0);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [editMode, setEditMode] = useState<EditMode>('edit');
  const [activeTool, setActiveTool] = useState('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [sceneList, setSceneList] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [renderMode, setRenderMode] = useState<'2d' | '3d'>('2d');
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHistory, setExportHistory] = useState<Array<{ type: string; time: string; size: number; url?: string }>>([]);
  const sceneNameRef = useRef('Untitled');
  const fpsInterval = useRef(0);

  // 3D orbit/mouse state
  const is3DDragging = useRef(false);
  const prevMouse3D = useRef({ x: 0, y: 0 });

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new Scene({ name: 'Untitled', cameraBounds: { x: 0, y: 0, w: 640, h: 480 } });
    const engine = new EditorEngine({ canvas, scene });
    engineRef.current = engine;

    engine.onSelectionChange = (entity) => {
      setSelectedEntity(entity);
      setEntityRenderKey((k) => k + 1);
    };

    engine.onEntitiesChange = () => {
      setEntities([...engine.getEntities()]);
      onEntityCountChange?.(engine.getEntities().length);
    };

    engine.onModeChange = (mode) => {
      setEditMode(mode);
    };

    engine.resize();
    engine.start();

    // FPS reporting
    fpsInterval.current = window.setInterval(() => {
      onFpsChange?.(engine.fps);
    }, 500);

    return () => {
      engine.stop();
      clearInterval(fpsInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      engineRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Periodic entity count sync
  useEffect(() => {
    const interval = setInterval(() => {
      const eng = engineRef.current;
      if (eng && eng.getEntities().length !== entities.length) {
        setEntities([...eng.getEntities()]);
        onEntityCountChange?.(eng.getEntities().length);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [entities.length, onEntityCountChange]);

  // Handle render mode toggle
  const handleRenderModeToggle = useCallback(() => {
    setRenderMode((prev) => {
      const next = prev === '2d' ? '3d' : '2d';
      if (engineRef.current) {
        engineRef.current.setRenderMode(next);
        // Force resize
        setTimeout(() => engineRef.current?.resize(), 0);
      }
      return next;
    });
  }, []);

  // Handle 3D camera presets
  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    const eng = engineRef.current;
    if (!eng || !eng.renderer3D) return;
    eng.renderer3D.setCameraPreset(preset);
  }, []);

  // Sync tool changes
  const handleToolChange = useCallback((tool: string) => {
    setActiveTool(tool);
    if (engineRef.current) {
      engineRef.current.activeTool = tool;
    }
  }, []);

  // Toggle grid
  const handleGridToggle = useCallback(() => {
    setShowGrid((g) => {
      const next = !g;
      if (engineRef.current) {
        engineRef.current.showGrid = next;
        if (engineRef.current.renderer3D) {
          engineRef.current.renderer3D.setGridVisible(next);
        }
      }
      return next;
    });
  }, []);

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.renderer.camera.scale = 2;
      (engineRef.current as any).zoomLevel = 2;
    }
  }, []);

  // Toggle preview
  const handleTogglePreview = useCallback(() => {
    engineRef.current?.togglePreview();
  }, []);

  // Entity property changes - force re-render
  const handleEntityChange = useCallback(() => {
    setEntityRenderKey((k) => k + 1);
  }, []);

  // Toggle visibility from layer panel
  const handleToggleVisibility = useCallback((id: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    const entity = eng.getCurrentScene()?.getEntity(id);
    if (entity) {
      entity.visible = !entity.visible;
      setEntities([...eng.getEntities()]);
    }
  }, []);

  // Select from layer panel
  const handleLayerSelect = useCallback((id: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.selectedEntityId = id;
    const entity = eng.getCurrentScene()?.getEntity(id) ?? null;
    setSelectedEntity(entity);
  }, []);

  // Save scene
  const handleSave = useCallback(async (name: string) => {
    setShowSaveModal(false);
    const eng = engineRef.current;
    if (!eng) return;

    const data = eng.exportScene();
    data.name = name;
    sceneNameRef.current = name;
    onSceneNameChange?.(name);

    if (projectRoot) {
      try {
        const json = JSON.stringify(data, null, 2);
        const path = `scenes/${name}.json`;
        await writeFile(path, json, projectRoot);
        setStatusMsg(`Saved: scenes/${name}.json`);
        setTimeout(() => setStatusMsg(''), 3000);
      } catch (err) {
        setStatusMsg(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`);
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } else {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg(`Downloaded: ${name}.json`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  }, [projectRoot, onSceneNameChange]);

  // Export scene as a self-contained browser document or Q1 binary.
  const handleExport = useCallback(async (kind: 'browser' | 'q1') => {
    const scene = engineRef.current?.exportScene();
    if (!scene) return;
    setExportBusy(true);
    try {
      const response = await fetch(`/api/export/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, projectRoot }) });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `Export failed (${response.status})`); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = kind === 'browser' ? 'quantum-game.html' : 'quantum-game.bin';
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setExportHistory((old) => [{ type: kind === 'browser' ? 'Browser HTML' : 'Q1 Binary', time: new Date().toLocaleString(), size: blob.size, url }, ...old].slice(0, 5));
      setStatusMsg(`Exported ${filename} (${Math.ceil(blob.size / 1024)} KB)`); setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) { setStatusMsg(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`); setTimeout(() => setStatusMsg(''), 5000); }
    finally { setExportBusy(false); }
  }, [projectRoot]);

  // Load scene
  const handleLoad = useCallback(async (filename: string) => {
    setShowLoadModal(false);
    const eng = engineRef.current;
    if (!eng || !projectRoot) return;

    try {
      const result = await readFile(`scenes/${filename}`, projectRoot);
      const data: SerializedScene = JSON.parse(result.content);
      eng.importScene(data);
      // Sync render mode state
      if (data.renderMode === '3d') {
        setRenderMode('3d');
      } else {
        setRenderMode('2d');
      }
      sceneNameRef.current = data.name;
      setEntities([...eng.getEntities()]);
      onEntityCountChange?.(eng.getEntities().length);
      onSceneNameChange?.(data.name);
      setStatusMsg(`Loaded: scenes/${filename}`);
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setStatusMsg(`Load failed: ${err instanceof Error ? err.message : 'unknown'}`);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  }, [projectRoot, onEntityCountChange, onSceneNameChange]);

  // Show load dialog
  const handleShowLoad = useCallback(async () => {
    if (!projectRoot) {
      setStatusMsg('No project loaded — cannot browse scenes');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }
    try {
      const resp = await fetch('/api/files/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'scenes', projectRoot }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const files = (data.files || [])
          .filter((f: { name: string }) => f.name.endsWith('.json'))
          .map((f: { name: string }) => f.name);
        setSceneList(files);
      }
    } catch {
      setSceneList([]);
    }
    setShowLoadModal(true);
  }, [projectRoot]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 's') {
        e.preventDefault();
        setShowSaveModal(true);
      }
      if (mod && e.key === 'o') {
        e.preventDefault();
        handleShowLoad();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleShowLoad]);

  // 3D mouse handlers (override 2D when in 3D edit mode)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || renderMode !== '3d') return;

    const onMouseDown3D = (e: MouseEvent) => {
      if (editMode !== 'edit') return;
      if (e.button === 0) {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+click: place entity at ground plane intersection
          const eng = engineRef.current;
          if (!eng || !eng.renderer3D) return;
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const sx = (e.clientX - rect.left) * dpr;
          const sy = (e.clientY - rect.top) * dpr;
          const worldPos = eng.renderer3D.screenToWorld(sx, sy, rect.width * dpr, rect.height * dpr);
          if (worldPos && activeTool !== 'select' && activeTool !== 'delete') {
            const snapX = Math.round(worldPos.x / 16) * 16;
            const snapY = Math.round(worldPos.y / 16) * 16;
            (eng as any).placeEntity(activeTool, snapX, snapY);
          }
        } else {
          // Start orbit drag
          is3DDragging.current = true;
          prevMouse3D.current = { x: e.clientX, y: e.clientY };
        }
      }
    };

    const onMouseMove3D = (e: MouseEvent) => {
      if (!is3DDragging.current) return;
      const eng = engineRef.current;
      if (!eng || !eng.renderer3D) return;

      const dx = e.clientX - prevMouse3D.current.x;
      const dy = e.clientY - prevMouse3D.current.y;
      prevMouse3D.current = { x: e.clientX, y: e.clientY };

      if (e.shiftKey) {
        // Shift+drag: pan
        eng.renderer3D.orbitTarget.x -= dx * 0.05;
        eng.renderer3D.orbitTarget.y += dy * 0.05;
        eng.renderer3D.orbitRotate(0, 0);
      } else {
        // Orbit rotate
        eng.renderer3D.orbitRotate(dx, dy);
      }
    };

    const onMouseUp3D = () => {
      is3DDragging.current = false;
    };

    const onWheel3D = (e: WheelEvent) => {
      e.preventDefault();
      const eng = engineRef.current;
      if (!eng || !eng.renderer3D) return;
      eng.renderer3D.orbitZoom(e.deltaY > 0 ? 1 : -1);
    };

    canvas.addEventListener('mousedown', onMouseDown3D, true);
    window.addEventListener('mousemove', onMouseMove3D);
    window.addEventListener('mouseup', onMouseUp3D);
    canvas.addEventListener('wheel', onWheel3D, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown3D, true);
      window.removeEventListener('mousemove', onMouseMove3D);
      window.removeEventListener('mouseup', onMouseUp3D);
      canvas.removeEventListener('wheel', onWheel3D);
    };
  }, [renderMode, editMode, activeTool]);

  const entityCount = entities.length;

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolGroup}>
          {Object.entries(EDITOR_TOOLS).map(([key, tool]) => (
            <button
              key={key}
              style={{
                ...styles.toolBtn,
                ...(activeTool === key ? styles.toolBtnActive : {}),
              }}
              onClick={() => handleToolChange(key)}
              title={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div style={styles.toolGroup}>
          <button
            style={{ ...styles.toolBtn, ...(showGrid ? styles.toolBtnActive : {}) }}
            onClick={handleGridToggle}
            title="Toggle Grid"
          >
            #
          </button>
          <button
            style={styles.toolBtn}
            onClick={handleResetZoom}
            title="Reset Zoom"
          >
            🔍
          </button>
        </div>

        <div style={styles.toolGroup}>
          <button
            style={{
              ...styles.toolBtn,
              ...(renderMode === '3d' ? styles.toolBtnActive : {}),
              fontWeight: renderMode === '3d' ? 700 : 400,
            }}
            onClick={handleRenderModeToggle}
            title={`Switch to ${renderMode === '2d' ? '3D' : '2D'} mode`}
          >
            {renderMode === '2d' ? '2D' : '3D'}
          </button>
        </div>

        {/* 3D Camera presets */}
        {renderMode === '3d' && editMode === 'edit' && (
          <div style={styles.toolGroup}>
            <button style={styles.toolBtn} onClick={() => handleCameraPreset('top')} title="Top view">⬆</button>
            <button style={styles.toolBtn} onClick={() => handleCameraPreset('front')} title="Front view">⬛</button>
            <button style={styles.toolBtn} onClick={() => handleCameraPreset('side')} title="Side view">⬅</button>
            <button style={styles.toolBtn} onClick={() => handleCameraPreset('perspective')} title="Perspective view">🔮</button>
          </div>
        )}

        <div style={styles.spacer} />

        <div style={styles.toolGroup}>
          <button
            style={{
              ...styles.toolBtn,
              ...(editMode === 'preview' ? styles.playBtnActive : {}),
              fontWeight: 700,
            }}
            onClick={handleTogglePreview}
            title={editMode === 'preview' ? 'Stop (Esc)' : 'Play (Space)'}
          >
            {editMode === 'preview' ? '⏹' : '▶'} {editMode === 'preview' ? 'Stop' : 'Play'}
          </button>
        </div>

        <div style={styles.toolGroup}>
          <button style={{ ...styles.toolBtn, fontWeight: 700 }} onClick={() => setShowExportPanel((v) => !v)} title="Export game">{exportBusy ? '⏳ Exporting…' : '📦 Export'}</button>
          <button style={styles.toolBtn} onClick={handleShowLoad} title="Load Scene (Ctrl+O)">
            📂 Load
          </button>
          <button style={styles.toolBtn} onClick={() => setShowSaveModal(true)} title="Save Scene (Ctrl+S)">
            💾 Save
          </button>
        </div>
      </div>

      {/* Main area: canvas + side panels */}
      <div style={styles.mainArea}>
        {/* Canvas */}
        <div style={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            style={{
              ...styles.canvas,
              cursor: renderMode === '3d' && editMode === 'edit'
                ? (activeTool === 'select' ? 'grab' : 'crosshair')
                : (activeTool === 'select' ? 'default' : 'crosshair'),
            }}
          />
          {/* Status overlay */}
          {statusMsg && (
            <div style={styles.statusOverlay}>{statusMsg}</div>
          )}
          {/* Mode indicator */}
          <div style={{
            ...styles.modeIndicator,
            backgroundColor: editMode === 'preview' ? '#ef5350' : '#66bb6a',
          }}>
            {editMode === 'preview' ? '▶ PLAYING' : '✏ EDIT'}
            {' · '}{renderMode.toUpperCase()}
            {' · '}{entityCount} entities
          </div>
          {/* 3D Controls Help */}
          {renderMode === '3d' && editMode === 'edit' && (
            <div style={styles.helpOverlay}>
              <span>🖱 Drag: orbit · Shift+drag: pan · Scroll: zoom · Ctrl+click: place · {renderMode === '3d' ? 'Z:' : ''} Presets: ⬆⬛⬅🔮</span>
            </div>
          )}
        </div>

        {/* Right sidebar panels */}
        <div style={styles.rightPanel}>
          <div key={entityRenderKey}>
            <EntityPropertyPanel
              entity={selectedEntity}
              is3D={renderMode === '3d'}
              onChange={handleEntityChange}
            />
          </div>
          <LayerPanel
            entities={entities}
            selectedId={selectedEntity?.id ?? null}
            onSelect={handleLayerSelect}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>
      </div>

      {/* Export panel */}
      {showExportPanel && (
        <div style={{ ...modalStyles.overlay, alignItems: 'flex-start', paddingTop: 70 }}>
          <div style={{ ...modalStyles.box, width: 390 }}>
            <div style={modalStyles.title}>Export Game</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button style={{ ...modalStyles.btn, ...modalStyles.btnPrimary }} disabled={exportBusy} onClick={() => handleExport('browser')}>Export for Browser (.html)</button>
              <button style={modalStyles.btn} disabled={exportBusy} onClick={() => handleExport('q1')}>Export for Q1 (.bin)</button>
            </div>
            <div style={panelStyles.title}>Recent exports</div>
            {exportHistory.length === 0 ? <div style={panelStyles.empty}>No exports yet</div> : exportHistory.map((item, i) => (
              <div key={`${item.time}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', fontSize: 11 }}>
                <span>{item.type}<br /><small>{item.time} · {Math.ceil(item.size / 1024)} KB</small></span>
                {item.url && <button style={modalStyles.btn} onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>Open exported file</button>}
              </div>
            ))}
            <div style={modalStyles.buttons}><button style={modalStyles.btn} onClick={() => setShowExportPanel(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <SaveModal
          onSave={handleSave}
          onCancel={() => setShowSaveModal(false)}
        />
      )}

      {/* Load modal */}
      {showLoadModal && (
        <div style={modalStyles.overlay}>
          <div style={{ ...modalStyles.box, width: 360 }}>
            <div style={modalStyles.title}>Load Scene</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
              {sceneList.length === 0 ? (
                <div style={panelStyles.empty}>No scenes found in scenes/</div>
              ) : (
                sceneList.map((f) => (
                  <div
                    key={f}
                    style={loadStyles.item}
                    onClick={() => handleLoad(f)}
                  >
                    📄 {f}
                  </div>
                ))
              )}
            </div>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.btn} onClick={() => setShowLoadModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Styles ───

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--bg-primary, #1e1e2e)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: 'var(--bg-tertiary, #2d2d30)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
    height: 36,
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  toolGroup: {
    display: 'flex',
    gap: 1,
    padding: '0 4px',
    borderRight: '1px solid var(--border-default)',
  },
  spacer: {
    flex: 1,
  },
  toolBtn: {
    padding: '4px 10px',
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    lineHeight: '22px',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
  },
  toolBtnActive: {
    backgroundColor: 'var(--bg-elevated)',
    borderColor: 'var(--accent-primary)',
    color: 'var(--text-primary)',
  },
  playBtnActive: {
    backgroundColor: '#ef5350',
    color: '#fff',
    borderColor: '#ef5350',
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
    imageRendering: 'pixelated' as const,
  },
  rightPanel: {
    width: 260,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-secondary)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  statusOverlay: {
    position: 'absolute' as const,
    bottom: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    zIndex: 10,
  },
  helpOverlay: {
    position: 'absolute' as const,
    bottom: 36,
    left: 8,
    padding: '4px 10px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'var(--text-muted)',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'var(--font-sans)',
    zIndex: 10,
    pointerEvents: 'none',
  },
  modeIndicator: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    padding: '3px 10px',
    color: '#fff',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    zIndex: 10,
  },
};

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: 8,
    borderBottom: '1px solid var(--border-default)',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-muted)',
    marginBottom: 8,
    fontFamily: 'var(--font-sans)',
  },
  empty: {
    fontSize: 12,
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
    padding: '8px 0',
  },
  field: {
    marginBottom: 6,
  },
  row: {
    display: 'flex',
    gap: 6,
  },
  input: {
    width: '100%',
    padding: '3px 6px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
  },
  value: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
  },
  section: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    margin: '8px 0 4px',
    textTransform: 'uppercase' as const,
  },
  actions: {
    marginTop: 8,
  },
  actionBtn: {
    width: '100%',
    padding: '4px 8px',
    fontSize: 11,
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
};

const layerStyles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: 3,
    border: '1px solid transparent',
  },
  selected: {
    backgroundColor: 'var(--bg-elevated)',
    borderColor: 'var(--accent-primary)',
    color: 'var(--text-primary)',
  },
  hidden: {
    opacity: 0.4,
  },
  visibility: {
    cursor: 'pointer',
    fontSize: 12,
  },
  kind: {
    flex: 1,
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  id: {
    fontSize: 9,
    color: 'var(--text-muted)',
    opacity: 0.6,
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: 20,
    minWidth: 280,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 12,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
    marginBottom: 12,
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btn: {
    padding: '6px 16px',
    fontSize: 12,
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  btnPrimary: {
    backgroundColor: 'var(--accent-primary)',
    borderColor: 'var(--accent-primary)',
    color: '#fff',
  },
};

const loadStyles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: 4,
    border: '1px solid transparent',
  },
};

export default GameEditor;
