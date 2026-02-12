#!/usr/bin/env node

import envPaths from 'env-paths'
import open from 'open'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const port = process.env.PORT || 8080

const paths = envPaths('Swarm Desktop', { suffix: '' })
const apiKey = await readFile(join(paths.data, 'api-key.txt'), { encoding: 'utf-8' })
const url = `http://localhost:${port}/?v=${apiKey}#/`

// eslint-disable-next-line no-undef
console.log('Opening: ' + url)
await open(url)
