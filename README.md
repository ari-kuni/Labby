# Labby

Labby is a locally hosted document organization prototype designed for research laboratories. The app focuses on document upload, metadata management, version tracking, and version comparison for scientific workflows.

## Features implemented

- Document library with normalized document types, title/tag/author search, author and type filters, date-range filters, and sorting
- Upload modal for multiple local files
- Support for PDF, DOCX, TXT, CSV, XLSX, PPTX, and common source-code file types
- Collapsible document metadata with in-place editing
- Sticky document action toolbar, downloadable current versions, and resizable document panels
- Client-side PDF text and embedded-metadata extraction, with publication metadata review
- Editable document and publication metadata, including date overrides separate from extracted dates
- Read-only upload timestamps
- Version history and current-version tracking
- Side-by-side and unified version comparison
- IndexedDB persistence for browser-local document state
- Demo data for cardiovascular, cancer, and musculoskeletal workflows

## Local development

1. Install dependencies:
   npm install
2. Start the Vite dev server:
   npm run dev -- --host 0.0.0.0
3. Open the app in a browser at:
   http://localhost:5173/

## Production build

npm run build

## Notes and limitations

- This is a frontend prototype only; no backend or AI pipeline is connected. PDF extraction runs locally in the browser with PDF.js; text extraction is currently available for PDF, TXT, CSV, and MD files. DOCX, XLSX, and PPTX are accepted and stored locally, but their contents are not yet extracted.
- Code files (including Python, notebooks, MATLAB, R, JavaScript/TypeScript, Java, C/C++, HTML/CSS, SQL, JSON project files, and shell scripts) are retained and previewed as plain text; uploaded code is never executed. JSON is classified as Code only when its filename or contents indicate a project/configuration file.
- Upload progress reflects actual local file-reading progress when available; metadata extraction shows an indeterminate activity state because this prototype does not upload to a backend.
- Document list and detail panel proportions are saved in browser local storage. Drag the divider to resize, use its arrow keys for fine adjustments, or double-click it to restore the default split.
- Extraction status, diagnostics, and failures are shown during upload review. Uploaded-at timestamps are recorded when the user confirms the save.
- Existing research-group assignments and indexing metadata remain in local storage for compatibility; the primary interface no longer exposes group-management or indexing-status controls.
- File previews are intentionally limited to text-based formats for accurate content rendering.
- IndexedDB stores data locally in the browser; it is for prototype persistence and is not a secure lab document repository.
- Document comparison is text-based, using client-side diffing for supported text content.
