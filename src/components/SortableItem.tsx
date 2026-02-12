import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { File as FileIcon, GripVertical, X, Calendar, Edit2, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface FileInfo {
    path: string;
    modifiedTime: number;
    customTimestamp?: number;
}

interface SortableItemProps {
    id: string;
    fileInfo: FileInfo;
    onRemove: (path: string) => void;
    onTimestampChange: (path: string, timestamp: number) => void;
}

export function SortableItem({ id, fileInfo, onRemove, onTimestampChange }: SortableItemProps) {
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
    const [isEditingTimestamp, setIsEditingTimestamp] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editSeconds, setEditSeconds] = useState(0);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    // Extract filename from path for display
    const fileName = fileInfo.path ? fileInfo.path.split(/[/\\]/).pop() : "Unknown";

    // Get the timestamp to display (custom or original)
    const displayTimestamp = fileInfo.customTimestamp ?? fileInfo.modifiedTime;
    const displayDate = new Date(displayTimestamp * 1000);
    const formattedDate = format(displayDate, 'yyyy-MM-dd HH:mm:ss');

    // Check if file is an image based on extension
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const isImage = imageExtensions.some(ext =>
        fileInfo.path.toLowerCase().endsWith(ext)
    );

    // Load image data from backend
    useEffect(() => {
        if (isImage && !imageError) {
            invoke<string>('get_image_data', { filePath: fileInfo.path })
                .then(dataUrl => {
                    setImageSrc(dataUrl);
                })
                .catch(err => {
                    console.error('Failed to load image:', err);
                    setImageError(true);
                });
        }
    }, [fileInfo.path, isImage, imageError]);

    const handleEditClick = () => {
        const dateToEdit = new Date(displayTimestamp * 1000);
        setEditDate(format(dateToEdit, "yyyy-MM-dd'T'HH:mm"));
        setEditSeconds(dateToEdit.getSeconds());
        setIsEditingTimestamp(true);
    };

    const handleSaveTimestamp = () => {
        const date = new Date(editDate);
        date.setSeconds(editSeconds);
        const timestamp = Math.floor(date.getTime() / 1000);
        onTimestampChange(fileInfo.path, timestamp);
        setIsEditingTimestamp(false);
    };

    const handleCancelEdit = () => {
        setIsEditingTimestamp(false);
    };

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
                <p className="text-xs text-slate-500 truncate" title={fileInfo.path}>
                    {fileInfo.path}
                </p>
                {!isEditingTimestamp ? (
                    <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-200">
                            {formattedDate}
                        </span>
                        {fileInfo.customTimestamp !== undefined && (
                            <span className="text-xs text-blue-400 font-medium">(編集済み)</span>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick();
                            }}
                            className="p-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                            aria-label="Edit timestamp"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                            <input
                                type="datetime-local"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none [color-scheme:dark]"
                            />
                            <input
                                type="number"
                                min="0"
                                max="59"
                                value={editSeconds}
                                onChange={(e) => setEditSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                placeholder="秒"
                                className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-1 text-xs text-white text-center focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <span className="text-[10px] text-slate-500">秒</span>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={handleSaveTimestamp}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                            >
                                <Check className="w-3 h-3" /> 保存
                            </button>
                            <button
                                onClick={handleCancelEdit}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(fileInfo.path);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                aria-label="Remove file"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
