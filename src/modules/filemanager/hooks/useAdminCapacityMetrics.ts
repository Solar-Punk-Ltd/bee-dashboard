import { useMemo } from 'react'
import { PostageBatch } from '@ethersphere/bee-js'
import { DriveInfo, estimateDriveListMetadataSize } from '@solarpunkltd/file-manager-lib'
import { calculateStampCapacityMetrics } from '../utils/bee'
import { getHumanReadableFileSize } from '../../../utils/file'

interface CapacityMetrics {
  capacityPct: number
  usedSize: string
  totalSize: string
}

export function useAdminCapacityMetrics(
  actualStamp: PostageBatch | null,
  adminDrive: DriveInfo | null,
  drives: DriveInfo[],
): CapacityMetrics {
  return useMemo(() => {
    if (!actualStamp) {
      return {
        capacityPct: 0,
        usedSize: '—',
        totalSize: '—',
      }
    }

    // upper limit estimate on the drivelist metadata state size based on the number of drives and files
    const estimatedDlSizeBytes = estimateDriveListMetadataSize(drives) * drives.length
    const {
      capacityPct: reportedPct,
      usedBytes: reportedUsedBytes,
      stampSizeBytes,
    } = calculateStampCapacityMetrics(actualStamp, [], adminDrive?.redundancyLevel)
    const actualUsedSizeBytes = Math.max(reportedUsedBytes, estimatedDlSizeBytes)
    const actualPct = Math.max(reportedPct, (actualUsedSizeBytes / stampSizeBytes) * 100)

    return {
      capacityPct: actualPct,
      usedSize: getHumanReadableFileSize(actualUsedSizeBytes),
      totalSize: getHumanReadableFileSize(stampSizeBytes),
    }
  }, [actualStamp, adminDrive, drives])
}
