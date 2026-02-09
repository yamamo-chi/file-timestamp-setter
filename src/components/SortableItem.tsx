import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { File as FileIcon, GripVertical, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface SortableItemProps {
    id: string;
    filePath: string;
    onRemove: (id: string) => void;
}

export function SortableItem({ id, filePath, onRemove }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const [imageError, setImageError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    // Extract filename from path for display
    const fileName = filePath ? filePath.split(/[/\\]/).pop() : "Unknown";

    // Check if file is an image based on extension
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const isImage = imageExtensions.some(ext =>
        filePath.toLowerCase().endsWith(ext)
    );

    // Load image data from backend
    useEffect(() => {
        if (isImage && !imageError) {
            invoke<string>('get_image_data', { filePath })
                .then(dataUrl => {
                    setImageSrc(dataUrl);
                })
                .catch(err => {
                    console.error('Failed to load image:', err);
                    setImageError(true);
                });
        }
    }, [filePath, isImage, imageError]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={cn(
                "group relative flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/80 transition-colors",
                isDragging && "shadow-xl ring-2 ring-blue-500/50 bg-slate-800 z-10"
            )}
        >
            <div
                {...listeners}
                className="text-slate-600 group-hover:text-slate-400 p-1 cursor-grab active:cursor-grabbing touch-none"
            >
                <GripVertical className="w-5 h-5" />
            </div>

            {/* Image preview or file icon */}
            {isImage && !imageError && imageSrc ? (
                <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-900 shrink-0 border border-slate-700">
                    <img
                        src={imageSrc}
                        alt={fileName}
                        className="w-full h-full object-cover"
                        onError={() => setImageError(true)}
                    />
                </div>
            ) : (
                <FileIcon className="w-5 h-5 text-blue-400 shrink-0" />
            )}

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate" title={filePath}>
                    {fileName}
                </p>
                <p className="text-xs text-slate-500 truncate" title={filePath}>
                    {filePath}
                </p>
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(id);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                aria-label="Remove file"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
