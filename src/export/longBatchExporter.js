// Browser-facing batch exporter. Heavy schema projection and ZIP compression run
// in a module Web Worker so the LongLAB cockpit remains responsive.

import { createLongBatchWorkerSnapshot } from './longBatchExportTransport.js';

function requestId() {
  return `long-batch-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Large browser downloads may not acquire the Blob immediately. Keep the URL
  // alive long enough for the download manager without navigating the app.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function exportLongBatchAnalysisZip({
  trades,
  descriptor,
  sideFilter = 'all',
  onProgress = () => {},
}) {
  return new Promise((resolve, reject) => {
    if (!descriptor) {
      reject(new Error('Select a LongLAB batch before exporting.'));
      return;
    }

    const id = requestId();
    const worker = new Worker(new URL('./longBatchExport.worker.js', import.meta.url), { type: 'module' });
    let settled = false;

    const finish = callback => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };

    worker.onerror = event => finish(() => reject(new Error(event?.message ?? 'Batch export worker failed.')));
    worker.onmessage = event => {
      const message = event.data ?? {};
      if (message.requestId !== id) return;
      if (message.type === 'progress') {
        onProgress({ phase: message.phase, percent: message.percent });
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(message.message ?? 'Batch export failed.')));
        return;
      }
      if (message.type === 'complete') {
        const blob = new Blob([message.arrayBuffer], { type: 'application/zip' });
        downloadBlob(blob, message.fileName);
        onProgress({ phase: 'COMPLETE', percent: 100 });
        finish(() => resolve({
          fileName: message.fileName,
          manifest: message.manifest,
          batchSummary: message.batchSummary,
          sizeBytes: blob.size,
        }));
      }
    };

    onProgress({ phase: 'SNAPSHOTTING', percent: 5 });
    const workerTrades = createLongBatchWorkerSnapshot(trades);
    onProgress({ phase: 'QUEUED', percent: 8 });
    worker.postMessage({
      requestId: id,
      trades: workerTrades,
      descriptor,
      options: { sideFilter, alreadySelected: true },
    });
  });
}
