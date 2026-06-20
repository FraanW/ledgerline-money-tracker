import React from "react";
import { Card, Badge, Button, ScreenShell } from "./primitives";
import { PageRemark } from "./PageRemark";
import type { StatementUploadResult } from "../mocks/fixtures";

/**
 * v0 ingestion front door: upload a bank statement (CSV). Shows the post-upload
 * result (accepted / duplicates / errors). Layout seam: the dropzone region is
 * slotted so a playful (Gen-Z) vs plain (Senior) treatment swaps in cleanly.
 */
export function UploadScreen({
  result,
  dropzone,
}: {
  result?: StatementUploadResult;
  dropzone?: React.ReactNode;
}) {
  return (
    <ScreenShell
      title="Upload a statement"
      subtitle="Drop a bank statement (CSV) and we’ll sort every transaction into your envelopes. Re-uploading is safe — duplicates are ignored."
    >
      <PageRemark screen="upload" />
      {dropzone ?? (
        <Card className="p-[calc(2rem*var(--ml-density))]">
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-border py-[calc(2.5rem*var(--ml-density))] text-center">
            <span className="text-[2.2em]" aria-hidden>📄</span>
            <p className="text-[1.05em] font-medium text-text">Drag a CSV here, or choose a file</p>
            <p className="text-[0.9em] text-text-muted">HDFC · ICICI · Axis exports supported</p>
            <Button>Choose file</Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-[calc(1.25rem*var(--ml-density))]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.85em] uppercase tracking-wide text-text-muted">Last upload</p>
              <p className="text-[1.05em] font-medium text-text">{result.fileName}</p>
            </div>
            <div className="flex gap-2">
              <Badge tone="positive">{result.accepted} added</Badge>
              <Badge tone="neutral">{result.duplicates} duplicates</Badge>
              {result.errors.length > 0 && <Badge tone="warning">{result.errors.length} skipped</Badge>}
            </div>
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-3 border-t border-border pt-3 text-[0.88em] text-text-muted">
              {result.errors.map((e) => (
                <li key={e.line} className="flex gap-2 py-0.5">
                  <span className="text-warning">Line {e.line}:</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </ScreenShell>
  );
}
