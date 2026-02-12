import React, { useState, useRef, useCallback } from "react";
import { listen } from '@tauri-apps/api/event';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { format } from "date-fns";
import { FileDropZone } from "./components/FileDropZone";
import { SortableItem } from "./components/SortableItem";
import { ArrowDownUp, Trash2, ArrowLeftRight } from "lucide-react";
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
  const [swapTimestampsOnReorder, setSwapTimestampsOnReorder] = useState(false);
  const processingFilesRef = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
      const filesInfo = await invoke<Array<{ path: string; modified_time: number }>>(
        "get_files_info",
        { files: uniqueNewFiles }
      );

      const newFileInfos: FileInfo[] = filesInfo.map(info => ({
        path: info.path,
        modifiedTime: info.modified_time,
      }));

      setFiles((prev) => [...prev, ...newFileInfos]);
      setMessage("");
    } catch (error) {
      console.error("Failed to get file info:", error);
      setMessage(`Error loading file info: ${error}`);
    } finally {
      // Remove from processing set
      uniqueNewFiles.forEach(f => processingFilesRef.current.delete(f));
    }
  }, [files]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(f => f.path === active.id);
        const newIndex = items.findIndex(f => f.path === over.id);

        const newItems = [...items];

        // Only swap timestamps if the toggle is enabled
        if (swapTimestampsOnReorder) {
          const tempTimestamp = newItems[oldIndex].customTimestamp ?? newItems[oldIndex].modifiedTime;
          const targetTimestamp = newItems[newIndex].customTimestamp ?? newItems[newIndex].modifiedTime;

          newItems[oldIndex] = { ...newItems[oldIndex], customTimestamp: targetTimestamp };
          newItems[newIndex] = { ...newItems[newIndex], customTimestamp: tempTimestamp };
        }

        return arrayMove(newItems, oldIndex, newIndex);
      });
    }
  };

  const removeFile = (pathToRemove: string) => {
    setFiles(files.filter((f) => f.path !== pathToRemove));
  };

  const clearFiles = () => {
    setFiles([]);
    setMessage("");
  };

  const reverseOrder = () => {
    setFiles((prev) => [...prev].reverse());
  };

  React.useEffect(() => {
    // Use 'tauri://drag-drop' event (Tauri v2)
    const unlistenDragDropPromise = listen('tauri://drag-drop', (event) => {
      const payload = event.payload as { paths: string[] };
      if (payload && payload.paths && Array.isArray(payload.paths) && payload.paths.length > 0) {
        handleFilesDropped(payload.paths);
      }
    });

    return () => {
      unlistenDragDropPromise.then(unlisten => unlisten());
    };
  }, [handleFilesDropped]);

  const openFileDialog = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
      });
      if (selected) {
        // user selected files
        const newFiles = Array.isArray(selected) ? selected : [selected];
        // Ensure strings
        const validFiles = newFiles.filter((f): f is string => typeof f === 'string');
        if (validFiles.length > 0) {
          handleFilesDropped(validFiles);
        } else {
          // If objects, try to extract path (though v2 returns strings usually)
          // @ts-ignore
          const paths = newFiles.map(f => f.path || f).filter(Boolean);
          if (paths.length) handleFilesDropped(paths);
        }
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
      // Always use individual timestamps
      const fileTimestamps = files.map(f => ({
        path: f.path,
        timestamp: f.customTimestamp !== undefined ? f.customTimestamp : f.modifiedTime,
      }));

      await invoke("set_individual_file_times", {
        fileTimestamps,
      });

      // Clear customTimestamp and update modifiedTime to the set timestamp
      setFiles(prev => prev.map(f => ({
        ...f,
        modifiedTime: f.customTimestamp !== undefined ? f.customTimestamp : f.modifiedTime,
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
    <div className="container mx-auto p-6 max-w-3xl min-h-screen flex flex-col gap-6 text-slate-200">
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
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={reverseOrder}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 text-sm transition-colors border border-slate-700"
                title="一覧の順序を逆にする"
              >
                <ArrowDownUp className="w-4 h-4" />
                逆順
              </button>
              <button
                onClick={() => setSwapTimestampsOnReorder(!swapTimestampsOnReorder)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors border",
                  swapTimestampsOnReorder
                    ? "bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/30"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
                )}
                title={swapTimestampsOnReorder
                  ? "タイムスタンプを入れ替える (有効)"
                  : "タイムスタンプを入れ替える (無効)"}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>入れ替え</span>
                {swapTimestampsOnReorder && (
                  <span className="text-xs opacity-70">ON</span>
                )}
              </button>
            </div>
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

        {/* File List */}
        <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 overflow-y-auto min-h-[200px] max-h-[400px]">
          {files.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 italic">
              No files selected
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
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
                      onTimestampChange={(path: string, timestamp: number) => {
                        setFiles(prev => prev.map(f =>
                          f.path === path ? { ...f, customTimestamp: timestamp } : f
                        ));
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
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
