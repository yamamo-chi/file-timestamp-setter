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
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileDropZone } from "./components/FileDropZone";
import { SortableItem } from "./components/SortableItem";
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

      // Insert new files at positions that match their timestamp order
      setFiles((prev) => {
        // Combine existing and new files
        const combined = [...prev, ...newFileInfos];

        // Sort by timestamp (descending) to determine position
        const sorted = [...combined].sort((a, b) => {
          const timestampA = a.customTimestamp ?? a.modifiedTime;
          const timestampB = b.customTimestamp ?? b.modifiedTime;
          return timestampB - timestampA;
        });

        // For each new file, insert it at its sorted position
        const result = [...prev];
        newFileInfos.forEach(newFile => {
          const sortedIndex = sorted.findIndex(f => f.path === newFile.path);
          result.splice(sortedIndex, 0, newFile);
        });

        return result;
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(f => f.path === active.id);
        const newIndex = items.findIndex(f => f.path === over.id);

        return arrayMove(items, oldIndex, newIndex);
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
