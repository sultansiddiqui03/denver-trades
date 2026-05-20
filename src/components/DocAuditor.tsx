'use client';

import React, { useState } from 'react';
import { useToast } from '@/components/Toast';
import DocColumn, { type UploadedFile } from './docAudit/DocColumn';
import DocAuditResult, { type AuditData } from './docAudit/DocAuditResult';
import styles from './DocAuditor.module.css';

const SAMPLE_LC_MATCH = `LETTER OF CREDIT (L/C) - ADVICE NO: LC82739102
ISSUING BANK: EMIRATES NBD, DUBAI, UAE
APPLICANT: AL-RASHID FOODSTUFF TRADING LLC, DUBAI, UAE
BENEFICIARY: DENVER TRADES, VIETNAM BRANCH
COMMODITY: BLACK PEPPER 550G/L ASTA
QUANTITY: 32,000 KG (32 METRIC TONNES)
PORT OF LOADING: CAT LAI PORT, VIETNAM
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE
LATEST SHIPMENT DATE: 2026-06-15
PAYMENT TERMS: IRREVOCABLE L/C AT SIGHT`;

const SAMPLE_BL_MATCH = `BILL OF LADING (B/L) - NO: MSK93820182
CARRIER: MAERSK LINE
SHIPPER: DENVER TRADES, VIETNAM BRANCH
CONSIGNEE: TO ORDER OF EMIRATES NBD BANK
NOTIFY PARTY: AL-RASHID FOODSTUFF TRADING LLC, DUBAI, UAE
PORT OF LOADING: CAT LAI PORT, VIETNAM
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE
DESCRIPTION OF GOODS: 2 X 20FT CONTAINERS STC:
32,000 KG BLACK PEPPER 550G/L ASTA
ACTUAL SHIPPED ON BOARD DATE: 2026-06-10`;

const SAMPLE_LC_MISMATCH = `LETTER OF CREDIT (L/C) - ADVICE NO: LC91827301
ISSUING BANK: EMIRATES NBD, DUBAI, UAE
APPLICANT: GULF SPICES & SEEDS INDUSTRY, SHARJAH, UAE
BENEFICIARY: DENVER TRADES, INDIA BRANCH
COMMODITY: CORIANDER SEEDS WHOLE SPLIT
QUANTITY: 24,000 KG
PORT OF LOADING: MUNDRA PORT, INDIA
PORT OF DISCHARGE: SHARJAH PORT, UAE
LATEST SHIPMENT DATE: 2026-05-15
PAYMENT TERMS: IRREVOCABLE L/C AT SIGHT`;

const SAMPLE_BL_MISMATCH = `BILL OF LADING (B/L) - NO: CMA82739103
CARRIER: CMA CGM
SHIPPER: DENVER TRADES, INDIA BRANCH
CONSIGNEE: GULF SPICES & SEEDS INDUSTRY, SHARJAH, UAE
PORT OF LOADING: MUNDRA PORT, INDIA
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE
DESCRIPTION OF GOODS: 1 X 40FT CONTAINER STC:
23,850 KG CORIANDER SEEDS WHOLE SPLIT
ACTUAL SHIPPED ON BOARD DATE: 2026-05-18`;

function processFileToState(
  file: File,
  onLoad: (uploaded: UploadedFile, decodedText: string | null) => void
) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = (event.target?.result as string) ?? '';
    const uploaded: UploadedFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      base64,
    };

    let decoded: string | null = null;
    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      try {
        decoded = atob(base64.split(',')[1] ?? '');
      } catch {
        decoded = `[Document File: ${file.name}]`;
      }
    } else {
      decoded = `[Document File: ${file.name}]`;
    }

    onLoad(uploaded, decoded);
  };
  reader.readAsDataURL(file);
}

