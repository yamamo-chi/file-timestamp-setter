import { useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileDropZoneProps {
    onFilesDropped: (files: string[]) => void;
    className?: string;
}

export function FileDropZone({ onFilesDropped, onClick, className }: FileDropZoneProps & { onClick?: () => void }) {
    const [isDragging, setIsDragging] = useState(false);

    // We'll trust the parent to handle the actual file drop data via onFilesDropped
    // but we can still listen for hover to show visual feedback locally if needed,
    // or better yet, just use standard onDragEnter/Leave for CSS states.

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
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragging) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                // HTML5 fallback handled here for specific drop zone
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const paths: string[] = [];
                    // @ts-ignore
                    for (let i = 0; i < e.dataTransfer.files.length; i++) {
                        // @ts-ignore
                        const file = e.dataTransfer.files[i];
                        // Try to get path from various properties used by WebView2/Tauri
                        // @ts-ignore
                        const path = file.path || file.getAsFile?.()?.path || file.name;
                        // Note: Standard browser file.name is just name, but Tauri injects path often.
                        // If path is missing, this won't work for backend, but we can't do much else.
                        if (path && path.includes('\\') || path.includes('/')) {
                            paths.push(path);
                        } else {
                            // Debug log if needed
                            console.log("File object missing full path:", file);
                        }
                    }
                    if (paths.length > 0) {
                        onFilesDropped(paths);
                    }
                }
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
