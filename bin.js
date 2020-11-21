#!/usr/bin/env node
const p = require('path')
const fs = require('fs').promises
const tmp = require('tmp-promise')
const mirrorFolder = require('mirror-folder')
const { SingleBar }  = require('cli-progress')

const Corestore = require('corestore')
const SwarmNetworker = require('@corestore/networker')
const hyperdrive = require('hyperdrive')

const STORE_PATH = '.tmp-hypercore-store'

async function initialize (args, opts = {}) {
  const tmpDir = await tmp.dir({ unsafeCleanup: true })
  const store = new Corestore(tmpDir.path)
  const drive = hyperdrive(store, args.key)
  const networker = new SwarmNetworker(store)

  await drive.promises.ready()
  await networker.join(drive.discoveryKey, { announce: opts.announce, lookup: opts.lookup })

  if (opts.wait) {
    console.log('Waiting for a connection...')
    await new Promise(resolve => {
      drive.metadata.on('peer-add', resolve)
    })
  }

  return { drive, store, networker, cleanup }

  async function cleanup (err, del) {
    console.log('Waiting for swarm networker to close...')
    await networker.close()
    console.log('Waiting for corestore to close...')
    await store.close()
    if (del) await tmpDir.cleanup()
    process.exit(!!err)
  }
}

async function copy (args) {
  let { drive, store, networker } = await initialize(args, {
    wait: true,
    announce: false,
    lookup: true
  })

  let stats = null
  let total, downloaded = 0
  let updating = false
  await updateProgress()

  let progress = new SingleBar({ clearOnComplete: false })
  progress.start(total, downloaded)
  setInterval(updateProgressBar, 200)

  const mirror = mirrorFolder({ name: '/', fs: drive }, { name: args.output }, { keepExisting: true })
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
    const newStats = await drive.promises.stats('/')
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
  }

  async function onerror (err) {
    if (!err || typeof err === 'number') console.log('Stopping download and exiting...')
    console.error('Stopping download due to error:', err)
    return cleanup(err, false)
  }

}

async function create (args) {
  let { drive, store, networker } = await initialize(args, {
    wait: false,
    announce: true,
    lookup: false
  })

  console.log(`Copying folder ${args.input} into drive...`)

  const mirror = mirrorFolder(args.input, { name: '/', fs: drive })
  mirror.on('end', oncomplete)
  mirror.on('error', onerror)

  process.once('SIGINT', onerror)
  process.once('SIGTERM', onerror)

  async function oncomplete () {
    console.log('Copy finished!')
    console.log(`Drive Key: ${drive.key.toString('hex')}`)
    return cleanup(null, true)
  }

  async function onerror (err) {
    if (!err || typeof err === 'number') console.log('Stopping creation and exiting...')
    console.error('Stopping creation due to error:', err)
    return cleanup(err, true)
  }
}

require('yargs')
  .command(['copy <key> [output]', '$0'], 'Copy the contents of a Hyperdrive into an output directory', yargs => {
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
  }, copy)
  .command('create <input> [storage]', 'Create and seed a new Hyperdrive from an input directory', yargs => {
    yargs.positional('input', {
      describe: 'The input directory',
      type: 'string',
      coerce: arg => p.resolve(arg),
    })
    yargs.positional('storage', {
      describe: 'The output storage directory',
      type: 'string',
      coerce: arg => p.resolve(arg)
    })
  }, create)
 .demandCommand(1)
 .argv
