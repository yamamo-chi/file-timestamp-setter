import { useState } from 'react';
import { Calendar, Edit2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface FileInfo {
    path: string;
    modifiedTime: number;
    customTimestamp?: number;
}

interface TimestampColumnItemProps {
    fileInfo: FileInfo;
    onTimestampChange: (path: string, timestamp: number) => void;
}

export function TimestampColumnItem({ fileInfo, onTimestampChange }: TimestampColumnItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editSeconds, setEditSeconds] = useState(0);

    const displayTimestamp = fileInfo.customTimestamp ?? fileInfo.modifiedTime;
    const displayDate = new Date(displayTimestamp * 1000);
    const formattedDate = format(displayDate, 'yyyy-MM-dd HH:mm:ss');

    const handleEditClick = () => {
        const dateToEdit = new Date(displayTimestamp * 1000);
        setEditDate(format(dateToEdit, "yyyy-MM-dd'T'HH:mm"));
        setEditSeconds(dateToEdit.getSeconds());
        setIsEditing(true);
    };

    const handleSaveTimestamp = () => {
        const date = new Date(editDate);
        date.setSeconds(editSeconds);
        const timestamp = Math.floor(date.getTime() / 1000);
        // If timestamp matches original modifiedTime, clear customTimestamp (reset to original)
        if (timestamp === fileInfo.modifiedTime) {
            onTimestampChange(fileInfo.path, -1); // -1 signals to clear customTimestamp
        } else {
            onTimestampChange(fileInfo.path, timestamp);
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60 transition-colors",
            "min-h-[76px]"
        )}>
            {!isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                    <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-200">
                        {formattedDate}
                    </span>
                    {fileInfo.customTimestamp !== undefined && (
                        <span className="text-xs text-blue-400 font-medium">(編集済み)</span>
                    )}
                    <button
                        onClick={handleEditClick}
                        className="p-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 transition-all ml-auto"
                        aria-label="Edit timestamp"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <div className="flex-1 space-y-2">
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
    );
}
