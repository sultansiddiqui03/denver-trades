'use client';

import React, { useRef } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import styles from '../DocAuditor.module.css';

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  base64: string;
}

interface DocColumnProps {
  label: string;
  typeBadge: string;
  text: string;
  file: UploadedFile | null;
  isDragOver: boolean;
  dropPromptText: string;
  textareaPlaceholder: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextChange: (text: string) => void;
  onRemoveFile: () => void;
}

export default function DocColumn({
  label,
  typeBadge,
  text,
  file,
  isDragOver,
  dropPromptText,
  textareaPlaceholder,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onTextChange,
  onRemoveFile,
}: DocColumnProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.docColumn}>
      <div className={styles.columnHeader}>
        <span>{label}</span>
        <span className={styles.typeBadge}>{typeBadge}</span>
      </div>

      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''} ${
          file ? styles.dropzoneCompleted : ''
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          type="file"
          ref={inputRef}
          className={styles.hiddenInput}
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          onChange={onFileChange}
        />

        {file ? (
          <div className={styles.fileDetails}>
            <span className={styles.fileIcon} aria-hidden>
              <FileText size={20} />
            </span>
            <div className={styles.fileMeta}>
              <p className={styles.fileName}>{file.name}</p>
              <p className={styles.fileSize}>
                {(file.size / 1024).toFixed(1)} KB · attached
              </p>
            </div>
            <button
              type="button"
              className={styles.removeFileBtn}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile();
              }}
              aria-label={`Remove ${file.name}`}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className={styles.dropPrompt}>
            <Upload size={28} strokeWidth={1.5} aria-hidden />
            <p>{dropPromptText}</p>
            <span className={styles.fileSupport}>PDF, image, or text file</span>
          </div>
        )}
      </div>

      {!file && (
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={textareaPlaceholder}
        />
      )}
    </div>
  );
}
