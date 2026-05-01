/**
 * @file frontend/src/components/documents/DocumentViewer.jsx
 * @description Document preview modal — inline image / PDF rendering with download fallback for unsupported types
 * @author Dev B
 *
 * The viewer pulls the file from the authenticated download endpoint as a
 * Blob (so we get the auth headers right) and renders an in-memory object
 * URL into a `<img>` (for images) or `<iframe>` (for PDFs). Other types
 * fall back to a download button + metadata card.
 */

import { useEffect, useRef, useState } from 'react';
import * as documentApi from '../../api/documentApi';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Determine the preview mode from the resolved Content-Type / filename.
 * We only inline image and PDF — everything else gets a download fallback.
 */
const detectMode = (contentType, filename) => {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'application/pdf') return 'pdf';

  // Fallback to extension when the server didn't surface a Content-Type.
  const lower = String(filename || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return 'image';
  if (/\.pdf$/.test(lower)) return 'pdf';
  return 'unsupported';
};

/**
 * DocumentViewer — modal preview for a single document.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object|null} props.document - Document row from the list (uses
 *   id, emertimi, lloji, file_path, data_ngarkimit, data_skadimit, employee_name)
 * @returns {JSX.Element|null}
 */
const DocumentViewer = ({ isOpen, onClose, document: doc }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mode, setMode] = useState('unsupported');
  const [downloading, setDownloading] = useState(false);
  const blobUrlRef = useRef(null);

  const { addToast } = useToast();

  /**
   * Fetch the file as a Blob and create an object URL for inline preview.
   * Cleans up the URL on unmount or when the document changes to avoid
   * leaking blobs.
   */
  useEffect(() => {
    if (!isOpen || !doc?.id) return undefined;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);

      // Tear down any previous URL before fetching the next one.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
        setPreviewUrl(null);
      }

      try {
        const { blob, filename, contentType } = await documentApi.downloadAsBlob(
          doc.id
        );
        if (cancelled) return;

        const detected = detectMode(contentType, filename || doc.file_path);
        setMode(detected);

        if (detected === 'unsupported') {
          // Don't even build an object URL — we won't preview, just
          // surface a download button. Helps GC the Blob immediately.
          setPreviewUrl(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.message || 'Failed to load document preview'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isOpen, doc?.id, doc?.file_path]);

  /** Trigger a browser download via the api helper. */
  const handleDownload = async () => {
    if (!doc?.id) return;
    setDownloading(true);
    try {
      await documentApi.download(doc.id, doc.emertimi);
      addToast(`Downloaded "${doc.emertimi}"`, 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to download document';
      addToast(msg, 'error');
    } finally {
      setDownloading(false);
    }
  };

  /** Open the document in a new browser tab — works for images and PDFs. */
  const handleOpenInTab = () => {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  if (!doc) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={doc.emertimi || 'Document'} size="xl">
      <div className="space-y-4">
        {/* Metadata strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {doc.lloji && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium capitalize bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {doc.lloji}
            </span>
          )}
          {doc.employee_name && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
              {doc.employee_name}
            </span>
          )}
          {doc.data_ngarkimit && (
            <span className="text-gray-500">
              Uploaded {formatDate(doc.data_ngarkimit)}
            </span>
          )}
          {doc.data_skadimit && (
            <span className="text-gray-500">
              · Expires {formatDate(doc.data_skadimit)}
            </span>
          )}
        </div>

        {/* Preview body */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 min-h-[420px] flex items-center justify-center overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className="text-center p-8">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <p className="text-xs text-gray-500 mt-1">
                You can still download the file using the button below.
              </p>
            </div>
          ) : mode === 'image' && previewUrl ? (
            <img
              src={previewUrl}
              alt={doc.emertimi}
              className="max-h-[70vh] w-auto object-contain"
            />
          ) : mode === 'pdf' && previewUrl ? (
            <iframe
              src={previewUrl}
              title={doc.emertimi}
              className="w-full h-[70vh] border-0 bg-white"
            />
          ) : (
            <div className="text-center p-8 max-w-md">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="mt-3 text-sm font-medium text-gray-900">
                Preview not available
              </p>
              <p className="text-xs text-gray-500 mt-1">
                This file type can't be displayed inline. Use the button
                below to download and open it in your local viewer.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            {doc.file_path && (
              <span className="font-mono">
                {String(doc.file_path).split('/').pop()}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {previewUrl && (mode === 'image' || mode === 'pdf') && (
              <button
                type="button"
                onClick={handleOpenInTab}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Open in new tab
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
                />
              </svg>
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DocumentViewer;
