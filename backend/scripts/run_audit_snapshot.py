#!/usr/bin/env python3
"""Simple runner to invoke the audit snapshot exporter.

Usage:
  AUDIT_SIGNING_KEY=yourkey AUDIT_S3_BUCKET=your-bucket python3 run_audit_snapshot.py

This script is intended to be run in your deployment or dev environment where
`boto3` and DB dependencies are installed and configured.
"""
import asyncio
import os
import importlib

async def main():
    try:
        m = importlib.import_module('backend.audit_exporter')
    except Exception as e:
        print('Failed to import audit_exporter:', e)
        return
    try:
        res = await m.create_and_upload_snapshot()
        print('Snapshot result:', res)
    except Exception as e:
        print('Snapshot invocation failed:', e)

if __name__ == '__main__':
    asyncio.run(main())
