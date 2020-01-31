#!/usr/bin/env node

const p = require('path')
const fs = require('fs').promises
const rimraf = require('rimraf')
const mirrorFolder = require('mirror-folder')
const { promisify } = require('util')
const { SingleBar }  = require('cli-progress')

const Corestore = require('corestore')
const SwarmNetworker = require('corestore-swarm-networking')
const hyperdrive = require('hyperdrive')

const STORE_PATH = '.tmp-hypercore-store'

async function initialize (args) {
  const store = new Corestore(STORE_PATH)
  const drive = hyperdrive(store, args.key)
  const networker = new SwarmNetworker(store)

  await promisify(drive.ready.bind(drive))()
  await networker.listen()

  await networker.seed(drive.discoveryKey, { announce: false, lookup: true })
  await delay(500)

  return { drive, store, networker }
}

async function download (args) {
  let { drive, store, networker } = await initialize(args)
  try {
    await promisify(drive.metadata.update.bind(drive.metadata))({ ifAvailable: true })
  } catch (err) {
    // Suppress update error
  }

  let stats = null
  let total, downloaded = 0
  let updating = false
  await updateProgress()

  let progress = new SingleBar({ clearOnComplete: false })
  progress.start(total, downloaded)
  setInterval(updateProgressBar, 200)

  const mirror = mirrorFolder({ name: '/', fs: drive }, { name: args.output })
  mirror.on('put', src => {
    progress.update(downloaded, { filename: src })
  })
  mirror.on('end', oncomplete)
  mirror.on('error', onerror)

  process.once('SIGINT', onerror)
  process.once('SIGTERM', onerror)

  async function updateProgressBar () {
    await updateProgress()
    progress.update(downloaded)
  }

  async function updateProgress () {
    if (updating) return
    updating = true
    let newDownloaded = 0
    let newTotal = 0
    const newStats = await promisify(drive.stats.bind(drive))('/')
    for (const [file, fileStats] of newStats) {
      newDownloaded += fileStats.downloadedBlocks
      newTotal += fileStats.blocks
    }
    downloaded = newDownloaded
    total = newTotal
    stats = newStats
    updating = false
  }

  async function oncomplete () {
    await updateProgressBar()
    progress.stop()
    console.log('Download completed!')
    return cleanup(null, true)
    return oncomplete()
  }

  async function onerror (err) {
    if (!err || typeof err === 'number') console.log('Stopping download and exiting...')
    console.error('Stopping download due to error:', err)
    return cleanup(err, false)
  }

  async function cleanup (err, del) {
    console.log('Waiting for swarm networker to close...')
    await networker.close()
    console.log('Waiting for corestore to close...')
    await promisify(store.close.bind(store))()
    if (del) {
      console.log('Cleaning up temporary corestore...')
      await promisify(rimraf)(STORE_PATH)
    }
    console.log('Done cleaning up!')
    process.exit(!!err)
  }
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const args = require('yargs')
  .command('$0 [key] [output]', 'Copy the contents of a Hyperdrive to an output directory', yargs => {
    yargs.positional('key', {
      describe: 'The Hyperdrive key',
      type: 'string',
      coerce: arg => {
        if (arg.length !== 64) throw new Error('The key argument must be a valid Hyperdrive key')
        return arg
      }
    })
    yargs.positional('output', {
      describe: 'The output directory',
      type: 'string',
      default: process.cwd()
    })
    .demandOption(['key'])
    .help()
  })
 .demandCommand(1)
 .argv
download(args)

