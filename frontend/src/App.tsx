import React, { useState, useRef, useCallback } from "react";
import { OnFileDrop } from '../wailsjs/runtime';
import { SelectFiles, GetFilesInfo, SetIndividualFileTimes } from '../wailsjs/go/main/App';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileDropZone } from "./components/FileDropZone";
import { SortableItem, DragPreviewItem } from "./components/SortableItem";
import { TimestampColumnItem } from "./components/TimestampColumnItem";
import { ArrowDownUp, Trash2 } from "lucide-react";
import { cn } from "./lib/utils";

interface FileInfo {
  path: string;
  modifiedTime: number; // Unix timestamp in seconds
  customTimestamp?: number; // User-edited timestamp
}

function App() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [timestampReversed, setTimestampReversed] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const anchorIndexRef = useRef<number | null>(null);
  const processingFilesRef = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // タイムスタンプを降順（新しい順）でソート。逆順フラグが立っていれば反転（昇順）
  const sortedTimestamps = (() => {
    const sorted = [...files].sort((a, b) => {
      const timestampA = a.customTimestamp ?? a.modifiedTime;
      const timestampB = b.customTimestamp ?? b.modifiedTime;
      return timestampB - timestampA; // 降順
    });
    return timestampReversed ? sorted.reverse() : sorted;
  })();

  // Normalize path for comparison (handle different separators and case)
  const normalizePath = (path: string): string => {
    return path.replace(/\\/g, '/').toLowerCase();
  };

  const handleFilesDropped = useCallback(async (newFiles: string[]) => {
    // Filter out duplicates and files currently being processed
    // Use normalized paths for comparison to handle Windows path variations
    const existingNormalizedPaths = new Set(files.map(f => normalizePath(f.path)));
    const processingNormalizedPaths = new Set(
      Array.from(processingFilesRef.current).map(normalizePath)
    );

    const uniqueNewFiles = newFiles
      .filter((f) => {
        if (!f || typeof f !== 'string') return false;
        const normalized = normalizePath(f);
        return !existingNormalizedPaths.has(normalized) &&
               !processingNormalizedPaths.has(normalized);
      });
      
    if (uniqueNewFiles.length === 0) return;

    // Mark files as being processed
    uniqueNewFiles.forEach(f => processingFilesRef.current.add(f));

    try {
      // Get file info from backend
      const filesInfo = await GetFilesInfo(uniqueNewFiles);

      const newFileInfos: FileInfo[] = filesInfo.map(info => ({
        path: info.path,
        modifiedTime: info.modifiedTime,
      }));

      setFiles((prev) => {
        const combined = [...prev, ...newFileInfos];
        return combined.sort((a, b) => {
          const timestampA = a.customTimestamp ?? a.modifiedTime;
          const timestampB = b.customTimestamp ?? b.modifiedTime;
          return timestampB - timestampA;
        });
      });
      setMessage("");
    } catch (error) {
      console.error("Failed to get file info:", error);
      setMessage(`Error loading file info: ${error}`);
    } finally {
      // Remove from processing set
      uniqueNewFiles.forEach(f => processingFilesRef.current.delete(f));
    }
  }, [files]);

  // FILES列の項目を選択する。Shift押下時はアンカーからの範囲を追加選択
  const handleSelect = useCallback((path: string, shiftKey: boolean) => {
    const index = files.findIndex(f => f.path === path);
    if (index === -1) return;

    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (shiftKey && anchorIndexRef.current !== null) {
        const start = Math.min(anchorIndexRef.current, index);
        const end = Math.max(anchorIndexRef.current, index);
        for (let i = start; i <= end; i++) {
          next.add(files[i].path);
        }
      } else {
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        anchorIndexRef.current = index;
      }
      return next;
    });
  }, [files]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setFiles((items) => {
      // ドラッグ対象が選択に含まれていれば選択分をまとめて移動。そうでなければ単体移動
      const movingSet = selectedPaths.has(active.id as string)
        ? selectedPaths
        : new Set([active.id as string]);

      // 単体移動は従来どおり
      if (movingSet.size <= 1) {
        const oldIndex = items.findIndex(f => f.path === active.id);
        const newIndex = items.findIndex(f => f.path === over.id);
        return arrayMove(items, oldIndex, newIndex);
      }

      // 移動対象を元の並び順を保ったまま抽出し、残りから切り離す（飛ばし選択も詰めて連続化）
      const moving = items.filter(f => movingSet.has(f.path));
      const remaining = items.filter(f => !movingSet.has(f.path));

      // ドロップ先が移動対象自身の場合は何もしない
      let insertAt = remaining.findIndex(f => f.path === over.id);
      if (insertAt === -1) return items;

      // ドラッグ方向が下向きなら対象の後ろへ挿入
      const activeIndex = items.findIndex(f => f.path === active.id);
      const overIndex = items.findIndex(f => f.path === over.id);
      if (activeIndex < overIndex) insertAt += 1;

      return [
        ...remaining.slice(0, insertAt),
        ...moving,
        ...remaining.slice(insertAt),
      ];
    });
  };

  const removeFile = (pathToRemove: string) => {
    setFiles(files.filter((f) => f.path !== pathToRemove));
    setSelectedPaths(prev => {
      if (!prev.has(pathToRemove)) return prev;
      const next = new Set(prev);
      next.delete(pathToRemove);
      return next;
    });
  };

  const clearFiles = () => {
    setFiles([]);
    setMessage("");
    setSelectedPaths(new Set());
    anchorIndexRef.current = null;
  };

  const reverseOrder = () => {
    setFiles((prev) => [...prev].reverse());
  };

  const reverseTimestamps = () => {
    setTimestampReversed((prev) => !prev);
  };

  React.useEffect(() => {
    // Listen for file drop events from Wails
    OnFileDrop((_x: number, _y: number, paths: string[]) => {
      if (paths && paths.length > 0) {
        handleFilesDropped(paths);
      }
    }, true);
  }, [handleFilesDropped]);

  const openFileDialog = async () => {
    try {
      const selected = await SelectFiles();
      if (selected && selected.length > 0) {
        handleFilesDropped(selected);
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error opening file dialog: ${err}`);
    }
  };

  const applyTimestamp = async () => {
    if (files.length === 0) {
      setMessage("No files selected.");
      return;
    }

    setIsProcessing(true);
    setMessage("");

    try {
      // Use positional mapping: files[i] gets timestamp from sortedTimestamps[i]
      const fileTimestamps = files.map((f, index) => ({
        path: f.path,
        timestamp: sortedTimestamps[index].customTimestamp ?? sortedTimestamps[index].modifiedTime,
      }));

      await SetIndividualFileTimes(fileTimestamps);

      // Clear customTimestamp and update modifiedTime based on positional mapping
      setFiles(prev => prev.map((f, index) => ({
        ...f,
        modifiedTime: sortedTimestamps[index].customTimestamp ?? sortedTimestamps[index].modifiedTime,
        customTimestamp: undefined,
      })));

      setMessage(`Successfully updated ${files.length} files!`);
    } catch (error) {
      console.error(error);
      setMessage(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl min-h-screen flex flex-col gap-6 text-slate-200">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
          File Timestamp Setter
        </h1>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        {/* File Drop Zone */}
        <FileDropZone
          onFilesDropped={handleFilesDropped}
          onClick={openFileDialog}
          className="h-40"
        />

        {/* File List Controls */}
        {files.length > 0 && (
          <div className="flex items-center justify-end">
            <div className="flex gap-2">
              <button
                onClick={clearFiles}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-sm transition-colors border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" /> クリア
              </button>
            </div>
          </div>
        )}

        {/* File List - 2 Column Layout */}
        <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 overflow-y-auto min-h-[200px] max-h-[400px]">
          {files.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 italic">
              No files selected
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左列 - ファイル */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                      Files
                    </h3>
                    <div className="flex-1 h-px bg-slate-700/50"></div>
                    <button
                      onClick={reverseOrder}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 text-xs transition-colors border border-slate-700 shrink-0"
                      title="ファイルの順序を逆にする"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5" />
                      逆順
                    </button>
                  </div>
                  <SortableContext
                    items={files.map(f => f.path)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-2">
                      {files.map((file) => (
                        <SortableItem
                          key={file.path}
                          id={file.path}
                          fileInfo={file}
                          onRemove={removeFile}
                          isSelected={selectedPaths.has(file.path)}
                          onSelect={handleSelect}
                          isGroupDragging={
                            activeId !== null &&
                            selectedPaths.has(activeId) &&
                            selectedPaths.has(file.path) &&
                            file.path !== activeId
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>

                {/* 右列 - タイムスタンプ */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                      Timestamps
                    </h3>
                    <div className="flex-1 h-px bg-slate-700/50"></div>
                    <button
                      onClick={reverseTimestamps}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 text-xs transition-colors border border-slate-700 shrink-0"
                      title="タイムスタンプの並び順を逆にする"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5" />
                      {timestampReversed ? "昇順" : "降順"}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {sortedTimestamps.map((file, index) => (
                      <TimestampColumnItem
                        key={`${file.path}-${index}`}
                        fileInfo={file}
                        onTimestampChange={(path: string, timestamp: number) => {
                          setFiles(prev => prev.map(f =>
                            f.path === path
                              ? { ...f, customTimestamp: timestamp === -1 ? undefined : timestamp }
                              : f
                          ));
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* ドラッグ中に選択行を全てカーソルに追従させるオーバーレイ */}
              <DragOverlay>
                {activeId && (() => {
                  const draggingFiles =
                    selectedPaths.has(activeId) && selectedPaths.size > 1
                      ? files.filter(f => selectedPaths.has(f.path))
                      : files.filter(f => f.path === activeId);
                  return (
                    <div className="flex flex-col gap-1 shadow-2xl relative" style={{ width: 'var(--radix-popper-available-width, 100%)' }}>
                      {draggingFiles.length > 1 && (
                        <div className="absolute -top-2 -right-2 z-10 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                          {draggingFiles.length}
                        </div>
                      )}
                      {draggingFiles.map(file => (
                        <DragPreviewItem key={file.path} fileInfo={file} />
                      ))}
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 py-4 bg-[#0f172a]/80 backdrop-blur-md border-t border-slate-800 flex flex-col gap-4 z-10">
        {message && (
          <div className={cn(
            "px-4 py-3 rounded-lg text-sm font-medium",
            message.startsWith("Error")
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-green-500/10 text-green-400 border border-green-500/20"
          )}>
            {message}
          </div>
        )}

        <button
          onClick={applyTimestamp}
          disabled={isProcessing || files.length === 0}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? "設定中..." : "設定実行"}
        </button>
      </footer>
    </div>
  );
}

export default App;
