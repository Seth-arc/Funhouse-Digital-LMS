import React, { useEffect, useRef } from 'react';
import './WysiwygEditor.css';

interface WysiwygEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write lesson content...',
  minHeight = 240,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || '';
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerHTML);
  };

  const exec = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const normalizeUrl = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
      return trimmed;
    }
    return null;
  };

  const addLink = () => {
    const url = window.prompt('Enter link URL (https://...)');
    if (!url) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    exec('createLink', normalized);
  };

  const addImage = () => {
    const url = window.prompt('Enter image URL (https://...)');
    if (!url) return;
    const normalized = normalizeUrl(url);
    if (!normalized || normalized.startsWith('mailto:')) return;
    exec('insertImage', normalized);
  };

  return (
    <div className="wysiwyg">
      <div className="wysiwyg-toolbar" role="toolbar" aria-label="Lesson content formatting">
        <button type="button" title="Paragraph" onClick={() => exec('formatBlock', 'P')}>P</button>
        <button type="button" title="Heading 2" onClick={() => exec('formatBlock', 'H2')}>H2</button>
        <button type="button" title="Heading 3" onClick={() => exec('formatBlock', 'H3')}>H3</button>
        <button type="button" title="Bold" onClick={() => exec('bold')}><strong>B</strong></button>
        <button type="button" title="Italic" onClick={() => exec('italic')}><em>I</em></button>
        <button type="button" title="Bulleted list" onClick={() => exec('insertUnorderedList')}>List</button>
        <button type="button" title="Numbered list" onClick={() => exec('insertOrderedList')}>1. List</button>
        <button type="button" title="Insert link" onClick={addLink}>Link</button>
        <button type="button" title="Insert image" onClick={addImage}>Image</button>
        <button type="button" title="Clear formatting" onClick={() => exec('removeFormat')}>Clear</button>
      </div>

      <div
        ref={editorRef}
        className="wysiwyg-editor"
        contentEditable
        style={{ minHeight }}
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
      />
    </div>
  );
};

export default WysiwygEditor;
