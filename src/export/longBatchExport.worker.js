/// <reference lib="webworker" />

import { strToU8, zip } from 'fflate';
import { buildLongBatchAnalysisFiles } from './longBatchExport.js';

self.onmessage = event => {
  const { requestId, trades, descriptor, options } = event.data ?? {};
  try {
    self.postMessage({ requestId, type: 'progress', phase: 'PREPARING', percent: 10 });
    const packageData = buildLongBatchAnalysisFiles(trades, descriptor, options);
    const entries = Object.fromEntries(
      Object.entries(packageData.files).map(([path, content]) => [path, strToU8(content)]),
    );

    self.postMessage({ requestId, type: 'progress', phase: 'COMPRESSING', percent: 55 });
    zip(entries, { level: 6, mem: 8 }, (error, zipped) => {
      if (error) {
        self.postMessage({ requestId, type: 'error', message: error.message ?? String(error) });
        return;
      }
      const arrayBuffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
      self.postMessage({
        requestId,
        type: 'complete',
        fileName: packageData.fileName,
        manifest: packageData.manifest,
        batchSummary: packageData.batchSummary,
        arrayBuffer,
      }, [arrayBuffer]);
    });
  } catch (error) {
    self.postMessage({ requestId, type: 'error', message: error?.message ?? String(error) });
  }
};
