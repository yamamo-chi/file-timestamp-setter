import { useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileDropZoneProps {
    onFilesDropped: (files: string[]) => void;
    className?: string;
}

export function FileDropZone({ onFilesDropped: _onFilesDropped, onClick, className }: FileDropZoneProps & { onClick?: () => void }) {
    const [isDragging, setIsDragging] = useState(false);

    // Tauri handles file drops via the 'tauri://file-drop' event at the window level.
    // This component only provides visual feedback for drag states.
    // We don't use onDrop here to avoid interfering with Tauri's native event handling.

    return (
        <div
            className={cn(
                "border-2 border-dashed rounded-xl p-8 transition-all duration-200 ease-in-out flex flex-col items-center justify-center text-center cursor-pointer",
                isDragging
                    ? "border-blue-500 bg-blue-500/10 scale-[1.02]"
                    : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 bg-slate-900/50",
                className
            )}
            onClick={onClick}
            onDragEnter={() => {
                setIsDragging(true);
            }}
            onDragOver={(e) => {
                e.preventDefault(); // Necessary to allow drop
                if (!isDragging) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={() => {
                setIsDragging(false);
                // Let Tauri handle the actual file drop via 'tauri://file-drop' event
            }}
        >
            <div className="bg-slate-800 p-4 rounded-full mb-4">
                <Upload className={cn("w-8 h-8 text-slate-400", isDragging && "text-blue-400")} />
            </div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">
                {isDragging ? "Drop files here" : "Drag & drop files here"}
            </h3>
            <p className="text-sm text-slate-500 max-w-xs">
                Or click to browse
            </p>
        </div>
    );
}
