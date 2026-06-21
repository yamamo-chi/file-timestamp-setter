import { useState, useRef, type CSSProperties } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileDropZoneProps {
    onFilesDropped: (files: string[]) => void;
    className?: string;
}

export function FileDropZone({ onFilesDropped: _onFilesDropped, onClick, className }: FileDropZoneProps & { onClick?: () => void }) {
    const [isDragging, setIsDragging] = useState(false);
    // Counts nested dragenter/dragleave events. Dragging over child elements fires
    // dragleave on the parent immediately followed by dragenter, which would otherwise
    // toggle isDragging rapidly and cause flickering. We only clear the dragging state
    // once the counter returns to 0 (i.e. the drag truly left the drop zone).
    const dragCounter = useRef(0);

    // Wails handles file drops via the 'OnFileDrop' runtime event at the window level.
    // This component only provides visual feedback for drag states.
    // We don't use onDrop here to avoid interfering with Wails' native event handling.

    return (
        <div
            // Wails identifies the drop target via this CSS custom property (default: --wails-drop-target: drop).
            // OnFileDrop is registered with useDropTarget=true, so without this the drop callback never fires.
            style={{ '--wails-drop-target': 'drop' } as CSSProperties}
            className={cn(
                "border-2 border-dashed rounded-xl p-8 transition-all duration-200 ease-in-out flex flex-col items-center justify-center text-center cursor-pointer",
                isDragging
                    ? "border-blue-500 bg-blue-500/10 scale-[1.02]"
                    : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 bg-slate-900/50",
                className
            )}
            onClick={onClick}
            onDragEnter={() => {
                dragCounter.current += 1;
                setIsDragging(true);
            }}
            onDragOver={(e) => {
                e.preventDefault(); // Necessary to allow drop
            }}
            onDragLeave={() => {
                dragCounter.current -= 1;
                if (dragCounter.current <= 0) {
                    dragCounter.current = 0;
                    setIsDragging(false);
                }
            }}
            onDrop={() => {
                dragCounter.current = 0;
                setIsDragging(false);
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
