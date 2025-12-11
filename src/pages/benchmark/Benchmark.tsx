import { Size, Duration } from '@ethersphere/bee-js'
import { ReactElement, useContext, useEffect, useCallback, useState } from 'react'
import { handleCreateDrive } from 'src/modules/filemanager/utils/bee'

import { Context as SettingsContext } from '../../providers/Settings'
import { Context as FMContext } from '../../providers/FileManager'
import { Typography } from '@material-ui/core'

export function Benchmark(): ReactElement {
  const [runBenchmark, setRunBenchmark] = useState(false)

  const { beeApi } = useContext(SettingsContext)
  const { fm } = useContext(FMContext)

  const createOptions = useCallback(
    (label: string) => {
      return {
        beeApi,
        fm,
        size: Size.fromBytes(44700), // the test does not use this now
        duration: Duration.fromSeconds(86363), // 1 day plus 1 second but the test does not use this now
        label,
        encryption: false,
        redundancyLevel: 0,
        adminRedundancy: 0,
        isAdmin: false,
        resetState: false,
        existingBatch: null,
      }
    },
    [beeApi, fm],
  )

  useEffect(() => {
    async function benchmarkTask() {
      if (runBenchmark) {
        try {
          console.log('Benchmark started')

          const result = new Map<number, number>()

          for (let index = 0; index < 10; index++) {
            const start = performance.now()
            console.log(`Running Drive creation benchmark [${index}]`)
            await handleCreateDrive(createOptions(`Drive with SP NODE [${index}]`))

            // await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 100))

            const end = performance.now()
            const durationInSeconds = Math.round(end - start) / 1000
            result.set(index, durationInSeconds)
            console.log(`Drive creation benchmark [${index}] finished in ${durationInSeconds} s`)
            console.log('')
            console.log('=================================')
          }

          console.log('Benchmark finished')

          console.table(Array.from(result.entries()).map(([k, v]) => ({ run: k, durationInSeconds: v })))

          console.log('Average duration (s):', Array.from(result.values()).reduce((a, b) => a + b, 0) / result.size)
        } finally {
          setRunBenchmark(false)
        }
      }
    }
    benchmarkTask()
  }, [runBenchmark])

  return (
    <div>
      <Typography variant="h1">Benchmark Page</Typography>
      <Typography variant="body2" gutterBottom>
        Before starting benchmark make sure that your admin drive is initialized
      </Typography>
      <button disabled={runBenchmark} onClick={() => setRunBenchmark(true)}>
        Start Benchmark
      </button>
    </div>
  )
}
