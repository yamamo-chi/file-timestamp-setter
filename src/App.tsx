import React, { useState } from "react";
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
import { ArrowDownAZ, ArrowUpAZ, Clock, Trash2 } from "lucide-react";
import { cn } from "./lib/utils";

function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [seconds, setSeconds] = useState<number>(0);
  const [intervalValue, setIntervalValue] = useState<number>(0);
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes' | 'hours'>('seconds');
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleFilesDropped = (newFiles: string[]) => {
    setFiles((prev) => {
      // Filter duplicates and invalid inputs
      const uniqueNewFiles = newFiles
        .filter((f) => f && typeof f === 'string' && !prev.includes(f));
      return [...prev, ...uniqueNewFiles];
    });
    setMessage("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeFile = (fileToRemove: string) => {
    setFiles(files.filter((f) => f !== fileToRemove));
  };

  const clearFiles = () => {
    setFiles([]);
    setMessage("");
  };

  const sortFiles = (direction: 'asc' | 'desc') => {
    setFiles((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const nameA = a.split(/[/\\]/).pop()?.toLowerCase() || "";
        const nameB = b.split(/[/\\]/).pop()?.toLowerCase() || ""; // Fixed nameB
        return direction === 'asc'
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      });
      return sorted;
    });
  };

  // Debug logging
  const log = (msg: string) => {
    // Append to message for user visibility if needed, or just keep latest
    setMessage(prev => prev ? `${prev}\n${msg}` : msg);
  };

  React.useEffect(() => {
    // Listener for 'tauri://file-drop' (standard v1/v2 file drop)
    const unlistenFileDropPromise = listen('tauri://file-drop', (event) => {
      log(`tauri://file-drop event received: ${JSON.stringify(event)}`);
      // Standard payload is string[]
      const payloadFiles = event.payload as string[];
      if (payloadFiles && Array.isArray(payloadFiles) && payloadFiles.length > 0) {
        handleFilesDropped(payloadFiles);
      } else {
        log("tauri://file-drop received but no files found in payload or invalid format.");
      }
    });

    // Listener for 'tauri://drag-drop' (possibly used in reference project or some v2 contexts)
    const unlistenDragDropPromise = listen('tauri://drag-drop', (event) => {
      log(`tauri://drag-drop event received: ${JSON.stringify(event)}`);
      // Reference project payload: { paths: string[] }
      const payload = event.payload as { paths: string[] } | undefined;
      if (payload && payload.paths && Array.isArray(payload.paths) && payload.paths.length > 0) {
        handleFilesDropped(payload.paths);
      } else {
        log("tauri://drag-drop received but invalid payload format.");
      }
    });

    const unlistenHoverPromise = listen('tauri://file-drop-hover', (event) => {
      // Just log for debugging, don't spam UI
      console.log("Hover: ", event);
    });

    const unlistenCancelledPromise = listen('tauri://file-drop-cancelled', () => {
      console.log("Cancelled");
    });

    // Custom event emitted manually from Rust
    const unlistenCustomPromise = listen('file-dropped-custom', (event) => {
      log(`Custom file drop event received: ${JSON.stringify(event)}`);
      const payload = event.payload as string[];
      if (payload && Array.isArray(payload) && payload.length > 0) {
        handleFilesDropped(payload);
      }
    });

    return () => {
      unlistenFileDropPromise.then(unlisten => unlisten());
      unlistenDragDropPromise.then(unlisten => unlisten());
      unlistenCustomPromise.then(unlisten => unlisten());
      unlistenHoverPromise.then(unlisten => unlisten());
      unlistenCancelledPromise.then(unlisten => unlisten());
    };
  }, []);

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
      log(`Error opening file dialog: ${err}`);
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
      // Base timestamp (with seconds added)
      const baseDate = new Date(selectedDate);
      baseDate.setSeconds(seconds);
      const baseTimestamp = Math.floor(baseDate.getTime() / 1000);

      // Calculate interval in seconds
      let intervalSeconds = 0;
      if (intervalValue > 0) {
        switch (intervalUnit) {
          case 'seconds':
            intervalSeconds = intervalValue;
            break;
          case 'minutes':
            intervalSeconds = intervalValue * 60;
            break;
          case 'hours':
            intervalSeconds = intervalValue * 3600;
            break;
        }
      }

      await invoke("set_file_times_with_interval", {
        files,
        baseTimestamp,
        intervalSeconds,
      });
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
        {/* Date Selection */}
        <section className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              更新日時
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="datetime-local"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                />
                <Clock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  placeholder="秒"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-center"
                />
                <div className="text-xs text-slate-500 text-center mt-1">秒</div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              間隔設定（複数ファイルを順番に設定）
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={intervalValue}
                onChange={(e) => setIntervalValue(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-32 bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as 'seconds' | 'minutes' | 'hours')}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              >
                <option value="seconds">秒</option>
                <option value="minutes">分</option>
                <option value="hours">時間</option>
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              プラス値: 下に行くほど新しい時刻（昇順） / マイナス値: 下に行くほど古い時刻（降順）
            </p>
          </div>
        </section>

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
                onClick={() => sortFiles('asc')}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 text-sm transition-colors border border-slate-700"
              >
                <ArrowDownAZ className="w-4 h-4" /> Name Asc
              </button>
              <button
                onClick={() => sortFiles('desc')}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 text-sm transition-colors border border-slate-700"
              >
                <ArrowUpAZ className="w-4 h-4" /> Name Desc
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearFiles}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-sm transition-colors border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" /> Clear All
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
                items={files}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <SortableItem
                      key={file}
                      id={file}
                      filePath={file}
                      onRemove={removeFile}
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