export default function DocAuditor() {
  const { toast } = useToast();
  const [textA, setTextA] = useState(SAMPLE_LC_MISMATCH);
  const [textB, setTextB] = useState(SAMPLE_BL_MISMATCH);
  const [fileA, setFileA] = useState<UploadedFile | null>(null);
  const [fileB, setFileB] = useState<UploadedFile | null>(null);
  const [isDragOverA, setIsDragOverA] = useState(false);
  const [isDragOverB, setIsDragOverB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditData | null>(null);

  const handlePreFill = (type: 'match' | 'mismatch') => {
    setFileA(null);
    setFileB(null);
    if (type === 'match') {
      setTextA(SAMPLE_LC_MATCH);
      setTextB(SAMPLE_BL_MATCH);
    } else {
      setTextA(SAMPLE_LC_MISMATCH);
      setTextB(SAMPLE_BL_MISMATCH);
    }
    setAuditResult(null);
  };

  const handleAudit = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/documents/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type_a: 'Letter of Credit',
          text_a: textA,
          file_a: fileA,
          doc_type_b: 'Bill of Lading',
          text_b: textB,
          file_b: fileB,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAuditResult(data.audit);
        const count = data.audit?.discrepancies?.length ?? 0;
        if (count === 0) {
          toast('Audit passed — no discrepancies found', 'success');
        } else {
          toast(
            `Audit complete — ${count} discrepanc${count === 1 ? 'y' : 'ies'} detected`,
            'warning'
          );
        }
      } else {
        console.error('Audit failed:', data.error);
        toast(data.error || 'Document audit failed', 'error');
      }
    } catch (error) {
      console.error('Error during document audit:', error);
      toast(error instanceof Error ? error.message : 'Error running document audit', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <div className={styles.preFillGroup}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => handlePreFill('mismatch')}
          >
            Pre-fill mismatched docs (fails audit)
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => handlePreFill('match')}
          >
            Pre-fill clean docs (passes audit)
          </button>
        </div>

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleAudit}
          disabled={loading || (!textA.trim() && !fileA) || (!textB.trim() && !fileB)}
        >
          {loading ? 'Analyzing compliance…' : 'Run compliance audit'}
        </button>
      </div>

      <div className={styles.splitGrid}>
        <DocColumn
          label="Document A: Letter of Credit (L/C)"
          typeBadge="UCP 600 Rules"
          text={textA}
          file={fileA}
          isDragOver={isDragOverA}
          dropPromptText="Drag & drop L/C document here, or click to upload"
          textareaPlaceholder="Or paste Letter of Credit instructions here…"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverA(true);
          }}
          onDragLeave={() => setIsDragOverA(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverA(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              processFileToState(file, (uploaded, decoded) => {
                setFileA(uploaded);
                if (decoded) setTextA(decoded);
              });
            }
          }}
          onFileChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              processFileToState(file, (uploaded, decoded) => {
                setFileA(uploaded);
                if (decoded) setTextA(decoded);
              });
            }
          }}
          onTextChange={setTextA}
          onRemoveFile={() => {
            setFileA(null);
            setTextA('');
          }}
        />

        <DocColumn
          label="Document B: Bill of Lading (B/L)"
          typeBadge="Carrier Issue"
          text={textB}
          file={fileB}
          isDragOver={isDragOverB}
          dropPromptText="Drag & drop B/L document here, or click to upload"
          textareaPlaceholder="Or paste Bill of Lading cargo details here…"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverB(true);
          }}
          onDragLeave={() => setIsDragOverB(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverB(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              processFileToState(file, (uploaded, decoded) => {
                setFileB(uploaded);
                if (decoded) setTextB(decoded);
              });
            }
          }}
          onFileChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              processFileToState(file, (uploaded, decoded) => {
                setFileB(uploaded);
                if (decoded) setTextB(decoded);
              });
            }
          }}
          onTextChange={setTextB}
          onRemoveFile={() => {
            setFileB(null);
            setTextB('');
          }}
        />
      </div>

      {auditResult && <DocAuditResult result={auditResult} />}
    </div>
  );
}
